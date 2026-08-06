from __future__ import annotations

import os
from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .handoff import MainContractAdapter
from .handoff_models import MainPassageResponse, MainWorldSnapshot
from .models import PassageRequest
from .pipeline import NarrativePipeline


app = FastAPI(
    title="StoryWorld Narrative Engine",
    version="0.1.0",
    description="Converts story passages into persistent semantic world updates.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "STORYWORLD_CORS_ORIGINS",
            (
                "http://127.0.0.1:8443,http://localhost:8443,"
                "http://127.0.0.1:5173,http://localhost:5173"
            ),
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


handoff_adapter = MainContractAdapter()


@lru_cache(maxsize=1)
def get_pipeline() -> NarrativePipeline:
    return NarrativePipeline()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/api/stories/{story_id}/passages",
    response_model=MainPassageResponse,
    response_model_exclude_none=True,
)
def process_passage(
    story_id: str,
    request: PassageRequest,
    pipeline: NarrativePipeline = Depends(get_pipeline),
) -> MainPassageResponse:
    try:
        previous = pipeline.storage.load_latest_snapshot(story_id)
        response = pipeline.process_text(
            story_id=story_id,
            passage_id=request.passage_id,
            text=request.text,
            replay_cached_extraction=request.replay_cached_extraction,
        )
        return handoff_adapter.passage_response(previous, response)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get(
    "/api/stories/{story_id}/snapshots/latest",
    response_model=MainWorldSnapshot,
    response_model_exclude_none=True,
)
def latest_snapshot(
    story_id: str,
    pipeline: NarrativePipeline = Depends(get_pipeline),
) -> MainWorldSnapshot:
    try:
        return handoff_adapter.world_snapshot(
            pipeline.storage.load_latest_snapshot(story_id)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
