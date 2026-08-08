from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from storyworld.models import (
    ChangeType,
    EntityType,
    EvidenceType,
    ExtractedMention,
    ExtractedObservation,
    ExtractionResult,
    Predicate,
)
from storyworld.pipeline import NarrativePipeline
from storyworld.storage import JsonStoryStorage


PASSAGES = Path(__file__).resolve().parent / "fixtures"


def mention(
    mention_id: str,
    surface: str,
    entity_type: EntityType,
    semantic_type: str,
    canonical_name: str,
    evidence_id: str,
    existing_entity_id: str | None = None,
    aliases: list[str] | None = None,
) -> ExtractedMention:
    return ExtractedMention(
        mention_id=mention_id,
        surface=surface,
        entity_type=entity_type,
        semantic_type=semantic_type,
        canonical_name=canonical_name,
        existing_entity_id=existing_entity_id,
        aliases=aliases or [],
        evidence_ids=[evidence_id],
    )


def observation(
    subject: str,
    predicate: Predicate,
    evidence_id: str,
    *,
    object_mention: str | None = None,
    property_name: str | None = None,
    value: str | None = None,
    change: ChangeType = ChangeType.ESTABLISH,
) -> ExtractedObservation:
    return ExtractedObservation(
        subject_mention_id=subject,
        predicate=predicate,
        object_mention_id=object_mention,
        property_name=property_name,
        literal_value=value,
        change_type=change,
        evidence_ids=[evidence_id],
        evidence_type=EvidenceType.EXPLICIT,
    )


def extraction_p1() -> ExtractionResult:
    mentions = [
        mention("study", "rectangular study", EntityType.LOCATION, "study", "study", "P1-S1"),
        mention("mara", "Mara", EntityType.CHARACTER, "person", "Mara", "P1-S1"),
        mention("desk", "heavy wooden desk", EntityType.OBJECT, "desk", "wooden desk", "P1-S2"),
        mention("key", "small silver key", EntityType.OBJECT, "key", "silver key", "P1-S2"),
        mention("window", "tall window", EntityType.STRUCTURE, "window", "tall window", "P1-S3"),
        mention("chair", "red armchair", EntityType.OBJECT, "armchair", "red armchair", "P1-S4"),
        mention("fireplace", "stone fireplace", EntityType.STRUCTURE, "fireplace", "stone fireplace", "P1-S4"),
        mention("portrait", "old portrait", EntityType.OBJECT, "portrait", "old portrait", "P1-S4"),
        mention("door", "oak door", EntityType.STRUCTURE, "door", "oak door", "P1-S5"),
    ]
    observations = [
        observation("study", Predicate.HAS_PROPERTY, "P1-S1", property_name="shape", value="rectangular"),
        observation("mara", Predicate.INSIDE, "P1-S1", object_mention="study"),
        observation("desk", Predicate.HAS_PROPERTY, "P1-S2", property_name="material", value="wood"),
        observation("desk", Predicate.AGAINST_WALL, "P1-S2", value="east"),
        observation("key", Predicate.HAS_PROPERTY, "P1-S2", property_name="material", value="silver"),
        observation("key", Predicate.ON, "P1-S2", object_mention="desk"),
        observation("window", Predicate.HAS_PROPERTY, "P1-S3", property_name="size", value="tall"),
        observation("window", Predicate.OPPOSITE, "P1-S3", object_mention="desk"),
        observation("chair", Predicate.HAS_PROPERTY, "P1-S4", property_name="color", value="red"),
        observation("chair", Predicate.BESIDE, "P1-S4", object_mention="fireplace"),
        observation("fireplace", Predicate.HAS_PROPERTY, "P1-S4", property_name="material", value="stone"),
        observation("portrait", Predicate.HAS_PROPERTY, "P1-S4", property_name="condition", value="old"),
        observation("portrait", Predicate.HAS_PROPERTY, "P1-S4", property_name="frame_style", value="gilded"),
        observation("portrait", Predicate.ABOVE, "P1-S4", object_mention="fireplace"),
        observation("door", Predicate.HAS_PROPERTY, "P1-S5", property_name="material", value="oak"),
        observation("door", Predicate.AGAINST_WALL, "P1-S5", value="north"),
        observation("door", Predicate.HAS_PROPERTY, "P1-S5", property_name="state", value="locked"),
    ]
    return ExtractionResult(
        passage_id="P1",
        location_mention_id="study",
        mentions=mentions,
        observations=observations,
        warnings=[],
    )


def existing(
    mention_id: str,
    surface: str,
    entity_type: EntityType,
    semantic_type: str,
    canonical_name: str,
    evidence_id: str,
    entity_id: str,
) -> ExtractedMention:
    return mention(
        mention_id,
        surface,
        entity_type,
        semantic_type,
        canonical_name,
        evidence_id,
        existing_entity_id=entity_id,
    )


