from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from storyworld.extractor import OpenAIExtractor
from storyworld.handoff import MainContractAdapter
from storyworld.models import Predicate, WorldSnapshot
from storyworld.pipeline import NarrativePipeline
from storyworld.storage import JsonStoryStorage


ROOT = Path(__file__).resolve().parents[1]


def find_id(snapshot: WorldSnapshot, *semantic_types: str) -> str | None:
    wanted = set(semantic_types)
    for item in [*snapshot.locations, *snapshot.entities]:
        if item.semantic_type in wanted:
            return item.id
    return None


def has_relation(
    snapshot: WorldSnapshot,
    subject_id: str | None,
    predicate: Predicate,
    object_id: str | None = None,
    literal_value: str | None = None,
) -> bool:
    return bool(subject_id) and any(
        relation.subject_id == subject_id
        and relation.predicate == predicate
        and (object_id is None or relation.object_id == object_id)
        and (literal_value is None or relation.literal_value == literal_value)
        for relation in snapshot.relations
    )


def property_matches(
    snapshot: WorldSnapshot,
    semantic_type: str,
    property_name: str,
    expected_values: set[str],
) -> bool:
    item_id = find_id(snapshot, semantic_type)
    item = next(
        (
            item
            for item in [*snapshot.locations, *snapshot.entities]
            if item.id == item_id
        ),
        None,
    )
    if item is None:
        return False
    value = item.properties.get(property_name, "").lower()
    return value in expected_values


def score_snapshots(snapshots: dict[str, WorldSnapshot]) -> dict[str, object]:
    p1, p2, p3, p4 = (snapshots[f"P{number}"] for number in range(1, 5))
    p1_ids = {
        semantic: find_id(p1, semantic)
        for semantic in ("desk", "key", "window", "armchair", "fireplace", "portrait", "door")
    }
    doorway_id = find_id(p3, "doorway", "hidden_doorway")
    corridor_id = find_id(p3, "corridor")
    checks = [
        ("P1 required entities", all(p1_ids.values())),
        (
            "P1 no character entities",
            not any(entity.entity_type.value == "character" for entity in p1.entities),
        ),
        ("P1 no directional-wall entity", find_id(p1, "wall") is None),
        ("P1 no frame component entity", find_id(p1, "frame") is None),
        ("P1 desk material", property_matches(p1, "desk", "material", {"wood", "wooden"})),
        ("P1 key material", property_matches(p1, "key", "material", {"silver"})),
        ("P1 armchair color", property_matches(p1, "armchair", "color", {"red", "crimson"})),
        ("P1 fireplace material", property_matches(p1, "fireplace", "material", {"stone"})),
        ("P1 desk against east wall", has_relation(p1, p1_ids["desk"], Predicate.AGAINST_WALL, literal_value="east")),
        ("P1 key on desk", has_relation(p1, p1_ids["key"], Predicate.ON, p1_ids["desk"])),
        ("P1 window in front of desk", has_relation(p1, p1_ids["window"], Predicate.IN_FRONT_OF, p1_ids["desk"])),
        ("P1 chair near fireplace", has_relation(p1, p1_ids["armchair"], Predicate.NEAR, p1_ids["fireplace"])),
        ("P1 portrait near fireplace", has_relation(p1, p1_ids["portrait"], Predicate.NEAR, p1_ids["fireplace"])),
        ("P2 stable core IDs", all(find_id(p2, semantic) == item_id for semantic, item_id in p1_ids.items())),
        ("P2 chair near window", has_relation(p2, p1_ids["armchair"], Predicate.NEAR, p1_ids["window"])),
        ("P2 key removed from desk", not has_relation(p2, p1_ids["key"], Predicate.ON, p1_ids["desk"])),
        ("P2 portrait crooked", property_matches(p2, "portrait", "orientation", {"crooked", "tilted"})),
        ("P3 corridor discovered", corridor_id is not None),
        ("P3 keeps one location", len(p3.locations) == 1),
        ("P3 doorway discovered", doorway_id is not None),
        ("P3 key near doorway", has_relation(p3, p1_ids["key"], Predicate.NEAR, doorway_id)),
        ("P3 doorway near corridor", has_relation(p3, doorway_id, Predicate.NEAR, corridor_id)),
        ("P4 desk conflict detected", any(conflict.kind == "spatial_contradiction" for conflict in p4.conflicts)),
        ("P4 contradictory desk relation not applied", not has_relation(p4, p1_ids["desk"], Predicate.NEAR, p1_ids["window"])),
        ("P4 key in desk top drawer", has_relation(p4, p1_ids["key"], Predicate.INSIDE, p1_ids["desk"], "top drawer")),
        ("P4 portrait near fireplace", has_relation(p4, p1_ids["portrait"], Predicate.NEAR, p1_ids["fireplace"])),
        ("P4 no drawer component entity", find_id(p4, "drawer") is None),
        ("P4 doorway open", property_matches(p4, "doorway", "state", {"open"}) or property_matches(p4, "hidden_doorway", "state", {"open"})),
    ]
    passed = sum(1 for _, result in checks if result)
    return {
        "passed": passed,
        "total": len(checks),
        "score": round(passed / len(checks), 3),
        "checks": [{"name": name, "passed": result} for name, result in checks],
        "failed": [name for name, result in checks if not result],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the four demo passages through the live extraction pipeline."
    )
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--story-id", default="study-live-eval")
    args = parser.parse_args()

    storage = JsonStoryStorage(args.data_dir)
    if storage.load_latest_snapshot(args.story_id).version != 0:
        raise SystemExit(
            "Evaluation target already contains snapshots; choose a fresh data directory."
        )

    extractor = OpenAIExtractor()
    pipeline = NarrativePipeline(extractor=extractor, storage=storage)
    handoff_adapter = MainContractAdapter()
    run_summary: list[dict[str, object]] = []
    snapshots: dict[str, WorldSnapshot] = {}

    for number in range(1, 5):
        started = time.perf_counter()
        previous_snapshot = storage.load_latest_snapshot(args.story_id)
        response = pipeline.process_file(
            story_id=args.story_id,
            passage_id=f"P{number}",
            path=ROOT / f"passage_{number}.txt",
        )
        snapshots[f"P{number}"] = response.snapshot
        handoff = handoff_adapter.passage_response(
            previous_snapshot,
            response,
            storage.load_sentence_lookup(args.story_id),
        )
        handoff_dir = Path(args.data_dir) / args.story_id / "handoffs"
        handoff_dir.mkdir(parents=True, exist_ok=True)
        (handoff_dir / f"P{number}.json").write_text(
            handoff.model_dump_json(indent=2, exclude_none=True) + "\n",
            encoding="utf-8",
        )
        run_summary.append(
            {
                "passage_id": f"P{number}",
                "version": response.snapshot.version,
                "elapsed_seconds": round(time.perf_counter() - started, 2),
                "operations": [
                    operation.operation.value
                    for operation in response.patch.operations
                ],
                "new_conflicts": [conflict.kind for conflict in response.conflicts],
                "entity_ids": [entity.id for entity in response.snapshot.entities],
                "location_ids": [location.id for location in response.snapshot.locations],
                "handoff_path": str((handoff_dir / f"P{number}.json").resolve()),
            }
        )

    report = {
        "model": extractor.model,
        "story_id": args.story_id,
        "data_dir": str(Path(args.data_dir).resolve()),
        "passages": run_summary,
        "evaluation": score_snapshots(snapshots),
    }
    report_path = Path(args.data_dir) / args.story_id / "evaluation_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"Live evaluation stopped: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
