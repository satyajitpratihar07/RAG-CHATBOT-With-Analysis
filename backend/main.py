import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

# Manual .env loader to support local credentials without external packages
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip()
from backend.database import init_db
from backend.routes.auth import router as auth_router
from backend.routes.projects import router as projects_router
from backend.routes.crawl import router as crawl_router
from backend.routes.chat import router as chat_router
from backend.routes.admin import router as admin_router
import logging

# Set up logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("backend")

# Initialize database schemas
logger.info("Initializing SQLite database...")
init_db()

app = FastAPI(
    title="Website RAG Chatbot Platform API",
    description="Backend API for crawling websites, semantic chunking, embedding generation, and Retrieval-Augmented Generation.",
    version="1.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to the frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(crawl_router)
app.include_router(chat_router)
app.include_router(admin_router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "Website RAG Chatbot API",
        "documentation": "/docs"
    }

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
