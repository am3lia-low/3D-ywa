from __future__ import annotations

import re
from collections.abc import Iterable

from .handoff_models import (
    MainAddEntityOperation,
    MainAddRelationOperation,
    MainArtDirection,
    MainConflict,
    MainEntity,
    MainEntityChanges,
    MainEntityProvenance,
    MainEnvironment,
    MainLighting,
    MainLocation,
    MainPassageResponse,
    MainProcessingSummary,
    MainRelationMetadata,
    MainRemoveEntityOperation,
    MainRemoveRelationOperation,
    MainScenePalette,
    MainScenePatch,
    MainSpatialRelation,
    MainUpdateEntityOperation,
    MainVisualEntity,
    MainVisualEvidence,
    MainVisualLocation,
    MainVisualScenePlan,
    MainWorldSnapshot,
)
from .models import (
    Conflict,
    ConflictStatus,
    Entity,
    EntityStatus,
    EntityType,
    EvidenceType,
    PassageResponse,
    Predicate,
    WorldSnapshot,
)
from .semantics import normalize_wall, simplify_predicate


DEFAULT_BOUNDS = (18.0, 6.0, 18.0)
DEFAULT_ENVIRONMENT = MainEnvironment(
    floorColor="#44362f",
    wallColor="#a79b89",
    ambientColor="#b5b1a8",
)
DEFAULT_PALETTE = MainScenePalette(
    background="#10151a",
    fog="#293238",
    floor="#44362f",
    wall="#a79b89",
    timber="#382b25",
    ambient="#b5b1a8",
    keyLight="#c8d9e4",
    practical="#efa45b",
)


