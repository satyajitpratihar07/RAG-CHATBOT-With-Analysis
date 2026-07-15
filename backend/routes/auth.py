from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from backend.database import get_db
from backend.auth import hash_password, verify_password, create_access_token, get_current_user
from typing import Dict, Any

router = APIRouter(prefix="/api/auth", tags=["auth"])

class UserAuthSchema(BaseModel):
    email: EmailStr
    password: str

class UserResponseSchema(BaseModel):
    id: int
    email: str
    role: str

@router.post("/signup", response_model=Dict[str, Any])
def signup(user_data: UserAuthSchema):
    email = user_data.email.lower().strip()
    password = user_data.password
    
    if len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long"
        )
        
    with get_db() as db:
        cursor = db.cursor()
        # Check if user already exists
        user = cursor.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email address already registered"
            )
            
        # Create user
        pwd_hash = hash_password(password)
        cursor.execute(
            "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
            (email, pwd_hash, "user")
        )
        db.commit()
        
        user_id = cursor.lastrowid
        access_token = create_access_token(
            data={"user_id": user_id, "email": email, "role": "user"}
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {"id": user_id, "email": email, "role": "user"}
        }

@router.post("/login", response_model=Dict[str, Any])
def login(user_data: UserAuthSchema):
    email = user_data.email.lower().strip()
    password = user_data.password
    
    with get_db() as db:
        cursor = db.cursor()
        user = cursor.execute(
            "SELECT id, email, password_hash, role FROM users WHERE email = ?",
            (email,)
        ).fetchone()
        
        if not user or not verify_password(password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        access_token = create_access_token(
            data={"user_id": user["id"], "email": user["email"], "role": user["role"]}
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {"id": user["id"], "email": user["email"], "role": user["role"]}
        }

@router.get("/me", response_model=UserResponseSchema)
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return current_user
