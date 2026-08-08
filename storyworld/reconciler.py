from __future__ import annotations

from .models import (
    ChangeType,
    Conflict,
    ConflictClaim,
    EntityStatus,
    EvidenceRef,
    ExtractionResult,
    PatchOperation,
    PatchOperationType,
    PassageResponse,
    Predicate,
    ProcessingSummary,
    ScenePatch,
    SpatialRelation,
    WorldSnapshot,
)
from .resolver import EntityResolver
from .semantics import normalize_property, simplify_predicate


PLACEMENT_PREDICATES = {
    Predicate.INSIDE,
    Predicate.ON,
    Predicate.NEAR,
    Predicate.LEFT_OF,
    Predicate.RIGHT_OF,
    Predicate.IN_FRONT_OF,
    Predicate.CENTERED,
    Predicate.BESIDE,
    Predicate.ABOVE,
    Predicate.BENEATH,
    Predicate.BEHIND,
    Predicate.OPPOSITE,
    Predicate.AGAINST_WALL,
    Predicate.AGAINST,
}

NEGATIVE_TO_POSITIVE = {
    Predicate.NOT_ON: Predicate.ON,
    Predicate.NOT_INSIDE: Predicate.INSIDE,
    Predicate.NOT_PRESENT_IN: Predicate.INSIDE,
}


