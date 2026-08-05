# StoryWorld Narrative Engine

Member 1's pipeline converts literary passages into a persistent semantic world
model for the 3D renderer. GPT-5.6 Terra extracts evidence-linked observations;
deterministic Python code owns entity IDs, state changes, conflicts, and files.

## Pipeline

```text
passage text
  -> sentence IDs
  -> GPT-5.6 Terra constrained extraction
  -> deterministic entity resolution
  -> snapshot reconciliation and conflict detection
  -> versioned snapshot + scene patch + conflicts
```

The LLM never produces coordinates or asset paths. Member 2 receives stable IDs,
semantic properties, and relations such as `beside window_01`.

## Setup

Create a virtual environment and install the project:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e .
```

Set your API key in the current PowerShell session. Do not commit it:

```powershell
$env:OPENAI_API_KEY="your-key"
$env:STORYWORLD_MODEL="gpt-5.6-terra"
```

`STORYWORLD_MODEL` is optional because `gpt-5.6-terra` is already the default.
Copy `.env.example` only as a reference; the CLI reads process environment
variables directly.

## Process the four demo passages

Run these in order so every passage updates the previous snapshot:

```powershell
python -m storyworld.cli process --story-id study-demo --passage-id P1 --file passage_1.txt
python -m storyworld.cli process --story-id study-demo --passage-id P2 --file passage_2.txt
python -m storyworld.cli process --story-id study-demo --passage-id P3 --file passage_3.txt
python -m storyworld.cli process --story-id study-demo --passage-id P4 --file passage_4.txt
```

Print the most recent snapshot:

```powershell
python -m storyworld.cli latest --story-id study-demo
```

Generated artifacts are stored under:

```text
data/study-demo/
  sentences/
  extractions/
  snapshots/
  patches/
  conflicts/
```

To replay a previously cached model extraction during a demo:

```powershell
python -m storyworld.cli process --story-id study-demo --passage-id P2 --file passage_2.txt --replay-cached-extraction
```

## Run the API

```powershell
uvicorn storyworld.api:app --reload
```

Main endpoint:

```http
POST /api/stories/{story_id}/passages
Content-Type: application/json

{
  "passage_id": "P1",
  "text": "The current story passage...",
  "replay_cached_extraction": false
}
```

Supporting endpoints:

```text
GET /health
GET /api/stories/{story_id}/snapshots/latest
```

Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

## Tests

The tests use curated extractions rather than the live API, so they consume no
credits and remain deterministic:

```powershell
python -m unittest discover -s tests -v
```

They verify that:

- Passage 1 establishes the study.
- Passage 2 reuses IDs and moves the armchair.
- Passage 3 discovers the hidden doorway and corridor.
- Passage 4 preserves the established desk position and records a conflict.
- The OpenAI call uses `gpt-5.6-terra` with `ExtractionResult` as its constrained
  Pydantic output schema.

## Main code locations

- `storyworld/models.py`: constrained extraction, snapshot, patch, and conflict schemas.
- `storyworld/extractor.py`: GPT-5.6 Terra prompt and Responses API call.
- `storyworld/resolver.py`: stable identity and alias resolution.
- `storyworld/reconciler.py`: deterministic state updates and conflicts.
- `storyworld/storage.py`: versioned JSON persistence and cached extractions.
- `storyworld/api.py`: FastAPI integration contract.
- `storyworld/cli.py`: local processing and demo commands.