def extraction_p2() -> ExtractionResult:
    mentions = [
        existing("study", "room", EntityType.LOCATION, "study", "study", "P2-S1", "study_01"),
        existing("chair", "crimson armchair", EntityType.OBJECT, "armchair", "red armchair", "P2-S2", "armchair_01"),
        existing("fireplace", "fireplace", EntityType.STRUCTURE, "fireplace", "stone fireplace", "P2-S2", "fireplace_01"),
        existing("window", "tall window", EntityType.STRUCTURE, "window", "tall window", "P2-S2", "window_01"),
        existing("key", "silver key", EntityType.OBJECT, "key", "silver key", "P2-S3", "key_01"),
        existing("desk", "writing desk", EntityType.OBJECT, "desk", "wooden desk", "P2-S3", "desk_01"),
        existing("portrait", "old portrait", EntityType.OBJECT, "portrait", "old portrait", "P2-S4", "portrait_01"),
        existing("door", "oak door", EntityType.STRUCTURE, "door", "oak door", "P2-S5", "door_01"),
    ]
    return ExtractionResult(
        passage_id="P2",
        location_mention_id="study",
        mentions=mentions,
        observations=[
            observation("chair", Predicate.BESIDE, "P2-S2", object_mention="window", change=ChangeType.MOVE),
            observation("key", Predicate.NOT_ON, "P2-S3", object_mention="desk", change=ChangeType.REMOVE),
            observation("portrait", Predicate.HAS_PROPERTY, "P2-S4", property_name="orientation", value="crooked", change=ChangeType.UPDATE),
            observation("fireplace", Predicate.HAS_PROPERTY, "P2-S4", property_name="temperature", value="cold", change=ChangeType.UPDATE),
            observation("door", Predicate.HAS_PROPERTY, "P2-S5", property_name="state", value="locked", change=ChangeType.REAFFIRM),
        ],
        warnings=[],
    )


def extraction_p3() -> ExtractionResult:
    mentions = [
        existing("study", "study", EntityType.LOCATION, "study", "study", "P3-S3", "study_01"),
        existing("portrait", "crooked portrait", EntityType.OBJECT, "portrait", "old portrait", "P3-S1", "portrait_01"),
        mention("wallpaper", "torn wallpaper", EntityType.OBJECT, "wallpaper", "wallpaper", "P3-S2"),
        mention("doorway", "narrow doorway", EntityType.STRUCTURE, "hidden_doorway", "hidden doorway", "P3-S2"),
        mention("corridor", "short, dark corridor", EntityType.LOCATION, "corridor", "corridor", "P3-S3"),
        existing("key", "missing silver key", EntityType.OBJECT, "key", "silver key", "P3-S4", "key_01"),
        existing("door", "original oak door", EntityType.STRUCTURE, "door", "oak door", "P3-S5", "door_01"),
    ]
    return ExtractionResult(
        passage_id="P3",
        location_mention_id="study",
        mentions=mentions,
        observations=[
            observation("portrait", Predicate.HAS_PROPERTY, "P3-S1", property_name="state", value="lifted", change=ChangeType.UPDATE),
            observation("wallpaper", Predicate.HAS_PROPERTY, "P3-S2", property_name="condition", value="torn"),
            observation("doorway", Predicate.BEHIND, "P3-S2", object_mention="portrait", change=ChangeType.REVEAL),
            observation("doorway", Predicate.LEADS_TO, "P3-S3", object_mention="corridor", change=ChangeType.REVEAL),
            observation("corridor", Predicate.CONNECTED_TO, "P3-S3", object_mention="study", change=ChangeType.REVEAL),
            observation("key", Predicate.BESIDE, "P3-S4", object_mention="doorway", change=ChangeType.MOVE),
            observation("door", Predicate.HAS_PROPERTY, "P3-S5", property_name="state", value="locked", change=ChangeType.REAFFIRM),
        ],
        warnings=[],
    )


def extraction_p4() -> ExtractionResult:
    mentions = [
        existing("desk", "wooden desk", EntityType.OBJECT, "desk", "wooden desk", "P4-S1", "desk_01"),
        existing("window", "western window", EntityType.STRUCTURE, "window", "tall window", "P4-S1", "window_01"),
        existing("key", "silver key", EntityType.OBJECT, "key", "silver key", "P4-S1", "key_01"),
        existing("chair", "crimson armchair", EntityType.OBJECT, "armchair", "red armchair", "P4-S2", "armchair_01"),
        existing("portrait", "crooked portrait", EntityType.OBJECT, "portrait", "old portrait", "P4-S2", "portrait_01"),
        existing("fireplace", "fireplace", EntityType.STRUCTURE, "fireplace", "stone fireplace", "P4-S2", "fireplace_01"),
        existing("doorway", "narrow doorway", EntityType.STRUCTURE, "hidden_doorway", "hidden doorway", "P4-S3", "hidden_doorway_01"),
        existing("corridor", "corridor", EntityType.LOCATION, "corridor", "corridor", "P4-S3", "corridor_01"),
    ]
    return ExtractionResult(
        passage_id="P4",
        location_mention_id=None,
        mentions=mentions,
        observations=[
            observation("desk", Predicate.BENEATH, "P4-S1", object_mention="window", change=ChangeType.UNKNOWN),
            observation("key", Predicate.INSIDE, "P4-S1", object_mention="desk", value="top drawer", change=ChangeType.MOVE),
            observation("chair", Predicate.BESIDE, "P4-S2", object_mention="window", change=ChangeType.REAFFIRM),
            observation("portrait", Predicate.AGAINST, "P4-S2", object_mention="fireplace", change=ChangeType.MOVE),
            observation("doorway", Predicate.HAS_PROPERTY, "P4-S3", property_name="state", value="open", change=ChangeType.UPDATE),
            observation("doorway", Predicate.LEADS_TO, "P4-S3", object_mention="corridor", change=ChangeType.REAFFIRM),
        ],
        warnings=["The desk position lacks a movement cue."],
    )


