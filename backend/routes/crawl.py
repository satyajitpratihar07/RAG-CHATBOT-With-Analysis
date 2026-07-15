import time
import queue
import threading
import logging
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl
from backend.database import get_db
from backend.auth import get_current_user
from backend.routes.projects import get_project_or_404
from backend.crawler import crawl_website
from backend.chunker import get_chunks
from backend.embeddings import get_embedding_provider
from backend.vector_store import get_vector_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/crawl", tags=["crawl"])

# Global tracker for active crawl queues
# project_id -> list of thread-safe queues subscribing to updates
active_crawlers: Dict[int, List[queue.Queue]] = {}
active_threads: Dict[int, threading.Thread] = {}

class CrawlTrigger(BaseModel):
    project_id: int
    url: str

def get_clean_exclude_patterns(patterns_str: str) -> List[str]:
    if not patterns_str:
        return []
    return [p.strip() for p in patterns_str.split(",") if p.strip()]

def run_indexing_pipeline(project_id: int, start_url: str):
    """
    Background worker that runs the crawl, parses pages, generates chunks,
    generates embeddings, and writes to database and vector store.
    """
    start_time = time.time()
    pages_crawled_count = 0
    history_id = None
    
    def broadcast(event_type: str, data: dict):
        if project_id in active_crawlers:
            for q in active_crawlers[project_id]:
                q.put({"type": event_type, **data})

    try:
        # 1. Fetch project details
        with get_db() as db:
            cursor = db.cursor()
            project = cursor.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
            if not project:
                logger.error(f"Cannot crawl: Project {project_id} not found.")
                return
            project = dict(project)
            
            # Create a history record
            cursor.execute(
                "INSERT INTO crawl_history (project_id, status, pages_crawled) VALUES (?, ?, ?)",
                (project_id, "running", 0)
            )
            db.commit()
            history_id = cursor.lastrowid
            
            # Clear old crawl data to prevent duplicate indexing
            # SQLite ON DELETE CASCADE handles page-chunks deletions
            db.execute("DELETE FROM crawled_pages WHERE project_id = ?", (project_id,))
            db.commit()
            
        # Clear vector store file
        vs = get_vector_store(project_id)
        vs.clear()
        
        broadcast("status", {"message": "Crawl initialized. Clearing existing indexed pages...", "progress": 5})
        
        # 2. Configure embedding provider
        # Retrieve user key from environment or project configs (if saved there)
        # For security, key is fetched from env variable
        api_provider = project["embedding_model"]
        emb_provider = get_embedding_provider(api_provider)
        
        # 3. Start crawling
        exclude_list = get_clean_exclude_patterns(project.get("exclude_patterns", ""))
        
        broadcast("status", {"message": f"Starting crawler on {start_url}...", "progress": 15})
        
        crawler_gen = crawl_website(
            start_urls=[start_url],
            max_depth=project["crawl_depth"],
            exclude_patterns=exclude_list,
            respect_robots=True
        )
        
        for event in crawler_gen:
            if event["status"] == "crawling":
                broadcast("status", {"message": f"Crawling: {event['url']}", "progress": 30})
                
            elif event["status"] == "skipped":
                broadcast("status", {"message": f"Skipped: {event['url']} ({event['reason']})", "progress": 30})
                
            elif event["status"] == "failed":
                broadcast("status", {"message": f"Failed: {event['url']} ({event['reason']})", "progress": 30})
                
            elif event["status"] == "page":
                url = event["url"]
                title = event["title"]
                clean_text = event["clean_content"]
                
                broadcast("status", {"message": f"Extracting content from: {title}", "progress": 45})
                
                # Write page to database
                with get_db() as db:
                    cursor = db.cursor()
                    cursor.execute(
                        """
                        INSERT INTO crawled_pages (project_id, url, title, raw_content, clean_content, char_count, word_count)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (project_id, url, title, event["raw_content"], clean_text, event["char_count"], event["word_count"])
                    )
                    db.commit()
                    page_id = cursor.lastrowid
                    
                    # Split into chunks
                    chunks = get_chunks(clean_text, project["chunk_size"], project["chunk_overlap"])
                    if not chunks:
                        continue
                        
                    broadcast("status", {"message": f"Splitting page into {len(chunks)} chunks...", "progress": 60})
                    
                    # Store chunks in SQLite to get row IDs
                    chunk_db_ids = []
                    for idx, chunk_text in enumerate(chunks):
                        cursor.execute(
                            "INSERT INTO chunks (page_id, project_id, text_content, chunk_index) VALUES (?, ?, ?, ?)",
                            (page_id, project_id, chunk_text, idx)
                        )
                        db.commit()
                        chunk_db_ids.append(cursor.lastrowid)
                    
                    # Generate embeddings
                    broadcast("status", {"message": "Generating embeddings...", "progress": 80})
                    try:
                        embeddings = emb_provider.get_embeddings(chunks)
                        # Save in vector store
                        vs.add_embeddings(chunk_db_ids, embeddings)
                        pages_crawled_count += 1
                        
                        # Update progress logs
                        # Save embedding usage analytics in database
                        # Assuming average of 1 token per 4 chars for mock count
                        approx_tokens = sum([len(c) // 4 for c in chunks])
                        cursor.execute(
                            "INSERT INTO api_usage (user_id, project_id, api_type, tokens_used, model_name) VALUES (?, ?, ?, ?, ?)",
                            (project["user_id"], project_id, "embedding", approx_tokens, api_provider)
                        )
                        db.commit()
                        
                    except Exception as e:
                        broadcast("status", {"message": f"Embedding generation failed for {url}: {e}", "progress": 80})
                        logger.error(f"Embedding failed: {e}")
                        
        # 4. Finish indexing pipeline
        duration = round(time.time() - start_time, 2)
        with get_db() as db:
            cursor = db.cursor()
            cursor.execute(
                """
                UPDATE crawl_history 
                SET status = ?, pages_crawled = ?, duration = ?, completed_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                ("completed", pages_crawled_count, duration, history_id)
            )
            db.commit()
            
        broadcast("finished", {"message": f"Indexing completed successfully! {pages_crawled_count} pages crawled in {duration}s.", "pages_crawled": pages_crawled_count})
        
    except Exception as e:
        duration = round(time.time() - start_time, 2)
        logger.error(f"Crawl indexing error: {e}")
        with get_db() as db:
            if history_id:
                cursor = db.cursor()
                cursor.execute(
                    """
                    UPDATE crawl_history 
                    SET status = ?, duration = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    ("failed", duration, str(e), history_id)
                )
                db.commit()
        broadcast("failed", {"message": f"Indexing failed: {e}"})
        
    finally:
        # Cleanup threads tracking
        active_threads.pop(project_id, None)
        active_crawlers.pop(project_id, None)

@router.post("/trigger", response_model=Dict[str, Any])
def trigger_crawl(
    trigger: CrawlTrigger,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    project_id = trigger.project_id
    url = str(trigger.url)
    
    with get_db() as db:
        get_project_or_404(project_id, current_user, db)
        
    # Check if a crawl is already running
    if project_id in active_threads and active_threads[project_id].is_alive():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Crawl job is already running for this project."
        )
        
    # Start crawl in thread
    active_crawlers[project_id] = []
    thread = threading.Thread(target=run_indexing_pipeline, args=(project_id, url))
    active_threads[project_id] = thread
    thread.start()
    
    return {"message": "Crawl triggered successfully in background."}

@router.get("/progress/{project_id}")
def get_crawl_progress(
    project_id: int,
    token: Optional[str] = None
):
    from backend.auth import decode_access_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is required for progress logs"
        )
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token"
        )
        
    user_id = payload.get("user_id")
    role = payload.get("role")

    # Verify project exists and user has access
    with get_db() as db:
        cursor = db.cursor()
        if role == "admin":
            project = cursor.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        else:
            project = cursor.execute(
                "SELECT * FROM projects WHERE id = ? AND user_id = ?",
                (project_id, user_id)
            ).fetchone()
            
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found or access denied"
            )
        
    # Subscribe to progress queue
    q = queue.Queue()
    
    if project_id not in active_crawlers:
        # If not active, return a quick terminal event
        def single_event():
            yield "data: {\"type\": \"info\", \"message\": \"No active crawl job running.\"}\n\n"
        return StreamingResponse(single_event(), media_type="text/event-stream")
        
    active_crawlers[project_id].append(q)
    
    def event_stream():
        try:
            # Yield initial status
            yield "data: {\"type\": \"info\", \"message\": \"Subscribed to real-time logs...\"}\n\n"
            
            while True:
                # Retrieve logs from queue
                try:
                    event = q.get(timeout=20.0) # wait up to 20s for items
                    import json
                    yield f"data: {json.dumps(event)}\n\n"
                    
                    if event["type"] in ["finished", "failed"]:
                        break
                except queue.Empty:
                    # Keep-alive ping
                    yield "data: {\"type\": \"ping\"}\n\n"
        except GeneratorExit:
            # Clean up connection disconnect
            if project_id in active_crawlers and q in active_crawlers[project_id]:
                active_crawlers[project_id].remove(q)
                
    return StreamingResponse(event_stream(), media_type="text/event-stream")

@router.get("/history/{project_id}", response_model=List[Dict[str, Any]])
def get_crawl_history(
    project_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as db:
        get_project_or_404(project_id, current_user, db)
        history = db.execute(
            """
            SELECT id, status, pages_crawled, duration, error_message, started_at, completed_at
            FROM crawl_history
            WHERE project_id = ?
            ORDER BY started_at DESC
            """,
            (project_id,)
        ).fetchall()
        return [dict(h) for h in history]
