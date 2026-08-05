from __future__ import annotations

import json
import os
from typing import Protocol

from .models import ExtractionResult, SentenceUnit, WorldSnapshot


SYSTEM_PROMPT = """You extract grounded physical-world observations from literary passages.

Return only information supported by the supplied sentence units. The response is
validated against a strict schema.

Rules:
1. Extract locations, physical objects, architectural structures, and physically
   present characters. Do not extract thoughts, moods, or metaphors as objects.
2. Every mention and observation must cite one or more supplied sentence IDs.
3. Use an existing_entity_id only when the mention refers to the same persistent
   entity in the supplied world catalogue. Otherwise return null.
4. Give each mention a short semantic_type such as study, desk, armchair, key,
   window, door, portrait, corridor, or person. Do not include adjectives in it.
5. Extract semantic relations only. Never invent coordinates, rotations, asset
   paths, dimensions, or visual details not present in the text.
6. Use has_property with property_name and literal_value for attributes or states.
   For spatial predicates, property_name must be null. Use literal_value only when
   the relation targets a literal such as east or north.
7. "No longer on X" means not_on; it does not mean the entity was destroyed.
   A missing new position should stay unknown.
8. Use move/update/remove/reveal only when the passage contains a real transition
   cue. Use reaffirm when the passage repeats an unchanged fact. Use unknown when
   a new claim about an existing entity lacks a transition cue.
9. Do not silently resolve contradictions with the previous world. Extract the
   new claim faithfully and let deterministic code decide whether it conflicts.
10. Aliases belong to the same entity only when the context supports that match.
"""


class NarrativeExtractor(Protocol):
    def extract(
        self,
        passage_id: str,
        sentences: list[SentenceUnit],
        snapshot: WorldSnapshot,
    ) -> ExtractionResult: ...


def validate_extraction_references(extraction: ExtractionResult) -> None:
    mention_ids = [mention.mention_id for mention in extraction.mentions]
    if len(mention_ids) != len(set(mention_ids)):
        raise ValueError("Extraction contains duplicate mention IDs")
    known = set(mention_ids)
    if extraction.location_mention_id and extraction.location_mention_id not in known:
        raise ValueError("location_mention_id does not identify an extracted mention")
    for observation in extraction.observations:
        if observation.subject_mention_id not in known:
            raise ValueError(
                f"Observation references unknown subject mention: "
                f"{observation.subject_mention_id}"
            )
        if observation.object_mention_id and observation.object_mention_id not in known:
            raise ValueError(
                f"Observation references unknown object mention: "
                f"{observation.object_mention_id}"
            )


class OpenAIExtractor:
    """GPT-backed observation extractor using Pydantic constrained outputs."""

    def __init__(self, model: str | None = None, client: object | None = None) -> None:
        self.model = model or os.getenv("STORYWORLD_MODEL", "gpt-5.6-terra")
        if client is None:
            try:
                from openai import OpenAI
            except ImportError as exc:
                raise RuntimeError(
                    "The openai package is not installed. Run: pip install -e ."
                ) from exc
            client = OpenAI()
        self.client = client

    def extract(
        self,
        passage_id: str,
        sentences: list[SentenceUnit],
        snapshot: WorldSnapshot,
    ) -> ExtractionResult:
        payload = {
            "passage_id": passage_id,
            "sentences": [sentence.model_dump(mode="json") for sentence in sentences],
            "current_world": self._compact_world(snapshot),
        }

        response = self.client.responses.parse(
            model=self.model,
            reasoning={"effort": "low"},
            store=False,
            input=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(payload, ensure_ascii=False),
                },
            ],
            text_format=ExtractionResult,
        )

        extraction = response.output_parsed
        if extraction is None:
            raise RuntimeError("The model returned no parsed extraction")
        if extraction.passage_id != passage_id:
            raise ValueError(
                f"Model returned passage_id {extraction.passage_id!r}; expected {passage_id!r}"
            )
        validate_extraction_references(extraction)
        self._validate_evidence(extraction, sentences)
        return extraction

    @staticmethod
    def _compact_world(snapshot: WorldSnapshot) -> dict[str, object]:
        return {
            "story_id": snapshot.story_id,
            "version": snapshot.version,
            "locations": [
                {
                    "id": location.id,
                    "semantic_type": location.semantic_type,
                    "canonical_name": location.canonical_name,
                    "aliases": location.aliases,
                    "properties": location.properties,
                }
                for location in snapshot.locations
            ],
            "entities": [
                {
                    "id": entity.id,
                    "entity_type": entity.entity_type.value,
                    "semantic_type": entity.semantic_type,
                    "canonical_name": entity.canonical_name,
                    "aliases": entity.aliases,
                    "location_id": entity.location_id,
                    "properties": entity.properties,
                    "status": entity.status.value,
                }
                for entity in snapshot.entities
            ],
            "relations": [
                {
                    "subject_id": relation.subject_id,
                    "predicate": relation.predicate.value,
                    "object_id": relation.object_id,
                    "literal_value": relation.literal_value,
                }
                for relation in snapshot.relations
            ],
        }

    @staticmethod
    def _validate_evidence(
        extraction: ExtractionResult, sentences: list[SentenceUnit]
    ) -> None:
        valid_ids = {sentence.id for sentence in sentences}
        cited_ids = {
            evidence_id
            for mention in extraction.mentions
            for evidence_id in mention.evidence_ids
        } | {
            evidence_id
            for observation in extraction.observations
            for evidence_id in observation.evidence_ids
        }
        invalid_ids = sorted(cited_ids - valid_ids)
        if invalid_ids:
            raise ValueError(f"Extraction cited unknown evidence IDs: {invalid_ids}")
