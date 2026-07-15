from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from backend.database import get_db
from backend.auth import get_current_user
from backend.vector_store import get_vector_store
import os
import shutil

router = APIRouter(prefix="/api/projects", tags=["projects"])

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    chunk_size: int = 500
    chunk_overlap: int = 50
    embedding_model: str = "gemini"
    llm_model: str = "gemini"
    crawl_depth: int = 2
    exclude_patterns: Optional[str] = ""
    system_prompt: Optional[str] = ""

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    chunk_size: Optional[int] = None
    chunk_overlap: Optional[int] = None
    embedding_model: Optional[str] = None
    llm_model: Optional[str] = None
    crawl_depth: Optional[int] = None
    exclude_patterns: Optional[str] = None
    system_prompt: Optional[str] = None

def get_project_or_404(project_id: int, user: dict, db) -> dict:
    cursor = db.cursor()
    if user["role"] == "admin":
        project = cursor.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    else:
        project = cursor.execute(
            "SELECT * FROM projects WHERE id = ? AND user_id = ?",
            (project_id, user["id"])
        ).fetchone()
        
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied"
        )
    return dict(project)

@router.get("", response_model=List[Dict[str, Any]])
def list_projects(current_user: Dict[str, Any] = Depends(get_current_user)):
    with get_db() as db:
        cursor = db.cursor()
        if current_user["role"] == "admin":
            projects = cursor.execute("SELECT * FROM projects").fetchall()
        else:
            projects = cursor.execute(
                "SELECT * FROM projects WHERE user_id = ?",
                (current_user["id"],)
            ).fetchall()
            
        result = []
        for p in projects:
            p_dict = dict(p)
            # Add crawling stats
            stats = cursor.execute(
                """
                SELECT 
                    COUNT(DISTINCT cp.id) as crawled_pages,
                    COUNT(DISTINCT ch.id) as total_crawls
                FROM projects pr
                LEFT JOIN crawled_pages cp ON cp.project_id = pr.id
                LEFT JOIN crawl_history ch ON ch.project_id = pr.id
                WHERE pr.id = ?
                """, (p_dict["id"],)
            ).fetchone()
            
            p_dict["crawled_pages"] = stats["crawled_pages"]
            p_dict["total_crawls"] = stats["total_crawls"]
            result.append(p_dict)
            
        return result

@router.post("", response_model=Dict[str, Any])
def create_project(
    project: ProjectCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute(
            """
            INSERT INTO projects (
                user_id, name, description, chunk_size, chunk_overlap, 
                embedding_model, llm_model, crawl_depth, exclude_patterns, system_prompt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                current_user["id"],
                project.name,
                project.description,
                project.chunk_size,
                project.chunk_overlap,
                project.embedding_model,
                project.llm_model,
                project.crawl_depth,
                project.exclude_patterns,
                project.system_prompt
            )
        )
        db.commit()
        project_id = cursor.lastrowid
        if project_id is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error: Failed to retrieve project ID."
            )
        
        # Initialize an empty vector store directory
        get_vector_store(project_id)
        
        return {"id": project_id, "message": "Project created successfully"}

@router.get("/{id}", response_model=Dict[str, Any])
def get_project(
    id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as db:
        return get_project_or_404(id, current_user, db)

@router.put("/{id}", response_model=Dict[str, Any])
def update_project(
    id: int,
    project_update: ProjectUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as db:
        # Check permissions
        get_project_or_404(id, current_user, db)
        
        # Update values
        update_data = project_update.model_dump(exclude_unset=True)
        if not update_data:
            return {"message": "No changes requested"}
            
        set_clause = ", ".join([f"{k} = ?" for k in update_data.keys()])
        params = list(update_data.values()) + [id]
        
        db.execute(f"UPDATE projects SET {set_clause} WHERE id = ?", params)
        db.commit()
        return {"message": "Project updated successfully"}

@router.delete("/{id}", response_model=Dict[str, Any])
def delete_project(
    id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as db:
        get_project_or_404(id, current_user, db)
        
        # Delete from DB
        db.execute("DELETE FROM projects WHERE id = ?", (id,))
        db.commit()
        
    # Delete Vector database directories
    try:
        vs = get_vector_store(id)
        vs.clear()
        project_dir = vs.project_dir
        if os.path.exists(project_dir):
            shutil.rmtree(project_dir)
    except Exception as e:
        pass
        
    return {"message": "Project and corresponding indices deleted successfully"}

@router.get("/{id}/stats", response_model=Dict[str, Any])
def get_project_stats(
    id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as db:
        get_project_or_404(id, current_user, db)
        cursor = db.cursor()
        
        # Crawl count and metrics
        pages_stats = cursor.execute(
            """
            SELECT 
                COUNT(*) as count,
                SUM(char_count) as total_chars,
                SUM(word_count) as total_words
            FROM crawled_pages
            WHERE project_id = ?
            """,
            (id,)
        ).fetchone()
        
        # Chunk counts
        chunks_count = cursor.execute(
            "SELECT COUNT(*) as count FROM chunks WHERE project_id = ?",
            (id,)
        ).fetchone()["count"]
        
        # Last index job
        last_crawl = cursor.execute(
            """
            SELECT started_at, completed_at, status, pages_crawled
            FROM crawl_history
            WHERE project_id = ?
            ORDER BY started_at DESC LIMIT 1
            """,
            (id,)
        ).fetchone()
        
        # Vector stats
        vs = get_vector_store(id)
        vector_stats = vs.get_stats()
        
        return {
            "total_pages": pages_stats["count"] or 0,
            "total_chars": pages_stats["total_chars"] or 0,
            "total_words": pages_stats["total_words"] or 0,
            "total_chunks": chunks_count,
            "vector_count": vector_stats["vector_count"],
            "vector_dimension": vector_stats["dimension"],
            "storage_size_bytes": vector_stats["disk_size_bytes"],
            "last_crawl": dict(last_crawl) if last_crawl else None
        }

@router.get("/{id}/pages", response_model=List[Dict[str, Any]])
def list_project_pages(
    id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as db:
        get_project_or_404(id, current_user, db)
        pages = db.execute(
            """
            SELECT id, url, title, char_count, word_count, last_crawled_at
            FROM crawled_pages
            WHERE project_id = ?
            ORDER BY last_crawled_at DESC
            """,
            (id,)
        ).fetchall()
        return [dict(p) for p in pages]

@router.delete("/{id}/pages/{page_id}", response_model=Dict[str, Any])
def delete_project_page(
    id: int,
    page_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as db:
        get_project_or_404(id, current_user, db)
        
        # Select chunk IDs that belong to this page so we can delete their embeddings
        chunks = db.execute("SELECT id FROM chunks WHERE page_id = ?", (page_id,)).fetchall()
        chunk_ids = [c["id"] for c in chunks]
        
        # Delete from DB
        db.execute("DELETE FROM crawled_pages WHERE id = ? AND project_id = ?", (page_id, id))
        db.commit()
        
    # Delete from vector store
    if chunk_ids:
        try:
            vs = get_vector_store(id)
            vs.delete_embeddings(chunk_ids)
        except Exception:
            pass
            
    return {"message": "Page and its vector chunks deleted successfully"}