class MainContractAdapter:
    """Translate internal narrative state into the frozen shared runtime contract."""

    def passage_response(
        self,
        previous: WorldSnapshot,
        response: PassageResponse,
        sentence_lookup: dict[str, str] | None = None,
    ) -> MainPassageResponse:
        snapshot = self.world_snapshot(response.snapshot, sentence_lookup)
        previous_snapshot = (
            self.world_snapshot(previous, sentence_lookup)
            if previous.version > 0
            else None
        )
        patch = (
            self._scene_patch(previous_snapshot, snapshot)
            if previous_snapshot is not None
            else None
        )
        external_ids = {entity.id for entity in snapshot.entities}
        return MainPassageResponse(
            snapshot=snapshot,
            patch=patch,
            conflicts=[
                self._conflict(conflict, external_ids)
                for conflict in response.conflicts
            ],
            processing_summary=MainProcessingSummary(
                entities_added=response.processing_summary.entities_added,
                entities_moved=response.processing_summary.entities_moved,
                entities_updated=response.processing_summary.entities_updated,
            ),
            visual_plan=self.visual_plan(response.snapshot, snapshot),
        )

    def world_snapshot(
        self,
        snapshot: WorldSnapshot,
        sentence_lookup: dict[str, str] | None = None,
    ) -> MainWorldSnapshot:
        primary = snapshot.locations[0] if snapshot.locations else None
        location_id = primary.id if primary else self._fallback_location_id(snapshot.story_id)
        location_name = primary.canonical_name if primary else "Story scene"
        entities = [
            self._entity(entity, location_id, snapshot, sentence_lookup or {})
            for entity in snapshot.entities
            if entity.status != EntityStatus.REMOVED
            and entity.entity_type != EntityType.CHARACTER
        ]

        # Backward compatibility for old saved stories: any post-opening
        # locations become architecture inside the one persistent scene.
        for extra_location in snapshot.locations[1:]:
            state = {"semanticType": extra_location.semantic_type}
            state.update(extra_location.properties)
            entities.append(
                MainEntity(
                    id=extra_location.id,
                    name=extra_location.canonical_name,
                    kind="architecture",
                    locationId=location_id,
                    state=state,
                )
            )

        entity_ids = {entity.id for entity in entities}
        relations = [
            relation
            for relation in (
                self._relation(candidate, entity_ids)
                for candidate in snapshot.relations
            )
            if relation is not None
        ]
        conflicts = [
            self._conflict(conflict, entity_ids) for conflict in snapshot.conflicts
        ]
        return MainWorldSnapshot(
            storyId=snapshot.story_id,
            version=snapshot.version,
            passageId=snapshot.passage_id or "P0",
            locations=[
                MainLocation(
                    id=location_id,
                    name=location_name,
                    bounds=DEFAULT_BOUNDS,
                    environment=DEFAULT_ENVIRONMENT,
                )
            ],
            entities=entities,
            relations=relations,
            conflicts=conflicts,
        )

    def visual_plan(
        self,
        internal: WorldSnapshot,
        snapshot: MainWorldSnapshot,
    ) -> MainVisualScenePlan:
        passage_id = snapshot.passageId
        source_by_id = {entity.id: entity for entity in internal.entities}
        materials = sorted(
            {
                str(entity.state["material"])
                for entity in snapshot.entities
                if entity.state.get("material")
            }
        ) or ["aged wood", "stone", "natural fabric"]
        temperature = " ".join(
            location.properties.get("temperature", "")
            for location in internal.locations[:1]
        ).lower()
        warmth = "cool" if "cold" in temperature else "neutral"

        visual_entities: list[MainVisualEntity] = []
        for entity in snapshot.entities:
            source = source_by_id.get(entity.id)
            description_parts = [entity.name]
            for key in ("color", "material", "condition", "orientation", "state"):
                if value := entity.state.get(key):
                    description_parts.append(f"{key}: {value}")
            evidence_type = (
                source.evidence[-1].evidence_type
                if source and source.evidence
                else EvidenceType.STRONG_IMPLICATION
            )
            visual_entities.append(
                MainVisualEntity(
                    entityId=entity.id,
                    visualDescription="; ".join(description_parts) + ".",
                    importance=self._importance(entity),
                    materials=(
                        [str(entity.state["material"])]
                        if entity.state.get("material")
                        else []
                    ),
                    colors=(
                        [str(entity.state["color"])]
                        if entity.state.get("color")
                        else []
                    ),
                    condition=(
                        str(entity.state["condition"])
                        if entity.state.get("condition")
                        else None
                    ),
                    assetSearchTags=self._asset_tags(entity),
                    evidence=MainVisualEvidence(
                        passageIds=[passage_id],
                        confidence=self._confidence(evidence_type),
                        basis=(
                            "explicit_text"
                            if evidence_type == EvidenceType.EXPLICIT
                            else "cross_passage_inference"
                        ),
                    ),
                )
            )

        location = snapshot.locations[0]
        previous_plan_version = snapshot.version - 1 if snapshot.version > 1 else None
        return MainVisualScenePlan(
            storyId=snapshot.storyId,
            segmentId=f"segment-{passage_id}",
            sourcePassageIds=[passage_id],
            snapshotVersion=snapshot.version,
            planVersion=max(1, snapshot.version),
            previousPlanVersion=previous_plan_version,
            artDirection=MainArtDirection(
                styleLabel="cinematic storybook realism",
                stylePrompt=(
                    "A cohesive, grounded literary interior with readable silhouettes, "
                    "tactile materials, and restrained atmospheric depth."
                ),
                negativePrompt=[
                    "floating props",
                    "flat placeholder primitives",
                    "modern plastic",
                    "inconsistent scale",
                ],
                materialVocabulary=materials,
            ),
            locations=[
                MainVisualLocation(
                    locationId=location.id,
                    archetype="generic-interior",
                    visualDescription=(
                        f"A persistent interpretation of {location.name} that contains "
                        "all passage discoveries in one explorable scene."
                    ),
                    architectureTags=["interior", "persistent-story-scene"],
                    dressingTags=["literary-props", "subtle-room-dressing"],
                    dressingDensity="moderate",
                    mood="quiet, mysterious, and grounded",
                    timeOfDay="soft interior light",
                    palette=DEFAULT_PALETTE,
                    lighting=MainLighting(
                        warmth=warmth,
                        contrast="medium",
                        ambientIntensity=0.65,
                        keyIntensity=1.3,
                        atmosphericEffects=["soft dust motes"],
                    ),
                    evidence=MainVisualEvidence(
                        passageIds=[passage_id],
                        confidence=0.7,
                        basis="art_direction_default",
                    ),
                )
            ],
            entities=visual_entities,
            presentationConnections=[],
            unresolvedQuestions=[],
        )

    def _entity(
        self,
        entity: Entity,
        location_id: str,
        snapshot: WorldSnapshot,
        sentence_lookup: dict[str, str],
    ) -> MainEntity:
        state: dict[str, object] = {
            "semanticType": entity.semantic_type,
            "status": entity.status.value,
        }
        state.update(entity.properties)
        for relation in snapshot.relations:
            if (
                relation.subject_id == entity.id
                and simplify_predicate(relation.predicate) == Predicate.INSIDE
                and relation.literal_value
            ):
                state["containerRegion"] = relation.literal_value
        evidence = entity.evidence[0] if entity.evidence else None
        sentence = None
        if evidence:
            sentence_parts = [
                sentence_lookup[sentence_id]
                for sentence_id in evidence.sentence_ids
                if sentence_id in sentence_lookup
            ]
            sentence = " ".join(sentence_parts) or None
        return MainEntity(
            id=entity.id,
            name=entity.canonical_name,
            kind=self._kind(entity),
            locationId=location_id,
            state=state,
            provenance=(
                MainEntityProvenance(
                    passageId=evidence.passage_id,
                    sentence=sentence,
                    confidence=self._confidence(evidence.evidence_type),
                )
                if evidence
                else None
            ),
        )

    @staticmethod
    def _kind(entity: Entity) -> str:
        semantic = entity.semantic_type.lower()
        if entity.entity_type == EntityType.STRUCTURE or semantic in {
            "door",
            "doorway",
            "window",
            "fireplace",
            "wall",
            "corridor",
        }:
            return "architecture"
        if semantic in {
            "armchair",
            "bench",
            "bookcase",
            "chair",
            "desk",
            "shelf",
            "sofa",
            "table",
        }:
            return "furniture"
        if semantic in {"lamp", "lantern", "candle", "light"}:
            return "light"
        if semantic in {"cabinet", "chest", "crate"}:
            return "container"
        return "decor"

    @staticmethod
    def _relation(
        relation: object,
        entity_ids: set[str],
    ) -> MainSpatialRelation | None:
        predicate = simplify_predicate(relation.predicate)
        if relation.subject_id not in entity_ids:
            return None
        if predicate == Predicate.AGAINST_WALL:
            wall = normalize_wall(relation.literal_value)
            return MainSpatialRelation(
                id=relation.id,
                subjectId=relation.subject_id,
                predicate=predicate.value,
                metadata=(MainRelationMetadata(wall=wall) if wall else None),
            )
        if predicate == Predicate.CENTERED:
            return MainSpatialRelation(
                id=relation.id,
                subjectId=relation.subject_id,
                predicate=predicate.value,
            )
        if predicate not in {
            Predicate.LEFT_OF,
            Predicate.RIGHT_OF,
            Predicate.IN_FRONT_OF,
            Predicate.BEHIND,
            Predicate.NEAR,
            Predicate.ON,
            Predicate.INSIDE,
        }:
            return None
        if relation.object_id not in entity_ids:
            return None
        return MainSpatialRelation(
            id=relation.id,
            subjectId=relation.subject_id,
            predicate=predicate.value,
            objectId=relation.object_id,
            distance=0.6 if predicate == Predicate.NEAR else None,
        )

    def _scene_patch(
        self,
        before: MainWorldSnapshot,
        after: MainWorldSnapshot,
    ) -> MainScenePatch:
        if [location.model_dump() for location in before.locations] != [
            location.model_dump() for location in after.locations
        ]:
            raise ValueError("The one-location renderer contract cannot change locations")

        operations = []
        before_entities = {entity.id: entity for entity in before.entities}
        after_entities = {entity.id: entity for entity in after.entities}
        before_relations = {relation.id: relation for relation in before.relations}
        after_relations = {relation.id: relation for relation in after.relations}

        for relation_id in sorted(before_relations.keys() - after_relations.keys()):
            operations.append(MainRemoveRelationOperation(relationId=relation_id))
        for entity_id in sorted(before_entities.keys() - after_entities.keys()):
            operations.append(MainRemoveEntityOperation(entityId=entity_id))
        for entity_id in sorted(after_entities.keys() - before_entities.keys()):
            operations.append(MainAddEntityOperation(entity=after_entities[entity_id]))
        for entity_id in sorted(before_entities.keys() & after_entities.keys()):
            old = before_entities[entity_id]
            new = after_entities[entity_id]
            changes: dict[str, object] = {}
            if old.name != new.name:
                changes["name"] = new.name
            if old.kind != new.kind:
                changes["kind"] = new.kind
            if old.state != new.state:
                removed_keys = old.state.keys() - new.state.keys()
                if removed_keys:
                    raise ValueError(
                        f"Renderer state keys cannot be removed by update_entity: "
                        f"{entity_id} {sorted(removed_keys)}"
                    )
                changes["state"] = new.state
            if changes:
                operations.append(
                    MainUpdateEntityOperation(
                        entityId=entity_id,
                        changes=MainEntityChanges(**changes),
                    )
                )
        for relation_id in sorted(after_relations):
            if (
                relation_id not in before_relations
                or before_relations[relation_id] != after_relations[relation_id]
            ):
                operations.append(
                    MainAddRelationOperation(relation=after_relations[relation_id])
                )

        return MainScenePatch(
            fromVersion=before.version,
            toVersion=after.version,
            operations=operations,
        )

    @staticmethod
    def _conflict(conflict: Conflict, entity_ids: set[str]) -> MainConflict:
        claim_text = []
        passage_ids = {conflict.created_in_passage_id}
        for claim in conflict.claims:
            target = claim.object_id or claim.literal_value or "unspecified"
            claim_text.append(f"{claim.predicate.value} {target}")
            for evidence in claim.evidence:
                passage_ids.add(evidence.passage_id)
        return MainConflict(
            id=conflict.id,
            entityId=next(
                (entity_id for entity_id in conflict.entity_ids if entity_id in entity_ids),
                None,
            ),
            description=(
                f"{conflict.kind.replace('_', ' ')}: " + " versus ".join(claim_text)
            ),
            status=(
                "resolved"
                if conflict.status == ConflictStatus.RESOLVED
                else "open"
            ),
            passageIds=sorted(passage_ids),
        )

    @staticmethod
    def _importance(entity: MainEntity) -> str:
        semantic = str(entity.state.get("semanticType", "")).lower()
        if semantic in {"doorway", "key", "portrait"}:
            return "hero"
        if entity.kind in {"architecture", "furniture"}:
            return "supporting"
        return "background"

    @staticmethod
    def _asset_tags(entity: MainEntity) -> list[str]:
        values: Iterable[str] = (
            entity.name.lower(),
            str(entity.state.get("semanticType", entity.kind)).lower(),
            entity.kind,
        )
        return list(dict.fromkeys(value for value in values if value))

    @staticmethod
    def _confidence(evidence_type: EvidenceType) -> float:
        return {
            EvidenceType.EXPLICIT: 0.95,
            EvidenceType.STRONG_IMPLICATION: 0.75,
            EvidenceType.WEAK_INFERENCE: 0.55,
        }[evidence_type]

    @staticmethod
    def _fallback_location_id(story_id: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", story_id.lower()).strip("-")
        return f"{slug or 'story'}-scene"
