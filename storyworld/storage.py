from __future__ import annotations

import re
from pathlib import Path

from .models import (
    ExtractionResult,
    PassageResponse,
    ScenePatch,
    SentenceUnit,
    WorldSnapshot,
)


_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")


class JsonStoryStorage:
    def __init__(self, root: str | Path = "data") -> None:
        self.root = Path(root)

    def load_latest_snapshot(self, story_id: str) -> WorldSnapshot:
        story_dir = self._story_dir(story_id)
        snapshot_dir = story_dir / "snapshots"
        candidates = sorted(
            snapshot_dir.glob("snapshot_v*.json"),
            key=lambda path: int(path.stem.removeprefix("snapshot_v")),
        )
        if not candidates:
            return WorldSnapshot.empty(story_id)
        return WorldSnapshot.model_validate_json(candidates[-1].read_text(encoding="utf-8"))

    def load_extraction(
        self, story_id: str, passage_id: str
    ) -> ExtractionResult | None:
        path = self._story_dir(story_id) / "extractions" / f"{self._safe(passage_id)}.json"
        if not path.exists():
            return None
        return ExtractionResult.model_validate_json(path.read_text(encoding="utf-8"))

    def save_processing_artifacts(
        self,
        story_id: str,
        passage_id: str,
        sentences: list[SentenceUnit],
        extraction: ExtractionResult,
        response: PassageResponse,
    ) -> None:
        story_dir = self._story_dir(story_id)
        safe_passage = self._safe(passage_id)
        self._write_json(
            story_dir / "sentences" / f"{safe_passage}.json",
            "[\n"
            + ",\n".join(
                sentence.model_dump_json(indent=2) for sentence in sentences
            )
            + "\n]",
        )
        self._write_json(
            story_dir / "extractions" / f"{safe_passage}.json",
            extraction.model_dump_json(indent=2),
        )
        self._write_json(
            story_dir
            / "snapshots"
            / f"snapshot_v{response.snapshot.version}.json",
            response.snapshot.model_dump_json(indent=2),
        )
        self._write_json(
            story_dir
            / "patches"
            / f"patch_v{response.patch.from_version}_v{response.patch.to_version}.json",
            response.patch.model_dump_json(indent=2),
        )
        if response.conflicts:
            self._write_json(
                story_dir / "conflicts" / f"{safe_passage}.json",
                "[\n"
                + ",\n".join(
                    conflict.model_dump_json(indent=2)
                    for conflict in response.conflicts
                )
                + "\n]",
            )

    def load_patch(self, story_id: str, from_version: int, to_version: int) -> ScenePatch:
        path = (
            self._story_dir(story_id)
            / "patches"
            / f"patch_v{from_version}_v{to_version}.json"
        )
        return ScenePatch.model_validate_json(path.read_text(encoding="utf-8"))

    def _story_dir(self, story_id: str) -> Path:
        return self.root / self._safe(story_id)

    @staticmethod
    def _safe(value: str) -> str:
        if not _SAFE_ID.fullmatch(value):
            raise ValueError(
                "IDs may contain only letters, numbers, underscores, and hyphens"
            )
        return value

    @staticmethod
    def _write_json(path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content + "\n", encoding="utf-8")

