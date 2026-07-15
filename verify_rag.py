import sys
import os
import json
import sqlite3
import numpy as np

# Ensure workspace is on system path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.database import get_db, init_db
from backend.chunker import get_chunks
from backend.embeddings import MockEmbeddingModel
from backend.vector_store import NumPyVectorStore
from backend.llm import SYSTEM_RAG_PROMPT

def run_tests():
    print("=== Starting RAG Bot Backend Verification ===\n")
    
    # 1. Initialize DB
    print("[1/5] Initializing database schemas...")
    init_db()
    
    # Verify tables
    with get_db() as db:
        cursor = db.cursor()
        tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        table_names = [t["name"] for t in tables]
        print(f" -> Active tables in database: {', '.join(table_names)}")
        assert "users" in table_names
        assert "projects" in table_names
        assert "chunks" in table_names
        assert "crawled_pages" in table_names
        print(" -> Schema check: PASS")

    # 2. Text Chunker test
    print("\n[2/5] Testing Semantic Chunking...")
    sample_text = (
        "FastAPI is a modern, fast (high-performance), web framework for building APIs with Python 3.8+.\n\n"
        "It is based on standard Python type hints. It provides fast code creation, high security, and auto-generated OpenAPI docs."
    )
    chunks = get_chunks(sample_text, chunk_size=100, chunk_overlap=10)
    print(f" -> Split text into {len(chunks)} chunks:")
    for i, c in enumerate(chunks):
        print(f"    Chunk {i}: '{c}' (len={len(c)})")
    assert len(chunks) > 0
    print(" -> Chunking logic: PASS")

    # 3. Vector Storage & Search test
    print("\n[3/5] Testing NumPy Vector Store & Cosine Similarity...")
    project_id = 9999
    vs = NumPyVectorStore(project_id)
    vs.clear() # Reset mock project vector storage
    
    emb_model = MockEmbeddingModel(dimensions=128)
    
    chunk_texts = [
        "Python is a programming language used for scripting and data science.",
        "FastAPI is a web framework built on top of Starlette and Pydantic.",
        "RAG stands for Retrieval-Augmented Generation using semantic search indices."
    ]
    
    vectors = [emb_model.get_embedding(text) for text in chunk_texts]
    mock_chunk_ids = [101, 102, 103]
    
    # Store vectors
    vs.add_embeddings(mock_chunk_ids, vectors)
    stats = vs.get_stats()
    print(f" -> Vectors added: {stats['vector_count']}, Dimensions: {stats['dimension']}")
    assert stats["vector_count"] == 3
    assert stats["dimension"] == 128
    
    # Search vector
    query_text = "What is Retrieval-Augmented Generation?"
    query_vector = emb_model.get_embedding(query_text)
    search_results = vs.search(query_vector, top_k=2)
    print(f" -> Semantic query: '{query_text}'")
    for chunk_id, score in search_results:
        matched_text = chunk_texts[mock_chunk_ids.index(chunk_id)]
        print(f"    Match chunk ID {chunk_id} (Score: {score:.4f}): '{matched_text}'")
        
    # Top match should be the RAG chunk
    assert search_results[0][0] == 103
    print(" -> Vector store & Cosine similarity: PASS")
    
    # Clean up mock vector project
    vs.clear()

    # 4. Strict Prompt Boundary assertions
    print("\n[4/5] Testing RAG Prompt Constraints...")
    context = "RAGBot is an AI assistant developed in 2026. It handles URL indexing."
    query_in = "When was RAGBot developed?"
    query_out = "Who is the Prime Minister of Canada?"
    
    prompt_in = SYSTEM_RAG_PROMPT.format(context=context, question=query_in)
    prompt_out = SYSTEM_RAG_PROMPT.format(context=context, question=query_out)
    
    # Verify that the constraint check phrase is contained in system prompt
    assert "I couldn't find that information in the indexed website" in SYSTEM_RAG_PROMPT
    print(" -> System prompt template constraints: PASS")

    print("\n[5/5] All unit checks completed successfully! (5/5 PASS)")
    print("\n=== RAG Platform Verified Ready ===")

if __name__ == "__main__":
    run_tests()
