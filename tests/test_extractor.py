import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from storyworld.extractor import OpenAIExtractor
from storyworld.models import ExtractionResult, WorldSnapshot
from storyworld.preprocess import segment_passage
from tests.test_pipeline import extraction_p1


class FakeResponses:
    def __init__(self, output):
        self.output = output
        self.kwargs = None

    def parse(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(output_parsed=self.output)


class OpenAIExtractorTests(unittest.TestCase):
    def test_uses_terra_and_constrained_pydantic_output(self) -> None:
        responses = FakeResponses(extraction_p1())
        client = SimpleNamespace(responses=responses)
        with patch.dict(os.environ, {}, clear=False):
            extractor = OpenAIExtractor(client=client)
        sentences = segment_passage(
            "P1",
            "Mara stepped into the study. A desk stood against the wall. "
            "A window faced it. A chair sat by the fire. A door was locked.",
        )
        extractor.extract("P1", sentences, WorldSnapshot.empty("demo"))

        self.assertEqual(responses.kwargs["model"], "gpt-5.6-terra")
        self.assertIs(responses.kwargs["text_format"], ExtractionResult)
        self.assertFalse(responses.kwargs["store"])
        self.assertEqual(responses.kwargs["reasoning"], {"effort": "low"})


if __name__ == "__main__":
    unittest.main()