class WorldStateReconciler:
    def __init__(self, resolver: EntityResolver | None = None) -> None:
        self.resolver = resolver or EntityResolver()

    def apply(
        self, snapshot: WorldSnapshot, extraction: ExtractionResult
    ) -> PassageResponse:
        resolution = self.resolver.resolve(snapshot, extraction)
        updated = resolution.snapshot
        operations: list[PatchOperation] = []
        new_conflicts: list[Conflict] = []

        for location_id in resolution.added_location_ids:
            operations.append(
                PatchOperation(
                    operation=PatchOperationType.DISCOVER_LOCATION,
                    location_id=location_id,
                )
            )
        for entity_id in resolution.added_entity_ids:
            operations.append(
                PatchOperation(
                    operation=PatchOperationType.ADD_ENTITY,
                    entity_id=entity_id,
                    location_id=self._entity_location(updated, entity_id),
                )
            )

        for observation in extraction.observations:
            subject_id = resolution.mention_to_id.get(observation.subject_mention_id)
            if subject_id is None:
                raise ValueError(
                    f"Unknown subject mention: {observation.subject_mention_id}"
                )
            object_id = (
                resolution.mention_to_id.get(observation.object_mention_id)
                if observation.object_mention_id
                else None
            )
            evidence = EvidenceRef(
                passage_id=extraction.passage_id,
                sentence_ids=observation.evidence_ids,
                evidence_type=observation.evidence_type,
            )

            if observation.predicate == Predicate.HAS_PROPERTY:
                conflict = self._apply_property(
                    updated,
                    subject_id,
                    observation.property_name,
                    observation.literal_value,
                    observation.change_type,
                    evidence,
                    operations,
                )
                if conflict:
                    self._collect_conflict(updated, new_conflicts, conflict)
                continue

            if observation.predicate in NEGATIVE_TO_POSITIVE:
                self._apply_negative_relation(
                    updated,
                    subject_id,
                    NEGATIVE_TO_POSITIVE[observation.predicate],
                    object_id,
                    observation.evidence_ids,
                    operations,
                )
                continue

            conflict = self._apply_positive_relation(
                updated,
                subject_id,
                simplify_predicate(observation.predicate),
                object_id,
                observation.literal_value,
                observation.change_type,
                evidence,
                operations,
            )
            if conflict:
                self._collect_conflict(updated, new_conflicts, conflict)

        for conflict in new_conflicts:
            updated.conflicts.append(conflict)
            operations.append(
                PatchOperation(
                    operation=PatchOperationType.REGISTER_CONFLICT,
                    entity_id=conflict.entity_ids[0] if conflict.entity_ids else None,
                    conflict_id=conflict.id,
                )
            )

        from_version = snapshot.version
        updated.version = from_version + 1
        updated.passage_id = extraction.passage_id
        patch = ScenePatch(
            from_version=from_version,
            to_version=updated.version,
            operations=operations,
        )
        return PassageResponse(
            snapshot=updated,
            patch=patch,
            conflicts=new_conflicts,
            processing_summary=self._summarize(operations),
        )

    def _apply_property(
        self,
        snapshot: WorldSnapshot,
        subject_id: str,
        property_name: str | None,
        value: str | None,
        change_type: ChangeType,
        evidence: EvidenceRef,
        operations: list[PatchOperation],
    ) -> Conflict | None:
        if not property_name or value is None:
            raise ValueError("has_property requires property_name and literal_value")
        target = self._find_world_item(snapshot, subject_id)
        if target is None:
            raise ValueError(f"Unknown world item: {subject_id}")
        property_key, value = normalize_property(
            property_name.value,
            value,
            getattr(target, "semantic_type", None),
        )
        old_value = target.properties.get(property_key)
        if old_value == value:
            return None

        change_allowed = old_value is None or change_type in {
            ChangeType.ADD,
            ChangeType.ESTABLISH,
            ChangeType.MOVE,
            ChangeType.REMOVE,
            ChangeType.REVEAL,
            ChangeType.UPDATE,
        }
        if not change_allowed:
            return self._make_property_conflict(
                snapshot,
                subject_id,
                property_key,
                old_value,
                value,
                evidence,
            )

        target.properties[property_key] = value
        target.evidence.append(evidence)
        operations.append(
            PatchOperation(
                operation=PatchOperationType.UPDATE_PROPERTY,
                entity_id=subject_id,
                property_name=property_key,
                old_value=old_value,
                new_value=value,
                evidence_ids=evidence.sentence_ids,
            )
        )
        if change_type == ChangeType.REMOVE and hasattr(target, "status"):
            target.status = EntityStatus.REMOVED
        return None

    def _apply_negative_relation(
        self,
        snapshot: WorldSnapshot,
        subject_id: str,
        positive_predicate: Predicate,
        object_id: str | None,
        evidence_ids: list[str],
        operations: list[PatchOperation],
    ) -> None:
        removed = [
            relation
            for relation in snapshot.relations
            if relation.subject_id == subject_id
            and relation.predicate == positive_predicate
            and (object_id is None or relation.object_id == object_id)
        ]
        snapshot.relations = [
            relation for relation in snapshot.relations if relation not in removed
        ]
        for relation in removed:
            operations.append(
                PatchOperation(
                    operation=PatchOperationType.REMOVE_RELATION,
                    entity_id=subject_id,
                    relation=relation,
                    evidence_ids=evidence_ids,
                )
            )

        entity = next(
            (entity for entity in snapshot.entities if entity.id == subject_id), None
        )
        still_placed = any(
            relation.subject_id == subject_id
            and relation.predicate in PLACEMENT_PREDICATES
            for relation in snapshot.relations
        )
        if entity and not still_placed:
            entity.status = EntityStatus.UNKNOWN_LOCATION

    def _apply_positive_relation(
        self,
        snapshot: WorldSnapshot,
        subject_id: str,
        predicate: Predicate,
        object_id: str | None,
        literal_value: str | None,
        change_type: ChangeType,
        evidence: EvidenceRef,
        operations: list[PatchOperation],
    ) -> Conflict | None:
        identical = next(
            (
                relation
                for relation in snapshot.relations
                if relation.subject_id == subject_id
                and relation.predicate == predicate
                and relation.object_id == object_id
                and relation.literal_value == literal_value
            ),
            None,
        )
        if identical:
            identical.evidence.append(evidence)
            return None

        existing_placements = [
            relation
            for relation in snapshot.relations
            if relation.subject_id == subject_id
            and relation.predicate in PLACEMENT_PREDICATES
        ]
        # A first placement is an addition, even when the passage says the
        # subject "moved" into the scene. Only remove prior placements when
        # the entity already has somewhere to move from.
        is_move = change_type == ChangeType.MOVE and bool(existing_placements)
        is_new_subject = not existing_placements

        if predicate in PLACEMENT_PREDICATES and existing_placements and not is_move:
            previous = self._find_incompatible(existing_placements, predicate, object_id, literal_value)
            if previous is not None:
                return self._make_spatial_conflict(
                    snapshot,
                    subject_id,
                    previous,
                    predicate,
                    object_id,
                    literal_value,
                    evidence,
                )

        relation = SpatialRelation(
            id=self._next_id("rel", len(snapshot.relations) + 1, {
                item.id for item in snapshot.relations
            }),
            subject_id=subject_id,
            predicate=predicate,
            object_id=object_id,
            literal_value=literal_value,
            evidence=[evidence],
        )

        if is_move and predicate in PLACEMENT_PREDICATES:
            removed = existing_placements
            snapshot.relations = [
                current for current in snapshot.relations if current not in removed
            ]
            snapshot.relations.append(relation)
            entity = next(
                (entity for entity in snapshot.entities if entity.id == subject_id), None
            )
            if entity:
                entity.status = EntityStatus.ACTIVE
            operations.append(
                PatchOperation(
                    operation=PatchOperationType.MOVE_ENTITY,
                    entity_id=subject_id,
                    relation=relation,
                    evidence_ids=evidence.sentence_ids,
                )
            )
            return None

        snapshot.relations.append(relation)
        operations.append(
            PatchOperation(
                operation=PatchOperationType.ADD_RELATION,
                entity_id=subject_id,
                relation=relation,
                evidence_ids=evidence.sentence_ids,
            )
        )
        return None

    @staticmethod
    def _find_incompatible(
        existing: list[SpatialRelation],
        predicate: Predicate,
        object_id: str | None,
        literal_value: str | None,
    ) -> SpatialRelation | None:
        for relation in existing:
            if relation.predicate == predicate and (
                relation.object_id != object_id
                or relation.literal_value != literal_value
            ):
                return relation
            if {
                relation.predicate,
                predicate,
            } in (
                {Predicate.OPPOSITE, Predicate.BENEATH},
                {Predicate.ABOVE, Predicate.BENEATH},
                {Predicate.ON, Predicate.INSIDE},
            ) and relation.object_id == object_id:
                return relation
            # An existing anchored placement plus a new unsupported placement for
            # the same entity is ambiguous. A real move must use change_type=move.
            if relation.predicate == Predicate.AGAINST_WALL:
                return relation
        return None

    def _make_spatial_conflict(
        self,
        snapshot: WorldSnapshot,
        subject_id: str,
        previous: SpatialRelation,
        predicate: Predicate,
        object_id: str | None,
        literal_value: str | None,
        evidence: EvidenceRef,
    ) -> Conflict:
        return Conflict(
            id=self._next_id(
                "conflict",
                len(snapshot.conflicts) + 1,
                {conflict.id for conflict in snapshot.conflicts},
            ),
            kind="spatial_contradiction",
            entity_ids=[subject_id],
            claims=[
                ConflictClaim(
                    predicate=previous.predicate,
                    object_id=previous.object_id,
                    literal_value=previous.literal_value,
                    evidence=previous.evidence,
                ),
                ConflictClaim(
                    predicate=predicate,
                    object_id=object_id,
                    literal_value=literal_value,
                    evidence=[evidence],
                ),
            ],
            created_in_passage_id=evidence.passage_id,
        )

    def _make_property_conflict(
        self,
        snapshot: WorldSnapshot,
        subject_id: str,
        property_name: str,
        old_value: str | None,
        new_value: str,
        evidence: EvidenceRef,
    ) -> Conflict:
        return Conflict(
            id=self._next_id(
                "conflict",
                len(snapshot.conflicts) + 1,
                {conflict.id for conflict in snapshot.conflicts},
            ),
            kind=f"property_contradiction:{property_name}",
            entity_ids=[subject_id],
            claims=[
                ConflictClaim(
                    predicate=Predicate.HAS_PROPERTY,
                    literal_value=old_value,
                ),
                ConflictClaim(
                    predicate=Predicate.HAS_PROPERTY,
                    literal_value=new_value,
                    evidence=[evidence],
                ),
            ],
            created_in_passage_id=evidence.passage_id,
        )

    @staticmethod
    def _find_world_item(snapshot: WorldSnapshot, item_id: str) -> object | None:
        return next(
            (
                item
                for item in [*snapshot.locations, *snapshot.entities]
                if item.id == item_id
            ),
            None,
        )

    @classmethod
    def _collect_conflict(
        cls,
        snapshot: WorldSnapshot,
        pending: list[Conflict],
        conflict: Conflict,
    ) -> None:
        existing = {item.id for item in snapshot.conflicts} | {
            item.id for item in pending
        }
        if conflict.id in existing:
            conflict.id = cls._next_id("conflict", len(existing) + 1, existing)
        pending.append(conflict)

    @staticmethod
    def _entity_location(snapshot: WorldSnapshot, entity_id: str) -> str | None:
        entity = next(
            (entity for entity in snapshot.entities if entity.id == entity_id), None
        )
        return entity.location_id if entity else None

    @staticmethod
    def _next_id(prefix: str, start: int, existing: set[str]) -> str:
        counter = start
        while f"{prefix}_{counter:03d}" in existing:
            counter += 1
        return f"{prefix}_{counter:03d}"

    @staticmethod
    def _summarize(operations: list[PatchOperation]) -> ProcessingSummary:
        counts = {operation: 0 for operation in PatchOperationType}
        for item in operations:
            counts[item.operation] += 1
        return ProcessingSummary(
            entities_added=counts[PatchOperationType.ADD_ENTITY],
            locations_discovered=counts[PatchOperationType.DISCOVER_LOCATION],
            entities_moved=counts[PatchOperationType.MOVE_ENTITY],
            entities_updated=counts[PatchOperationType.UPDATE_PROPERTY],
            entities_removed=counts[PatchOperationType.REMOVE_ENTITY],
            relations_added=counts[PatchOperationType.ADD_RELATION],
            relations_removed=counts[PatchOperationType.REMOVE_RELATION],
            conflicts_added=counts[PatchOperationType.REGISTER_CONFLICT],
        )