class FixtureExtractor:
    def __init__(self) -> None:
        self.extractions = {
            "P1": extraction_p1(),
            "P2": extraction_p2(),
            "P3": extraction_p3(),
            "P4": extraction_p4(),
        }

    def extract(self, passage_id, sentences, snapshot):
        return self.extractions[passage_id]


class PipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.storage = JsonStoryStorage(self.temp.name)
        self.pipeline = NarrativePipeline(
            extractor=FixtureExtractor(), storage=self.storage
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def process(self, number: int):
        return self.pipeline.process_file(
            story_id="study-demo",
            passage_id=f"P{number}",
            path=PASSAGES / f"passage_{number}.txt",
        )

    @staticmethod
    def has_relation(snapshot, subject, predicate, object_id=None):
        return any(
            relation.subject_id == subject
            and relation.predicate == predicate
            and (object_id is None or relation.object_id == object_id)
            for relation in snapshot.relations
        )

    def test_four_passages_create_persistent_world(self) -> None:
        p1 = self.process(1)
        self.assertEqual(p1.snapshot.version, 1)
        self.assertEqual(len(p1.snapshot.locations), 1)
        self.assertEqual(len(p1.snapshot.entities), 7)
        self.assertFalse(
            any(entity.entity_type == EntityType.CHARACTER for entity in p1.snapshot.entities)
        )
        self.assertTrue(self.has_relation(p1.snapshot, "key_01", Predicate.ON, "desk_01"))

        p2 = self.process(2)
        self.assertEqual(p2.snapshot.version, 2)
        self.assertTrue(self.has_relation(p2.snapshot, "armchair_01", Predicate.NEAR, "window_01"))
        self.assertFalse(self.has_relation(p2.snapshot, "armchair_01", Predicate.NEAR, "fireplace_01"))
        self.assertFalse(self.has_relation(p2.snapshot, "key_01", Predicate.ON, "desk_01"))
        portrait = next(entity for entity in p2.snapshot.entities if entity.id == "portrait_01")
        self.assertEqual(portrait.properties["orientation"], "crooked")

        p3 = self.process(3)
        self.assertEqual(p3.snapshot.version, 3)
        self.assertEqual([location.id for location in p3.snapshot.locations], ["study_01"])
        corridor = next(entity for entity in p3.snapshot.entities if entity.id == "corridor_01")
        self.assertEqual(corridor.entity_type, EntityType.STRUCTURE)
        self.assertEqual(corridor.location_id, "study_01")
        self.assertTrue(any(entity.id == "hidden_doorway_01" for entity in p3.snapshot.entities))
        self.assertTrue(self.has_relation(p3.snapshot, "key_01", Predicate.NEAR, "hidden_doorway_01"))

        p4 = self.process(4)
        self.assertEqual(p4.snapshot.version, 4)
        self.assertEqual(len(p4.conflicts), 1)
        self.assertEqual(p4.conflicts[0].kind, "spatial_contradiction")
        self.assertFalse(self.has_relation(p4.snapshot, "desk_01", Predicate.NEAR, "window_01"))
        self.assertTrue(self.has_relation(p4.snapshot, "key_01", Predicate.INSIDE, "desk_01"))
        allowed = {
            Predicate.LEFT_OF,
            Predicate.RIGHT_OF,
            Predicate.IN_FRONT_OF,
            Predicate.BEHIND,
            Predicate.NEAR,
            Predicate.ON,
            Predicate.INSIDE,
            Predicate.AGAINST_WALL,
            Predicate.CENTERED,
        }
        self.assertTrue(all(relation.predicate in allowed for relation in p4.snapshot.relations))
        self.assertEqual(self.storage.load_latest_snapshot("study-demo").version, 4)

    def test_extraction_schema_is_strict(self) -> None:
        schema = ExtractionResult.model_json_schema()
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(set(schema["required"]), {
            "passage_id", "location_mention_id", "mentions", "observations", "warnings"
        })


if __name__ == "__main__":
    unittest.main()
