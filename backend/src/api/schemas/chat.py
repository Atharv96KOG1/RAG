from pydantic import BaseModel


class ChatRequest(BaseModel):
    question: str


class BoundingBox(BaseModel):
    # Fractions (0-1) of the page's own width/height — resolution-independent, so the
    # frontend can position a highlight over a PDF.js-rendered page at any zoom level.
    left: float
    top: float
    width: float
    height: float


class SourceCitation(BaseModel):
    source_file: str | None = None
    doc_hash: str | None = None
    page: int | None = None
    content_type: str | None = None
    snippet: str
    relevance_score: float | None = None
    image_url: str | None = None
    bbox: BoundingBox | None = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceCitation] = []
