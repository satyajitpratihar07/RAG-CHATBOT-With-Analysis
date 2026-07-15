import os
import json
import numpy as np
from typing import List, Tuple, Dict, Any
import logging

logger = logging.getLogger(__name__)

class NumPyVectorStore:
    def __init__(self, project_id: int):
        self.project_id = project_id
        self.project_dir = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "data", "projects", str(project_id)
        )
        os.makedirs(self.project_dir, exist_ok=True)
        self.vectors_path = os.path.join(self.project_dir, "vectors.npy")
        self.metadata_path = os.path.join(self.project_dir, "metadata.json")
        
        self.vectors: np.ndarray = np.empty((0, 0))
        self.chunk_ids: List[int] = []
        self._load()

    def _load(self):
        """Loads vectors and chunk metadata from disk if they exist."""
        try:
            if os.path.exists(self.vectors_path) and os.path.exists(self.metadata_path):
                self.vectors = np.load(self.vectors_path)
                with open(self.metadata_path, "r", encoding="utf-8") as f:
                    self.chunk_ids = json.load(f)
                logger.info(f"Loaded {len(self.chunk_ids)} vectors for project {self.project_id}")
            else:
                self.vectors = np.empty((0, 0))
                self.chunk_ids = []
        except Exception as e:
            logger.error(f"Error loading vector store for project {self.project_id}: {e}")
            self.vectors = np.empty((0, 0))
            self.chunk_ids = []

    def save(self):
        """Saves current state of vectors and chunk IDs to disk."""
        try:
            if self.vectors.size > 0:
                np.save(self.vectors_path, self.vectors)
                with open(self.metadata_path, "w", encoding="utf-8") as f:
                    json.dump(self.chunk_ids, f)
                logger.info(f"Saved {len(self.chunk_ids)} vectors for project {self.project_id}")
        except Exception as e:
            logger.error(f"Failed to save vector store for project {self.project_id}: {e}")
            raise e

    def add_embeddings(self, chunk_ids: List[int], embeddings: List[List[float]]):
        """Appends new chunk embeddings and updates files on disk."""
        if not chunk_ids or not embeddings:
            return
            
        new_vecs = np.array(embeddings, dtype=np.float32)
        
        if self.vectors.size == 0:
            self.vectors = new_vecs
            self.chunk_ids = list(chunk_ids)
        else:
            if self.vectors.shape[1] != new_vecs.shape[1]:
                raise ValueError(
                    f"Vector dimension mismatch. Store expected {self.vectors.shape[1]}, got {new_vecs.shape[1]}"
                )
            self.vectors = np.vstack([self.vectors, new_vecs])
            self.chunk_ids.extend(chunk_ids)
            
        self.save()

    def delete_embeddings(self, chunk_ids_to_delete: List[int]):
        """Deletes specified chunk IDs and their corresponding vectors."""
        if not self.chunk_ids or not chunk_ids_to_delete:
            return
            
        indices_to_keep = [i for i, cid in enumerate(self.chunk_ids) if cid not in chunk_ids_to_delete]
        
        if not indices_to_keep:
            self.clear()
        else:
            self.vectors = self.vectors[indices_to_keep]
            self.chunk_ids = [self.chunk_ids[i] for i in indices_to_keep]
            self.save()

    def clear(self):
        """Clears all vectors for the project and deletes disk files."""
        self.vectors = np.empty((0, 0))
        self.chunk_ids = []
        if os.path.exists(self.vectors_path):
            try:
                os.remove(self.vectors_path)
            except Exception:
                pass
        if os.path.exists(self.metadata_path):
            try:
                os.remove(self.metadata_path)
            except Exception:
                pass

    def search(self, query_embedding: List[float], top_k: int = 5) -> List[Tuple[int, float]]:
        """
        Computes cosine similarity of query against all stored vectors.
        Returns a list of tuples (chunk_id, similarity_score) sorted descending.
        """
        if self.vectors.size == 0 or not self.chunk_ids:
            return []
            
        # Ensure dimensions match
        q_vec = np.array(query_embedding, dtype=np.float32)
        if q_vec.shape[0] != self.vectors.shape[1]:
            logger.warning(
                f"Query vector dimensions ({q_vec.shape[0]}) do not match store ({self.vectors.shape[1]})"
            )
            return []

        # Cosine similarity formula: A . B / (||A|| * ||B||)
        # 1. Norm of each vector in database
        norms = np.linalg.norm(self.vectors, axis=1)
        # Avoid division by zero
        norms[norms == 0] = 1e-10
        
        # 2. Norm of query
        q_norm = np.linalg.norm(q_vec)
        if q_norm == 0:
            q_norm = 1e-10
            
        # 3. Dot product
        dot_products = np.dot(self.vectors, q_vec)
        
        # 4. Similarities
        similarities = dot_products / (norms * q_norm)
        
        # Get top K indices sorted by score descending
        top_k = min(top_k, len(self.chunk_ids))
        top_indices = np.argsort(similarities)[::-1][:top_k]
        
        results = []
        for idx in top_indices:
            results.append((self.chunk_ids[idx], float(similarities[idx])))
            
        return results

    def get_stats(self) -> Dict[str, Any]:
        """Returns statistics of the vector index."""
        if self.vectors.size == 0:
            return {
                "vector_count": 0,
                "dimension": 0,
                "disk_size_bytes": 0
            }
        
        disk_size = 0
        if os.path.exists(self.vectors_path):
            disk_size += os.path.getsize(self.vectors_path)
        if os.path.exists(self.metadata_path):
            disk_size += os.path.getsize(self.metadata_path)
            
        return {
            "vector_count": len(self.chunk_ids),
            "dimension": int(self.vectors.shape[1]),
            "disk_size_bytes": disk_size
        }


