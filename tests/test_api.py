import tempfile
import unittest
import warnings
from pathlib import Path

from starlette.exceptions import StarletteDeprecationWarning

warnings.filterwarnings(
    "ignore",
    message="Using `httpx` with `starlette.testclient` is deprecated.*",
    category=StarletteDeprecationWarning,
)

from fastapi.testclient import TestClient

from storyworld.api import app, get_pipeline
from storyworld.pipeline import NarrativePipeline
from storyworld.storage import JsonStoryStorage
from tests.test_pipeline import FixtureExtractor


ROOT = Path(__file__).resolve().parents[1]


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        pipeline = NarrativePipeline(
            extractor=FixtureExtractor(),
            storage=JsonStoryStorage(self.temp.name),
        )
        app.dependency_overrides[get_pipeline] = lambda: pipeline
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.temp.cleanup()

    def test_process_passage_contract(self) -> None:
        bodies = []
        for number in range(1, 5):
            response = self.client.post(
                "/api/stories/study-demo/passages",
                json={
                    "passage_id": f"P{number}",
                    "text": (ROOT / f"passage_{number}.txt").read_text(encoding="utf-8"),
                    "replay_cached_extraction": False,
                },
            )
            self.assertEqual(response.status_code, 200)
            bodies.append(response.json())

        opening = bodies[0]
        self.assertEqual(opening["snapshot"]["storyId"], "study-demo")
        self.assertEqual(opening["snapshot"]["passageId"], "P1")
        self.assertEqual(opening["snapshot"]["version"], 1)
        self.assertIsNone(opening.get("patch"))
        self.assertIn("visual_plan", opening)
        self.assertEqual(opening["visual_plan"]["snapshotVersion"], 1)
        self.assertEqual(len(opening["snapshot"]["locations"]), 1)
        self.assertIn("locationId", opening["snapshot"]["entities"][0])
        self.assertNotIn("location_id", opening["snapshot"]["entities"][0])
        self.assertFalse(
            any(entity["kind"] == "character" for entity in opening["snapshot"]["entities"])
        )
        self.assertFalse(
            any(
                entity["entityId"] == "mara_01"
                for entity in opening["visual_plan"]["entities"]
            )
        )
        desk = next(
            entity
            for entity in opening["snapshot"]["entities"]
            if entity["id"] == "desk_01"
        )
        self.assertEqual(desk["provenance"]["passageId"], "P1")
        self.assertIn("heavy wooden desk", desk["provenance"]["sentence"])

        for index, body in enumerate(bodies[1:], start=2):
            self.assertEqual(body["patch"]["fromVersion"], index - 1)
            self.assertEqual(body["patch"]["toVersion"], index)
            self.assertEqual(body["visual_plan"]["planVersion"], index)
            self.assertEqual(len(body["snapshot"]["locations"]), 1)

        final = bodies[-1]["snapshot"]
        self.assertTrue(
            any(entity["id"] == "corridor_01" for entity in final["entities"])
        )
        allowed = {
            "left_of",
            "right_of",
            "in_front_of",
            "behind",
            "near",
            "on",
            "inside",
            "against_wall",
            "centered",
        }
        self.assertTrue(
            all(relation["predicate"] in allowed for relation in final["relations"])
        )
        latest = self.client.get("/api/stories/study-demo/snapshots/latest")
        self.assertEqual(latest.status_code, 200)
        self.assertEqual(latest.json()["storyId"], "study-demo")
        self.assertEqual(latest.json()["version"], 4)
        latest_desk = next(
            entity
            for entity in latest.json()["entities"]
            if entity["id"] == "desk_01"
        )
        self.assertEqual(
            latest_desk["provenance"]["sentence"],
            desk["provenance"]["sentence"],
        )


if __name__ == "__main__":
    unittest.main()
