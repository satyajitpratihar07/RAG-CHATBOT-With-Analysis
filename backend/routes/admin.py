import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from backend.database import get_db, DATABASE_PATH
from backend.auth import get_admin_user, hash_password
from backend.vector_store import get_vector_store

router = APIRouter(prefix="/api/admin", tags=["admin"])

class UserCreateAdmin(BaseModel):
    email: str
    password: str
    role: str = "user"

class UserUpdateAdmin(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None

@router.get("/analytics", response_model=Dict[str, Any])
def get_global_analytics(admin: Dict[str, Any] = Depends(get_admin_user)):
    with get_db() as db:
        cursor = db.cursor()
        
        # User count
        total_users = cursor.execute("SELECT COUNT(*) as count FROM users").fetchone()["count"]
        # Project count
        total_projects = cursor.execute("SELECT COUNT(*) as count FROM projects").fetchone()["count"]
        # Crawled page count
        total_pages = cursor.execute("SELECT COUNT(*) as count FROM crawled_pages").fetchone()["count"]
        # Text chunk count
        total_chunks = cursor.execute("SELECT COUNT(*) as count FROM chunks").fetchone()["count"]
        
        # Crawl success rate
        crawls = cursor.execute(
            "SELECT status, COUNT(*) as count FROM crawl_history GROUP BY status"
        ).fetchall()
        crawls_by_status = {c["status"]: c["count"] for c in crawls}
        
        # API usage counts
        api_usage = cursor.execute(
            """
            SELECT api_type, SUM(tokens_used) as total_tokens, COUNT(*) as calls_count
            FROM api_usage
            GROUP BY api_type
            """
        ).fetchall()
        
        usage_stats = {}
        for row in api_usage:
            usage_stats[row["api_type"]] = {
                "tokens": row["total_tokens"] or 0,
                "calls": row["calls_count"] or 0
            }
            
        return {
            "users_count": total_users,
            "projects_count": total_projects,
            "pages_count": total_pages,
            "chunks_count": total_chunks,
            "crawls_status": crawls_by_status,
            "api_usage": usage_stats
        }

@router.get("/users", response_model=List[Dict[str, Any]])
def list_users(admin: Dict[str, Any] = Depends(get_admin_user)):
    with get_db() as db:
        cursor = db.cursor()
        users = cursor.execute(
            """
            SELECT u.id, u.email, u.role, u.created_at, COUNT(p.id) as projects_count
            FROM users u
            LEFT JOIN projects p ON p.user_id = u.id
            GROUP BY u.id
            ORDER BY u.created_at DESC
            """
        ).fetchall()
        return [dict(u) for u in users]

@router.post("/users", response_model=Dict[str, Any])
def create_user_by_admin(
    user_data: UserCreateAdmin,
    admin: Dict[str, Any] = Depends(get_admin_user)
):
    email = user_data.email.lower().strip()
    if len(user_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        
    with get_db() as db:
        cursor = db.cursor()
        exists = cursor.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if exists:
            raise HTTPException(status_code=400, detail="Email is already registered")
            
        pw_hash = hash_password(user_data.password)
        cursor.execute(
            "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
            (email, pw_hash, user_data.role)
        )
        db.commit()
        return {"id": cursor.lastrowid, "message": "User created successfully by admin"}

@router.put("/users/{user_id}", response_model=Dict[str, Any])
def update_user_by_admin(
    user_id: int,
    update_data: UserUpdateAdmin,
    admin: Dict[str, Any] = Depends(get_admin_user)
):
    with get_db() as db:
        cursor = db.cursor()
        user = cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        fields = []
        params = []
        if update_data.email:
            fields.append("email = ?")
            params.append(update_data.email.lower().strip())
        if update_data.password:
            fields.append("password_hash = ?")
            params.append(hash_password(update_data.password))
        if update_data.role:
            fields.append("role = ?")
            params.append(update_data.role)
            
        if not fields:
            return {"message": "No update fields sent"}
            
        params.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", params)
        db.commit()
        return {"message": "User modified successfully by admin"}

@router.delete("/users/{user_id}", response_model=Dict[str, Any])
def delete_user_by_admin(
    user_id: int,
    admin: Dict[str, Any] = Depends(get_admin_user)
):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete currently active admin user")
        
    with get_db() as db:
        cursor = db.cursor()
        user = cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        # Get all user's projects to clear vector storage
        projects = cursor.execute("SELECT id FROM projects WHERE user_id = ?", (user_id,)).fetchall()
        for p in projects:
            try:
                vs = get_vector_store(p["id"])
                vs.clear()
            except Exception:
                pass
                
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        db.commit()
        
    return {"message": "User account and all their project libraries deleted"}

@router.get("/db-status", response_model=Dict[str, Any])
def get_db_status(admin: Dict[str, Any] = Depends(get_admin_user)):
    try:
        # Check database file size
        db_size = os.path.getsize(DATABASE_PATH) if os.path.exists(DATABASE_PATH) else 0
        
        # Gather directory sizing details
        proj_dir = os.path.join(os.path.dirname(DATABASE_PATH), "projects")
        vector_files_count = 0
        vectors_total_size = 0
        
        if os.path.exists(proj_dir):
            for root, dirs, files in os.walk(proj_dir):
                for f in files:
                    vector_files_count += 1
                    vectors_total_size += os.path.getsize(os.path.join(root, f))
                    
        return {
            "sqlite_db_path": DATABASE_PATH,
            "sqlite_db_size_bytes": db_size,
            "vector_files_count": vector_files_count,
            "vector_files_size_bytes": vectors_total_size,
            "status": "healthy"
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
