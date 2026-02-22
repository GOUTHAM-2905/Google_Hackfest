"""POST /api/chat — natural language chat interface."""
from fastapi import APIRouter, HTTPException
from integrations.openmetadata_client import OpenMetadataClient
from integrations.ollama_client import OllamaClient
from core.chat_agent import handle_chat
from models.chat import ChatRequest, ChatResponse

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        ollama = OllamaClient()
        om = OpenMetadataClient()
        response = handle_chat(
            query=req.query,
            database_context=req.database_context,
            om=om,
            ollama=ollama,
        )
        om.close()
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {e}")