class PgVectorStore:
    def __init__(self, project_id: int):
        self.project_id = project_id
        
    def add_embeddings(self, chunk_ids: List[int], embeddings: List[List[float]]):
        if not chunk_ids or not embeddings:
            return
        from backend.database import get_db
        with get_db() as conn:
            cursor = conn.cursor()
            for chunk_id, emb in zip(chunk_ids, embeddings):
                emb_str = str(list(emb))
                cursor.execute(
                    "UPDATE chunks SET embedding = %s::vector WHERE id = %s AND project_id = %s",
                    (emb_str, chunk_id, self.project_id)
                )
            conn.commit()

    def delete_embeddings(self, chunk_ids_to_delete: List[int]):
        if not chunk_ids_to_delete:
            return
        from backend.database import get_db
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE chunks SET embedding = NULL WHERE project_id = %s AND id IN %s",
                (self.project_id, tuple(chunk_ids_to_delete))
            )
            conn.commit()

    def clear(self):
        from backend.database import get_db
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE chunks SET embedding = NULL WHERE project_id = %s",
                (self.project_id,)
            )
            conn.commit()

    def search(self, query_embedding: List[float], top_k: int = 5) -> List[Tuple[int, float]]:
        from backend.database import get_db
        emb_str = str(list(query_embedding))
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, 1 - (embedding <=> %s::vector) AS similarity 
                FROM chunks 
                WHERE project_id = %s AND embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector 
                LIMIT %s
                """,
                (emb_str, self.project_id, emb_str, top_k)
            )
            rows = cursor.fetchall()
            results = []
            for row in rows:
                if isinstance(row, dict):
                    results.append((row["id"], float(row["similarity"])))
                elif hasattr(row, "keys"):
                    results.append((row["id"], float(row["similarity"])))
                else:
                    results.append((row[0], float(row[1])))
            return results

    def get_stats(self) -> Dict[str, Any]:
        from backend.database import get_db
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT count(*) FROM chunks WHERE project_id = %s AND embedding IS NOT NULL",
                (self.project_id,)
            )
            row = cursor.fetchone()
            count = row["count"] if isinstance(row, dict) else (row["count"] if hasattr(row, "keys") else row[0])
            return {
                "vector_count": count,
                "dimension": 0,
                "disk_size_bytes": 0
            }


def get_vector_store(project_id: int):
    from backend.database import SUPABASE_DB_URL
    if SUPABASE_DB_URL:
        return PgVectorStore(project_id)
    else:
        return NumPyVectorStore(project_id)
