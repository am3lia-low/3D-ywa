from __future__ import annotations

import re

from .models import SentenceUnit


_SENTENCE_RE = re.compile(r"\S(?:.*?\S)?(?:[.!?](?=\s|$)|$)", re.DOTALL)


def segment_passage(passage_id: str, text: str) -> list[SentenceUnit]:
    """Split a short story moment into stable, evidence-addressable sentences."""
    normalized = text.replace("\r\n", "\n").strip()
    if not normalized:
        raise ValueError("Passage text cannot be empty")

    sentences: list[SentenceUnit] = []
    for index, match in enumerate(_SENTENCE_RE.finditer(normalized), start=1):
        sentence = match.group(0).strip()
        if sentence:
            sentences.append(
                SentenceUnit(
                    id=f"{passage_id}-S{index}",
                    text=sentence,
                    start_char=match.start(),
                    end_char=match.end(),
                )
            )

    if not sentences:
        raise ValueError("Passage did not contain any extractable sentences")
    return sentences
