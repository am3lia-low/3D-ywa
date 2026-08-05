from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException

from .models import PassageRequest, PassageResponse, WorldSnapshot
from .pipeline import NarrativePipeline


app = FastAPI(
    title="StoryWorld Narrative Engine",
    version="0.1.0",
    description="Converts story passages into persistent semantic world updates.",
)


@lru_cache(maxsize=1)
def get_pipeline() -> NarrativePipeline:
    return NarrativePipeline()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/api/stories/{story_id}/passages",
    response_model=PassageResponse,
)
def process_passage(
    story_id: str,
    request: PassageRequest,
    pipeline: NarrativePipeline = Depends(get_pipeline),
) -> PassageResponse:
    try:
        return pipeline.process_text(
            story_id=story_id,
            passage_id=request.passage_id,
            text=request.text,
            replay_cached_extraction=request.replay_cached_extraction,
        )
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get(
    "/api/stories/{story_id}/snapshots/latest",
    response_model=WorldSnapshot,
)
def latest_snapshot(
    story_id: str,
    pipeline: NarrativePipeline = Depends(get_pipeline),
) -> WorldSnapshot:
    try:
        return pipeline.storage.load_latest_snapshot(story_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

