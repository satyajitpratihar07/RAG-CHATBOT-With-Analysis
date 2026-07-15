import sqlite3
import os
import json
from datetime import datetime
from contextlib import contextmanager
import logging

logger = logging.getLogger("backend.database")

# Read Supabase PostgreSQL database URL if configured
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")

# Fallback SQLite path
DATABASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "chatbot.db")

class PostgresCursorWrapper:
    def __init__(self, real_cursor):
        self.cursor = real_cursor
        self._lastrowid = None

    def execute(self, query, params=None):
        # 1. Map placeholder ? -> %s
        query = query.replace("?", "%s")
        
        # 2. Check if INSERT to support lastrowid via RETURNING id
        is_insert = query.strip().upper().startswith("INSERT")
        if is_insert and "RETURNING" not in query.upper():
            query = query.rstrip().rstrip(";") + " RETURNING id"
            
        if params is not None:
            self.cursor.execute(query, params)
        else:
            self.cursor.execute(query)
            
        if is_insert:
            try:
                row = self.cursor.fetchone()
                if row:
                    if isinstance(row, dict):
                        self._lastrowid = row.get("id")
                    elif hasattr(row, "keys"):
                        self._lastrowid = row["id"]
                    else:
                        self._lastrowid = row[0]
            except Exception:
                pass
        return self

    @property
    def lastrowid(self):
        return self._lastrowid

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    def __iter__(self):
        return iter(self.cursor)

    def __getattr__(self, name):
        return getattr(self.cursor, name)


class PostgresConnectionWrapper:
    def __init__(self, real_conn):
        self.conn = real_conn

    def cursor(self):
        import psycopg2.extras
        # Use RealDictCursor to support dict casting and key-based indexing
        real_cursor = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return PostgresCursorWrapper(real_cursor)

    def execute(self, query, params=None):
        cursor = self.cursor()
        cursor.execute(query, params)
        return cursor

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.conn.close()


def init_db():
    if SUPABASE_DB_URL:
        logger.info("Initializing Supabase PostgreSQL database schemas...")
        import psycopg2
        conn = psycopg2.connect(SUPABASE_DB_URL)
        cursor = conn.cursor()
        
        postgres_ddls = [
            # 1. Users Table
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            # 2. Projects Table
            """
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                chunk_size INTEGER NOT NULL DEFAULT 500,
                chunk_overlap INTEGER NOT NULL DEFAULT 50,
                embedding_model TEXT NOT NULL DEFAULT 'gemini',
                llm_model TEXT NOT NULL DEFAULT 'gemini',
                crawl_depth INTEGER NOT NULL DEFAULT 2,
                exclude_patterns TEXT,
                system_prompt TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """,
            # 3. Crawled Pages Table
            """
            CREATE TABLE IF NOT EXISTS crawled_pages (
                id SERIAL PRIMARY KEY,
                project_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                title TEXT,
                raw_content TEXT,
                clean_content TEXT,
                char_count INTEGER DEFAULT 0,
                word_count INTEGER DEFAULT 0,
                last_crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                UNIQUE(project_id, url)
            )
            """,
            "CREATE EXTENSION IF NOT EXISTS vector",
            # 4. Chunks Table
            """
            CREATE TABLE IF NOT EXISTS chunks (
                id SERIAL PRIMARY KEY,
                page_id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                text_content TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                embedding vector,
                FOREIGN KEY (page_id) REFERENCES crawled_pages(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
            """,
            "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector",
            "CREATE INDEX IF NOT EXISTS idx_chunks_project ON chunks(project_id)",
            "CREATE INDEX IF NOT EXISTS idx_pages_project ON crawled_pages(project_id)",
            # 5. Crawl History Table
            """
            CREATE TABLE IF NOT EXISTS crawl_history (
                id SERIAL PRIMARY KEY,
                project_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                pages_crawled INTEGER DEFAULT 0,
                duration REAL DEFAULT 0.0,
                error_message TEXT,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
            """,
            # 6. Chat Sessions Table
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id SERIAL PRIMARY KEY,
                project_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """,
            # 7. Chat Messages Table
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                session_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                sources TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            )
            """,
            # 8. API Usage Analytics Table
            """
            CREATE TABLE IF NOT EXISTS api_usage (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                project_id INTEGER,
                api_type TEXT NOT NULL,
                tokens_used INTEGER NOT NULL DEFAULT 0,
                model_name TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
            )
            """
        ]
        
        for ddl in postgres_ddls:
            cursor.execute(ddl)
        conn.commit()
        cursor.close()
        conn.close()
        logger.info("Supabase PostgreSQL schemas initialized successfully.")
    else:
        logger.info("Initializing local SQLite database...")
        os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()
        
        sqlite_ddls = [
            # 1. Users Table
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            # 2. Projects Table
            """
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                chunk_size INTEGER NOT NULL DEFAULT 500,
                chunk_overlap INTEGER NOT NULL DEFAULT 50,
                embedding_model TEXT NOT NULL DEFAULT 'gemini',
                llm_model TEXT NOT NULL DEFAULT 'gemini',
                crawl_depth INTEGER NOT NULL DEFAULT 2,
                exclude_patterns TEXT,
                system_prompt TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """,
            # 3. Crawled Pages Table
            """
            CREATE TABLE IF NOT EXISTS crawled_pages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                title TEXT,
                raw_content TEXT,
                clean_content TEXT,
                char_count INTEGER DEFAULT 0,
                word_count INTEGER DEFAULT 0,
                last_crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                UNIQUE(project_id, url)
            )
            """,
            # 4. Chunks Table
            """
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                text_content TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                FOREIGN KEY (page_id) REFERENCES crawled_pages(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_chunks_project ON chunks(project_id)",
            "CREATE INDEX IF NOT EXISTS idx_pages_project ON crawled_pages(project_id)",
            # 5. Crawl History Table
            """
            CREATE TABLE IF NOT EXISTS crawl_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                pages_crawled INTEGER DEFAULT 0,
                duration REAL DEFAULT 0.0,
                error_message TEXT,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
            """,
            # 6. Chat Sessions Table
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """,
            # 7. Chat Messages Table
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                sources TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            )
            """,
            # 8. API Usage Analytics Table
            """
            CREATE TABLE IF NOT EXISTS api_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                project_id INTEGER,
                api_type TEXT NOT NULL,
                tokens_used INTEGER NOT NULL DEFAULT 0,
                model_name TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
            )
            """
        ]
        
        for ddl in sqlite_ddls:
            cursor.execute(ddl)
        conn.commit()
        cursor.close()
        conn.close()
        logger.info("Local SQLite database initialized successfully.")


@contextmanager
def get_db():
    if SUPABASE_DB_URL:
        import psycopg2
        conn = psycopg2.connect(SUPABASE_DB_URL)
        wrapper = PostgresConnectionWrapper(conn)
        try:
            yield wrapper
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    else:
        conn = sqlite3.connect(DATABASE_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
        finally:
            conn.close()


# Initialize database schemas
init_db()
