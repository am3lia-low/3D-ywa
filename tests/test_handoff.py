from __future__ import annotations

import tempfile
import unittest

from storyworld.handoff import MainContractAdapter
from storyworld.handoff_models import (
    MainAddEntityOperation,
    MainAddRelationOperation,
    MainRemoveEntityOperation,
    MainRemoveRelationOperation,
    MainUpdateEntityOperation,
    MainWorldSnapshot,
)
from storyworld.models import Predicate
from storyworld.pipeline import NarrativePipeline
from storyworld.semantics import (
    normalize_property,
    normalize_property_value,
    simplify_predicate,
)
from storyworld.storage import JsonStoryStorage
from tests.test_pipeline import FixtureExtractor, ROOT


class HandoffTests(unittest.TestCase):
    def test_four_passage_patches_reproduce_main_snapshots(self) -> None:
        adapter = MainContractAdapter()
        with tempfile.TemporaryDirectory() as temp:
            storage = JsonStoryStorage(temp)
            pipeline = NarrativePipeline(
                extractor=FixtureExtractor(),
                storage=storage,
            )
            mounted: MainWorldSnapshot | None = None
            for number in range(1, 5):
                previous = storage.load_latest_snapshot("study-main")
                internal = pipeline.process_file(
                    story_id="study-main",
                    passage_id=f"P{number}",
                    path=ROOT / f"passage_{number}.txt",
                )
                response = adapter.passage_response(previous, internal)
                self.assertEqual(len(response.snapshot.locations), 1)
                self.assertFalse(
                    any(entity.kind == "character" for entity in response.snapshot.entities)
                )
                self.assertFalse(
                    any(
                        entity.entityId == "mara_01"
                        for entity in response.visual_plan.entities
                    )
                )
                if mounted is None:
                    self.assertIsNone(response.patch)
                    mounted = response.snapshot
                else:
                    self.assertIsNotNone(response.patch)
                    mounted = self._apply(mounted, response.patch)
                    self.assertEqual(
                        self._spatial_signature(mounted),
                        self._spatial_signature(response.snapshot),
                    )

    def test_semantic_simplification_and_property_normalization(self) -> None:
        self.assertEqual(simplify_predicate(Predicate.BESIDE), Predicate.NEAR)
        self.assertEqual(
            simplify_predicate(Predicate.OPPOSITE), Predicate.IN_FRONT_OF
        )
        self.assertEqual(simplify_predicate(Predicate.LEADS_TO), Predicate.NEAR)
        self.assertEqual(
            normalize_property_value("orientation", "at a crooked angle"),
            "crooked",
        )
        self.assertEqual(normalize_property("color", "crimson"), ("color", "red"))
        self.assertEqual(
            normalize_property("color", "silver", "key"),
            ("material", "silver"),
        )

    @staticmethod
    def _apply(snapshot, patch) -> MainWorldSnapshot:
        updated = snapshot.model_copy(deep=True)
        for operation in patch.operations:
            if isinstance(operation, MainRemoveRelationOperation):
                updated.relations = [
                    relation
                    for relation in updated.relations
                    if relation.id != operation.relationId
                ]
            elif isinstance(operation, MainRemoveEntityOperation):
                updated.entities = [
                    entity
                    for entity in updated.entities
                    if entity.id != operation.entityId
                ]
                updated.relations = [
                    relation
                    for relation in updated.relations
                    if relation.subjectId != operation.entityId
                    and relation.objectId != operation.entityId
                ]
            elif isinstance(operation, MainAddEntityOperation):
                updated.entities.append(operation.entity)
            elif isinstance(operation, MainUpdateEntityOperation):
                entity = next(
                    entity
                    for entity in updated.entities
                    if entity.id == operation.entityId
                )
                if operation.changes.name is not None:
                    entity.name = operation.changes.name
                if operation.changes.kind is not None:
                    entity.kind = operation.changes.kind
                if operation.changes.state is not None:
                    entity.state.update(operation.changes.state)
            elif isinstance(operation, MainAddRelationOperation):
                updated.relations = [
                    relation
                    for relation in updated.relations
                    if relation.id != operation.relation.id
                ]
                updated.relations.append(operation.relation)
        updated.version = patch.toVersion
        return updated

    @staticmethod
    def _spatial_signature(snapshot: MainWorldSnapshot) -> dict[str, object]:
        return {
            "storyId": snapshot.storyId,
            "version": snapshot.version,
            "locations": sorted(
                (item.model_dump(exclude_none=True) for item in snapshot.locations),
                key=lambda item: item["id"],
            ),
            "entities": sorted(
                (item.model_dump(exclude_none=True) for item in snapshot.entities),
                key=lambda item: item["id"],
            ),
            "relations": sorted(
                (item.model_dump(exclude_none=True) for item in snapshot.relations),
                key=lambda item: item["id"],
            ),
        }


if __name__ == "__main__":
    unittest.main()
