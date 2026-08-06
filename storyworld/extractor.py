from __future__ import annotations

import json
import os
from typing import Protocol

from dotenv import load_dotenv

from .models import EntityType, ExtractionResult, SentenceUnit, WorldSnapshot


SYSTEM_PROMPT = """You extract grounded physical-world observations from literary passages.

Return only information supported by the supplied sentence units. The response is
validated against a strict schema.

Rules:
1. Extract locations, physical objects, and architectural structures. Do not
   extract characters, people, body parts, thoughts, moods, or metaphors. The
   current renderer deliberately presents an unpopulated environment.
2. Every mention and observation must cite one or more supplied sentence IDs.
3. Use an existing_entity_id only when the mention refers to the same persistent
   entity in the supplied world catalogue. Otherwise return null.
4. Give each mention a short semantic_type such as study, desk, armchair, key,
   window, door, portrait, or corridor. Do not include adjectives in it.
5. Do not create entities for generic walls, floors, ceilings, or directional
   room surfaces. Convert "against the east wall" into against_wall with
   literal_value "east". If an item is on the floor, omit the generic floor and
   extract its more useful nearby object relation when one is stated.
6. Do not create separate entities for inseparable components such as a picture
   frame or a desk drawer unless the component is independently manipulated.
   Store frame appearance as a property. Treat "hidden panel" as an alias for
   the doorway it opens. Represent "in the top drawer" as the entity being
   inside the desk with literal_value "top drawer".
7. Extract every explicitly stated renderer-relevant trait using has_property:
   colors, materials, condition, state, orientation, size, shape, temperature,
   lighting, length, direction, and frame style. Use the schema's canonical
   property names; for example locked/open/closed use property_name "state" and
   crooked/tilted use "orientation". Metallic substance words describe material:
   a "silver key" has material "silver", not color "silver". Crimson is a red
   color description.
8. Keep exactly one world location. Reuse the existing location when present.
   Treat later rooms, corridors, passages, alcoves, and similar discoveries as
   architectural structures inside that location, not as new locations.
9. Use has_property with property_name and literal_value for attributes or states.
   For spatial predicates, property_name must be null. Use literal_value only when
   the relation targets a wall direction or a container region such as top drawer.
   Do not emit inside relations merely to repeat membership in the sole location.
10. Use only the renderer's spatial grammar: left_of, right_of, in_front_of,
    behind, near, on, inside, against_wall, and centered. Normalize wording as
    follows: beside/next to/above/beneath/against becomes near; opposite, across
    from, or facing becomes in_front_of. When prose says an item is "on the floor
    beside X", emit the item near X and do not create a floor entity. A doorway
    and corridor in this one-location MVP may be near each other; never emit
    leads_to or connected_to.
11. Ignore transient viewpoint phrases such as "behind her" or "in front of him"
    unless they describe a stable object-to-object placement needed by the scene.
12. "No longer on X" means not_on; it does not mean the entity was destroyed.
   A missing new position should stay unknown.
13. Use move/update/remove/reveal only when the passage contains a real transition
   cue. Use reaffirm when the passage repeats an unchanged fact. Use unknown when
   a new claim about an existing entity lacks a transition cue.
14. Do not silently resolve contradictions with the previous world. Extract the
   new claim faithfully and let deterministic code decide whether it conflicts.
15. Aliases belong to the same entity only when the context supports that match.
16. Extract semantic relations only. Never invent coordinates, rotations, asset
    paths, dimensions, or visual details not present in the text.
"""


class NarrativeExtractor(Protocol):
    def extract(
        self,
        passage_id: str,
        sentences: list[SentenceUnit],
        snapshot: WorldSnapshot,
    ) -> ExtractionResult: ...


def exclude_character_mentions(extraction: ExtractionResult) -> ExtractionResult:
    """Apply the team's environment-only MVP policy to any extractor output."""
    character_ids = {
        mention.mention_id
        for mention in extraction.mentions
        if mention.entity_type == EntityType.CHARACTER
    }
    if not character_ids:
        return extraction
    return extraction.model_copy(
        deep=True,
        update={
            "location_mention_id": (
                None
                if extraction.location_mention_id in character_ids
                else extraction.location_mention_id
            ),
            "mentions": [
                mention
                for mention in extraction.mentions
                if mention.mention_id not in character_ids
            ],
            "observations": [
                observation
                for observation in extraction.observations
                if observation.subject_mention_id not in character_ids
                and observation.object_mention_id not in character_ids
            ],
        },
    )


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
        load_dotenv()
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

        try:
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
        except Exception as exc:
            safe_message = self._safe_api_error(type(exc).__name__)
            if safe_message:
                raise RuntimeError(safe_message) from exc
            raise

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
    def _safe_api_error(error_name: str) -> str | None:
        messages = {
            "AuthenticationError": (
                "OpenAI authentication failed. Replace OPENAI_API_KEY in .env "
                "with an active Platform API key."
            ),
            "PermissionDeniedError": (
                "The OpenAI project does not have permission to use the selected model."
            ),
            "NotFoundError": (
                "The selected OpenAI model is not available to this API project."
            ),
            "RateLimitError": (
                "OpenAI rate limit or project quota was reached. Check project billing "
                "and usage limits before retrying."
            ),
            "APIConnectionError": (
                "Could not connect to OpenAI. Check the network and retry."
            ),
            "APITimeoutError": "The OpenAI request timed out. Retry the passage.",
            "InternalServerError": (
                "OpenAI returned a temporary server error. Retry the passage."
            ),
        }
        return messages.get(error_name)

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
                if entity.entity_type != EntityType.CHARACTER
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
