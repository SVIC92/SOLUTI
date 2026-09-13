"""Endpoints síncronos del Copilot para Técnicos (plan `2.txt`, módulo 3):
búsqueda semántica sobre tickets resueltos y generador de borradores de respuesta.
"""
from fastapi import APIRouter, Depends

from app.core.schemas import CamelModel
from app.core.security import verify_service_api_key
from app.modules.copilot.service import draft_response, search_similar_tickets

router = APIRouter(dependencies=[Depends(verify_service_api_key)])


class SearchRequest(CamelModel):
    query: str
    category_id: str | None = None


class DraftRequest(CamelModel):
    ticket_id: str
    technician_notes: str


@router.post("/search")
async def search(request: SearchRequest) -> dict:
    results = await search_similar_tickets(request.query, request.category_id)
    return {"results": results}


@router.post("/draft")
async def draft(request: DraftRequest) -> dict:
    text = await draft_response(request.ticket_id, request.technician_notes)
    return {"draft": text}
