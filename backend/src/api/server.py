import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import auth, chat, documents, graph
from src.core.auth import get_current_user

# No logging config existed anywhere in the app — the root logger's default level is
# WARNING, so every logger.info/logger.warning call across the codebase (ingest
# progress, graph-extraction fallback warnings, per-query timing) was silently
# swallowed; only logger.exception (ERROR) ever actually printed.
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s][%(name)s]: %(message)s")

app = FastAPI(title="GraphRAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    # Browsers restrict JS to reading a small header whitelist on a cross-origin
    # response unless the server explicitly exposes more — pdf.js's fetch-based loader
    # reads Content-Length/Content-Range/Accept-Ranges/ETag to decide how to stream a
    # PDF, and without these exposed those all read back as null, breaking the load
    # (this is what was causing the frontend's PDF preview to fail to load).
    expose_headers=["Content-Length", "Content-Range", "Accept-Ranges", "Content-Disposition", "ETag"],
)

app.include_router(auth.router)  # unprotected — this is what issues the token

# documents.router is protected per-route inside routes/documents.py, not blanket here —
# its file/picture-serving GET routes are loaded by plain <img>/<iframe> src attributes,
# which can't attach an Authorization header, so those two stay public.
app.include_router(documents.router)
app.include_router(chat.router, dependencies=[Depends(get_current_user)])
app.include_router(graph.router, dependencies=[Depends(get_current_user)])
