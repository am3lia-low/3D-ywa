from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from .models import (
    Entity,
    EntityType,
    EvidenceRef,
    EvidenceType,
    ExtractionResult,
    Location,
    WorldSnapshot,
)


def _normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_") or "entity"


@dataclass
class ResolutionResult:
    snapshot: WorldSnapshot
    mention_to_id: dict[str, str]
    added_entity_ids: list[str] = field(default_factory=list)
    added_location_ids: list[str] = field(default_factory=list)
    active_location_id: str | None = None


class EntityResolver:
    def resolve(
        self, snapshot: WorldSnapshot, extraction: ExtractionResult
    ) -> ResolutionResult:
        updated = WorldSnapshot.model_validate(snapshot.model_dump(mode="json"))
        mapping: dict[str, str] = {}
        added_entities: list[str] = []
        added_locations: list[str] = []

        for mention in extraction.mentions:
            resolved_id = self._resolve_existing(updated, mention)
            if resolved_id is None:
                resolved_id = self._create_entity(updated, extraction, mention)
                if mention.entity_type == EntityType.LOCATION:
                    added_locations.append(resolved_id)
                else:
                    added_entities.append(resolved_id)
            else:
                self._record_aliases(updated, resolved_id, mention)
            mapping[mention.mention_id] = resolved_id

        active_location_id = None
        if extraction.location_mention_id:
            active_location_id = mapping.get(extraction.location_mention_id)
        if active_location_id is None and len(updated.locations) == 1:
            active_location_id = updated.locations[0].id

        for entity_id in added_entities:
            entity = next(entity for entity in updated.entities if entity.id == entity_id)
            if entity.location_id is None:
                entity.location_id = active_location_id

        return ResolutionResult(
            snapshot=updated,
            mention_to_id=mapping,
            added_entity_ids=added_entities,
            added_location_ids=added_locations,
            active_location_id=active_location_id,
        )

    def _resolve_existing(self, snapshot: WorldSnapshot, mention: object) -> str | None:
        existing_id = mention.existing_entity_id
        if existing_id:
            if mention.entity_type == EntityType.LOCATION:
                if any(location.id == existing_id for location in snapshot.locations):
                    return existing_id
            elif any(entity.id == existing_id for entity in snapshot.entities):
                return existing_id

        candidates: list[tuple[str, str, list[str]]] = []
        if mention.entity_type == EntityType.LOCATION:
            candidates = [
                (location.id, location.semantic_type, [location.canonical_name, *location.aliases])
                for location in snapshot.locations
            ]
        else:
            candidates = [
                (entity.id, entity.semantic_type, [entity.canonical_name, *entity.aliases])
                for entity in snapshot.entities
                if entity.entity_type == mention.entity_type
            ]

        same_kind = [
            candidate
            for candidate in candidates
            if _normalize(candidate[1]) == _normalize(mention.semantic_type)
        ]
        if len(same_kind) == 1:
            return same_kind[0][0]

        mention_names = [mention.surface, mention.canonical_name, *mention.aliases]
        best_id: str | None = None
        best_score = 0.0
        for candidate_id, _, names in candidates:
            score = max(
                SequenceMatcher(None, _normalize(left), _normalize(right)).ratio()
                for left in mention_names
                for right in names
                if left and right
            )
            if score > best_score:
                best_id, best_score = candidate_id, score
        return best_id if best_score >= 0.88 else None

    def _create_entity(
        self, snapshot: WorldSnapshot, extraction: ExtractionResult, mention: object
    ) -> str:
        prefix_source = (
            mention.canonical_name
            if mention.entity_type == EntityType.CHARACTER
            else mention.semantic_type
        )
        prefix = _slug(prefix_source)
        existing_ids = {
            location.id for location in snapshot.locations
        } | {entity.id for entity in snapshot.entities}
        counter = 1
        while f"{prefix}_{counter:02d}" in existing_ids:
            counter += 1
        entity_id = f"{prefix}_{counter:02d}"
        evidence = EvidenceRef(
            passage_id=extraction.passage_id,
            sentence_ids=mention.evidence_ids,
            evidence_type=EvidenceType.EXPLICIT,
        )
        aliases = sorted({mention.surface, *mention.aliases} - {mention.canonical_name})

        if mention.entity_type == EntityType.LOCATION:
            snapshot.locations.append(
                Location(
                    id=entity_id,
                    semantic_type=mention.semantic_type,
                    canonical_name=mention.canonical_name,
                    aliases=aliases,
                    evidence=[evidence],
                )
            )
        else:
            snapshot.entities.append(
                Entity(
                    id=entity_id,
                    entity_type=mention.entity_type,
                    semantic_type=mention.semantic_type,
                    canonical_name=mention.canonical_name,
                    aliases=aliases,
                    evidence=[evidence],
                )
            )
        return entity_id

    @staticmethod
    def _record_aliases(snapshot: WorldSnapshot, entity_id: str, mention: object) -> None:
        target = next(
            (
                item
                for item in [*snapshot.locations, *snapshot.entities]
                if item.id == entity_id
            ),
            None,
        )
        if target is None:
            return
        aliases = {target.canonical_name, *target.aliases}
        aliases.update({mention.surface, mention.canonical_name, *mention.aliases})
        aliases.discard(target.canonical_name)
        target.aliases = sorted(alias for alias in aliases if alias)
