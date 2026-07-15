import json
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from backend.database import get_db
from backend.auth import get_current_user
from backend.routes.projects import get_project_or_404
from backend.embeddings import get_embedding_provider
from backend.vector_store import get_vector_store
from backend.llm import get_llm_provider, SYSTEM_RAG_PROMPT

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

class SessionCreate(BaseModel):
    project_id: int
    title: str

class MessageCreate(BaseModel):
    session_id: int
    query: str
    stream: bool = True

def get_session_or_404(session_id: int, user: dict, db) -> dict:
    cursor = db.cursor()
    if user["role"] == "admin":
        session = cursor.execute("SELECT * FROM chat_sessions WHERE id = ?", (session_id,)).fetchone()
    else:
        session = cursor.execute(
            "SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?",
            (session_id, user["id"])
        ).fetchone()
        
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found or access denied"
        )
    return dict(session)

@router.get("/sessions", response_model=List[Dict[str, Any]])
def list_sessions(project_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    with get_db() as db:
        # Verify user has access to project
        get_project_or_404(project_id, current_user, db)
        
        sessions = db.execute(
            "SELECT * FROM chat_sessions WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,)
        ).fetchall()
        return [dict(s) for s in sessions]

@router.post("/sessions", response_model=Dict[str, Any])
def create_session(
    session: SessionCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as db:
        get_project_or_404(session.project_id, current_user, db)
        cursor = db.cursor()
        cursor.execute(
            "INSERT INTO chat_sessions (project_id, user_id, title) VALUES (?, ?, ?)",
            (session.project_id, current_user["id"], session.title)
        )
        db.commit()
        return {"id": cursor.lastrowid, "title": session.title}

@router.delete("/sessions/{session_id}", response_model=Dict[str, Any])
def delete_session(
    session_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as db:
        get_session_or_404(session_id, current_user, db)
        db.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
        db.commit()
        return {"message": "Chat session and history deleted successfully"}

@router.get("/sessions/{session_id}/messages", response_model=List[Dict[str, Any]])
def list_messages(
    session_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as db:
        get_session_or_404(session_id, current_user, db)
        messages = db.execute(
            "SELECT id, role, content, sources, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,)
        ).fetchall()
        
        result = []
        for m in messages:
            m_dict = dict(m)
            if m_dict["sources"]:
                try:
                    m_dict["sources"] = json.loads(m_dict["sources"])
                except Exception:
                    m_dict["sources"] = []
            else:
                m_dict["sources"] = []
            result.append(m_dict)
            
        return result

@router.post("/query")
def run_rag_query(
    message: MessageCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    session_id = message.session_id
    query = message.query.strip()
    
    if not query:
        raise HTTPException(status_code=400, detail="Query text cannot be empty")
        
    with get_db() as db:
        session = get_session_or_404(session_id, current_user, db)
        project_id = session["project_id"]
        
        # Load project details
        project = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        project = dict(project)
        
    # 1. Generate query embedding
    try:
        emb_provider = get_embedding_provider(project["embedding_model"])
        query_vector = emb_provider.get_embedding(query)
    except Exception as e:
        logger.error(f"Failed to generate query embedding: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Embedding API error: {e}"
        )
        
    # 2. Search NumPy Vector Store for matches
    vs = get_vector_store(project_id)
    matches = vs.search(query_vector, top_k=5)
    
    retrieved_chunks = []
    sources = []
    
    if matches:
        chunk_ids = [m[0] for m in matches]
        # Fetch chunk details from DB
        with get_db() as db:
            cursor = db.cursor()
            # Construct a parameterized list search
            placeholders = ",".join(["?"] * len(chunk_ids))
            query_str = f"""
                SELECT c.id, c.text_content, cp.url, cp.title 
                FROM chunks c 
                JOIN crawled_pages cp ON c.page_id = cp.id 
                WHERE c.id IN ({placeholders})
            """
            rows = cursor.execute(query_str, chunk_ids).fetchall()
            
            # Map database results back by matching similarity score order
            rows_by_id = {r["id"]: r for r in rows}
            for chunk_id, score in matches:
                if chunk_id in rows_by_id:
                    row = rows_by_id[chunk_id]
                    retrieved_chunks.append(row["text_content"])
                    # Deduplicate sources by URL
                    if not any(s["url"] == row["url"] for s in sources):
                        sources.append({
                            "url": row["url"],
                            "title": row["title"] or "Source page",
                            "snippet": row["text_content"][:200] + "..."
                        })
                        
    # 3. Construct prompt
    context_text = "\n\n".join([f"[Source: {s['title']}]\n{c}" for s, c in zip(sources, retrieved_chunks)])
    if not context_text:
        context_text = "(No relevant information found on website)"
        
    system_prompt = project.get("system_prompt") or SYSTEM_RAG_PROMPT
    # Fill in variables if template format matches SYSTEM_RAG_PROMPT
    if "{context}" in system_prompt and "{question}" in system_prompt:
        prompt_text = system_prompt.format(context=context_text, question=query)
        sys_instruction = "You are a helpful, strict Website RAG AI assistant."
    else:
        # If user defined custom prompt without formatting tags, fallback to basic wrap
        prompt_text = SYSTEM_RAG_PROMPT.format(context=context_text, question=query)
        sys_instruction = system_prompt
        
    # 4. Save User Message in database
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute(
            "INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)",
            (session_id, "user", query)
        )
        db.commit()
        
    # 5. Initialize LLM Provider
    try:
        llm = get_llm_provider(project["llm_model"])
    except Exception as e:
        logger.error(f"Failed to get LLM provider: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LLM initialization error: {e}"
        )
        
    # Track LLM Token usage (Approximate metrics for analytics)
    approx_tokens_used = (len(prompt_text) + len(sys_instruction)) // 4
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute(
            "INSERT INTO api_usage (user_id, project_id, api_type, tokens_used, model_name) VALUES (?, ?, ?, ?, ?)",
            (current_user["id"], project_id, "llm", approx_tokens_used, project["llm_model"])
        )
        db.commit()

    # 6. Return response (stream vs. static)
    if not message.stream:
        try:
            full_response = llm.generate_response(prompt_text, system_instruction=sys_instruction)
            # Save Assistant response to DB
            with get_db() as db:
                cursor = db.cursor()
                cursor.execute(
                    "INSERT INTO chat_messages (session_id, role, content, sources) VALUES (?, ?, ?, ?)",
                    (session_id, "assistant", full_response, json.dumps(sources))
                )
                db.commit()
            return {"role": "assistant", "content": full_response, "sources": sources}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        def stream_generator():
            full_response = ""
            try:
                # Stream content from LLM provider
                for chunk in llm.generate_response_stream(prompt_text, system_instruction=sys_instruction):
                    full_response += chunk
                    yield f"data: {json.dumps({'token': chunk})}\n\n"
                    
                # Write back finalized assistant statement to Database
                with get_db() as db:
                    cursor = db.cursor()
                    cursor.execute(
                        "INSERT INTO chat_messages (session_id, role, content, sources) VALUES (?, ?, ?, ?)",
                        (session_id, "assistant", full_response, json.dumps(sources))
                    )
                    db.commit()
                    
                # Yield final packet containing source citations array
                yield f"data: {json.dumps({'done': True, 'sources': sources})}\n\n"
                
            except Exception as e:
                logger.error(f"Error streaming response: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                
        return StreamingResponse(stream_generator(), media_type="text/event-stream")
