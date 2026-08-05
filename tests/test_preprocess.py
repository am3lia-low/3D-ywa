import unittest

from storyworld.preprocess import segment_passage


class SegmentPassageTests(unittest.TestCase):
    def test_assigns_stable_sentence_ids(self) -> None:
        units = segment_passage("P2", "One sentence. Another sentence!")
        self.assertEqual([unit.id for unit in units], ["P2-S1", "P2-S2"])
        self.assertEqual(units[0].text, "One sentence.")

    def test_rejects_blank_passages(self) -> None:
        with self.assertRaises(ValueError):
            segment_passage("P1", "   ")


if __name__ == "__main__":
    unittest.main()

