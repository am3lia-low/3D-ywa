from __future__ import annotations

import os
from pathlib import Path

from .extractor import (
    NarrativeExtractor,
    OpenAIExtractor,
    exclude_character_mentions,
    validate_extraction_references,
)
from .models import PassageResponse
from .preprocess import segment_passage
from .reconciler import WorldStateReconciler
from .storage import JsonStoryStorage


class NarrativePipeline:
    def __init__(
        self,
        extractor: NarrativeExtractor | None = None,
        storage: JsonStoryStorage | None = None,
        reconciler: WorldStateReconciler | None = None,
    ) -> None:
        # Create the OpenAI client only when a live extraction is required. This
        # keeps cached demo replay and snapshot inspection usable offline.
        self.extractor = extractor
        self.storage = storage or JsonStoryStorage(
            os.getenv("STORYWORLD_DATA_DIR", "data")
        )
        self.reconciler = reconciler or WorldStateReconciler()

    def process_text(
        self,
        story_id: str,
        passage_id: str,
        text: str,
        replay_cached_extraction: bool = False,
    ) -> PassageResponse:
        sentences = segment_passage(passage_id, text)
        previous_snapshot = self.storage.load_latest_snapshot(story_id)

        extraction = None
        if replay_cached_extraction:
            extraction = self.storage.load_extraction(story_id, passage_id)
            if extraction is None:
                raise FileNotFoundError(
                    f"No cached extraction exists for {story_id}/{passage_id}"
                )
        if extraction is None:
            if self.extractor is None:
                self.extractor = OpenAIExtractor()
            extraction = self.extractor.extract(
                passage_id, sentences, previous_snapshot
            )
        validate_extraction_references(extraction)
        extraction = exclude_character_mentions(extraction)
        validate_extraction_references(extraction)

        response = self.reconciler.apply(previous_snapshot, extraction)
        self.storage.save_processing_artifacts(
            story_id, passage_id, sentences, extraction, response
        )
        return response

    def process_file(
        self,
        story_id: str,
        passage_id: str,
        path: str | Path,
        replay_cached_extraction: bool = False,
    ) -> PassageResponse:
        text = Path(path).read_text(encoding="utf-8")
        return self.process_text(
            story_id=story_id,
            passage_id=passage_id,
            text=text,
            replay_cached_extraction=replay_cached_extraction,
        )
