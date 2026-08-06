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
        response = self.client.post(
            "/api/stories/study-demo/passages",
            json={
                "passage_id": "P1",
                "text": (ROOT / "passage_1.txt").read_text(encoding="utf-8"),
                "replay_cached_extraction": False,
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["snapshot"]["version"], 1)
        self.assertEqual(body["patch"]["from_version"], 0)
        self.assertIn("processing_summary", body)


if __name__ == "__main__":
    unittest.main()
