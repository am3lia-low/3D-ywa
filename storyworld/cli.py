from __future__ import annotations

import argparse
import sys

from .pipeline import NarrativePipeline
from .storage import JsonStoryStorage


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="StoryWorld narrative engine")
    parser.add_argument("--data-dir", default="data")
    subparsers = parser.add_subparsers(dest="command", required=True)

    process = subparsers.add_parser("process", help="Process one story passage")
    process.add_argument("--story-id", required=True)
    process.add_argument("--passage-id", required=True)
    process.add_argument("--file", required=True)
    process.add_argument("--replay-cached-extraction", action="store_true")

    latest = subparsers.add_parser("latest", help="Print the latest snapshot")
    latest.add_argument("--story-id", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    storage = JsonStoryStorage(args.data_dir)

    if args.command == "latest":
        snapshot = storage.load_latest_snapshot(args.story_id)
        print(snapshot.model_dump_json(indent=2))
        return 0

    pipeline = NarrativePipeline(storage=storage)
    response = pipeline.process_file(
        story_id=args.story_id,
        passage_id=args.passage_id,
        path=args.file,
        replay_cached_extraction=args.replay_cached_extraction,
    )
    print(response.model_dump_json(indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
