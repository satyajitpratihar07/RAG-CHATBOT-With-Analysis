import os
from typing import Generator, List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

SYSTEM_RAG_PROMPT = """You are an AI assistant answering questions about a website. You must answer the user's question using ONLY the provided context blocks extracted from the crawled website.

Strict Rules:
1. Answer the question using ONLY the context below. Do not use any outside knowledge or hallucinate.
2. If the context does not contain enough information to answer the question, or if the question is unrelated, you MUST respond with EXACTLY this phrase: "I couldn't find that information in the indexed website"
3. Do not attempt to explain why you couldn't find the information, or write anything else besides that exact phrase if it is missing.
4. Cite sources if appropriate but do not make up facts.

Retrieved Context:
---
{context}
---

Question: {question}
Answer:"""

class BaseLLMProvider:
    def generate_response(self, prompt: str, system_instruction: str = "") -> str:
        raise NotImplementedError

    def generate_response_stream(self, prompt: str, system_instruction: str = "") -> Generator[str, None, None]:
        raise NotImplementedError

class GeminiLLMProvider(BaseLLMProvider):
    def __init__(self, api_key: str, model_name: str = "gemini-2.5-flash"):
        self.api_key = api_key
        self.model_name = model_name
        from google import genai
        self.client = genai.Client(api_key=api_key)

    def generate_response(self, prompt: str, system_instruction: str = "") -> str:
        try:
            from google.genai import types
            config = types.GenerateContentConfig(
                system_instruction=system_instruction if system_instruction else None
            )
                
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=config
            )
            return response.text or ""
        except Exception as e:
            logger.error(f"Gemini LLM error: {e}")
            raise e

    def generate_response_stream(self, prompt: str, system_instruction: str = "") -> Generator[str, None, None]:
        try:
            from google.genai import types
            config = types.GenerateContentConfig(
                system_instruction=system_instruction if system_instruction else None
            )
                
            response = self.client.models.generate_content_stream(
                model=self.model_name,
                contents=prompt,
                config=config
            )
            for chunk in response:
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            logger.error(f"Gemini LLM stream error: {e}")
            raise e

class OpenAILikeProvider(BaseLLMProvider):
    """Handles OpenAI, Groq, Ollama, and OpenRouter since they share the ChatCompletions schema."""
    def __init__(self, api_key: str, base_url: Optional[str] = None, model_name: str = "gpt-4o-mini", default_headers: Optional[Dict[str, str]] = None):
        self.api_key = api_key
        self.base_url = base_url
        self.model_name = model_name
        self.default_headers = default_headers
        from openai import OpenAI
        
        # Configure client
        kwargs: Dict[str, Any] = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        if default_headers:
            kwargs["default_headers"] = default_headers
            
        self.client = OpenAI(**kwargs)

    def generate_response(self, prompt: str, system_instruction: str = "") -> str:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})
        
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                stream=False
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"OpenAI-like LLM error ({self.model_name}): {e}")
            raise e

    def generate_response_stream(self, prompt: str, system_instruction: str = "") -> Generator[str, None, None]:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})
        
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                stream=True
            )
            for chunk in response:
                if chunk.choices and len(chunk.choices) > 0:
                    content = chunk.choices[0].delta.content
                    if content:
                        yield content
        except Exception as e:
            logger.error(f"OpenAI-like LLM stream error ({self.model_name}): {e}")
            raise e

def get_llm_provider(
    provider_name: str,
    api_key: Optional[str] = None,
    model_name: Optional[str] = None
) -> BaseLLMProvider:
    provider = provider_name.lower().strip()
    
    if provider == "gemini":
        key = api_key or os.getenv("GEMINI_API_KEY")
        if not key:
            raise ValueError("Gemini API key is missing. Add your Gemini key in project settings.")
        model = model_name or "gemini-2.5-flash"
        return GeminiLLMProvider(key, model)
        
    elif provider == "openai":
        key = api_key or os.getenv("OPENAI_API_KEY")
        if not key:
            raise ValueError("OpenAI API key is missing. Add your OpenAI key in project settings.")
        model = model_name or "gpt-4o-mini"
        return OpenAILikeProvider(key, model_name=model)
        
    elif provider == "groq":
        key = api_key or os.getenv("GROQ_API_KEY")
        if not key:
            raise ValueError("Groq API key is missing. Add your Groq key in project settings.")
        model = model_name or "llama-3.3-70b-versatile"
        return OpenAILikeProvider(key, base_url="https://api.groq.com/openai/v1", model_name=model)
        
    elif provider == "ollama":
        # Ollama usually runs locally, default URL and no API key required
        model = model_name or "llama3"
        return OpenAILikeProvider(
            api_key="ollama",
            base_url="http://localhost:11434/v1",
            model_name=model
        )
        
    elif provider == "openrouter":
        key = api_key or os.getenv("OPENROUTER_API_KEY")
        if not key:
            raise ValueError("OpenRouter API key is missing. Add your OpenRouter key in project settings.")
        model = model_name or "google/gemini-2.5-flash"
        headers = {
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "RAG Bot Chatbot Platform"
        }
        return OpenAILikeProvider(
            api_key=key,
            base_url="https://openrouter.ai/api/v1",
            model_name=model,
            default_headers=headers
        )
        
    else:
        # Default mock fallback provider if none match
        raise ValueError(f"Unknown LLM provider: {provider_name}")
