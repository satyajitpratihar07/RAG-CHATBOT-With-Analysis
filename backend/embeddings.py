import os
import hashlib
import numpy as np
from typing import List, Union, Optional, Any
import logging

logger = logging.getLogger(__name__)

class BaseEmbeddingModel:
    def get_embedding(self, text: str) -> List[float]:
        raise NotImplementedError
        
    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        return [self.get_embedding(t) for t in texts]

class GeminiEmbeddingModel(BaseEmbeddingModel):
    def __init__(self, api_key: str):
        self.api_key = api_key
        # We import here to avoid initialization failure if API is not used
        from google import genai
        self.client = genai.Client(api_key=api_key)
        self.model_name = "gemini-embedding-001"

    def get_embedding(self, text: str) -> List[float]:
        try:
            from google.genai import types
            response = self.client.models.embed_content(
                model=self.model_name,
                contents=text,
                config=types.EmbedContentConfig(output_dimensionality=768)
            )
            # Response structure depends on google-genai version.
            # Usually response.embedding.values contains the floats.
            res_any: Any = response
            if hasattr(res_any, "embedding") and hasattr(res_any.embedding, "values"):
                return res_any.embedding.values
            elif isinstance(res_any, dict) and "embedding" in res_any:
                return res_any["embedding"]["values"]
            else:
                # Handle alternative response structures
                return list(getattr(res_any, "embeddings")[0].values)
        except Exception as e:
            logger.error(f"Gemini Embedding failed: {e}")
            raise e

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        try:
            from google.genai import types
            # Batch embedding
            response = self.client.models.embed_content(
                model=self.model_name,
                contents=texts,
                config=types.EmbedContentConfig(output_dimensionality=768)
            )
            # Check structure
            res_any: Any = response
            if hasattr(res_any, "embeddings") and res_any.embeddings is not None:
                return [emb.values for emb in res_any.embeddings if emb is not None]
            else:
                return [self.get_embedding(t) for t in texts]
        except Exception as e:
            logger.warning(f"Batch Gemini Embedding failed, falling back to sequential: {e}")
            return [self.get_embedding(t) for t in texts]

class OpenAIEmbeddingModel(BaseEmbeddingModel):
    def __init__(self, api_key: str):
        self.api_key = api_key
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key)
        self.model_name = "text-embedding-3-small"

    def get_embedding(self, text: str) -> List[float]:
        try:
            response = self.client.embeddings.create(
                model=self.model_name,
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"OpenAI Embedding failed: {e}")
            raise e

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        try:
            response = self.client.embeddings.create(
                model=self.model_name,
                input=texts
            )
            return [data.embedding for data in response.data]
        except Exception as e:
            logger.warning(f"Batch OpenAI Embedding failed, falling back to sequential: {e}")
            return [self.get_embedding(t) for t in texts]

class LocalSentenceTransformerModel(BaseEmbeddingModel):
    def __init__(self):
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
            self.model = SentenceTransformer("all-MiniLM-L6-v2")
            self.model_name = "all-MiniLM-L6-v2"
        except ImportError:
            logger.warning("sentence-transformers not installed. Local embeddings will use MockEmbeddingModel.")
            self.model = None

    def get_embedding(self, text: str) -> List[float]:
        if self.model is None:
            return MockEmbeddingModel().get_embedding(text)
        vector = self.model.encode(text)
        return vector.tolist()

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        if self.model is None:
            return MockEmbeddingModel().get_embeddings(texts)
        vectors = self.model.encode(texts)
        return vectors.tolist()

class MockEmbeddingModel(BaseEmbeddingModel):
    """
    Deterministic mockup embedding using md5 hash of text to generate 384-dimensional vector.
    Enables immediate local execution without API keys or heavy PyTorch libraries.
    """
    def __init__(self, dimensions: int = 384):
        self.dimensions = dimensions
        self.model_name = "local-deterministic-mock"

    def get_embedding(self, text: str) -> List[float]:
        # Generate seed from md5
        hash_val = hashlib.md5(text.encode("utf-8")).hexdigest()
        seed = int(hash_val[:8], 16)
        rng = np.random.default_rng(seed)
        
        # Generate normal distribution vector
        vec = rng.standard_normal(self.dimensions)
        # Normalise vector
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
            
        return vec.tolist()

def get_embedding_provider(
    provider_name: str,
    api_key: Optional[str] = None
) -> BaseEmbeddingModel:
    provider = provider_name.lower().strip()
    
    if provider == "openai":
        key = api_key or os.getenv("OPENAI_API_KEY")
        if not key:
            raise ValueError("OpenAI API key is missing. Please add your OpenAI key in settings.")
        return OpenAIEmbeddingModel(key)
        
    elif provider == "gemini":
        key = api_key or os.getenv("GEMINI_API_KEY")
        if not key:
            raise ValueError("Gemini API key is missing. Please add your Gemini key in settings.")
        return GeminiEmbeddingModel(key)
        
    elif provider == "local" or provider == "sentence-transformers":
        try:
            return LocalSentenceTransformerModel()
        except Exception:
            logger.warning("Failed to initialize sentence-transformers, using MockEmbeddingModel.")
            return MockEmbeddingModel()
            
    else:
        logger.info("No valid embedding provider specified, defaulting to Mock Embedding Model.")
        return MockEmbeddingModel()
