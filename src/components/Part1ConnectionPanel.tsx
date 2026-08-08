import { useRef, useState, type FormEvent } from "react";
import {
  LivePart1StorySession,
  postPart1Passage,
} from "../integration/part1Adapter";
import type { RuntimeStory } from "../integration/storyPackage";
import "./Part1ConnectionPanel.css";

export interface Part1ConnectionPanelProps {
  onStoryUpdate: (story: RuntimeStory) => void;
}

const MOCK_PASSAGES: Record<string, { nextId?: string; nextText?: string }> = {
  P1: {
    nextId: "P2",
    nextText: "He drags the chair away and finds fresh scratches in the wood. An unlit brass lantern waits beside the desk.",
  },
  P2: {
    nextId: "P3",
    nextText: "Elian lights the hearth and carries the lantern north. In the warm flicker, the outline of a hidden door appears.",
  },
  P3: {},
};

export function Part1ConnectionPanel({ onStoryUpdate }: Part1ConnectionPanelProps) {
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8000");
  const [storyId, setStoryId] = useState("story-live-attic");
  const [passageId, setPassageId] = useState("P1");
  const [text, setText] = useState(
    "Dust turns in the late light of the attic study. An oak writing desk stands beside the cold hearth.",
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const sessionRef = useRef<{ storyId: string; session: LivePart1StorySession } | null>(null);

  const resetSession = () => {
    sessionRef.current = null;
    setNotice(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const request = { storyId: storyId.trim(), passageId: passageId.trim(), text: text.trim() };
    try {
      if (!request.storyId || !request.passageId || !request.text) {
        throw new Error("Story ID, passage ID and passage text are required.");
      }
      if (!sessionRef.current || sessionRef.current.storyId !== request.storyId) {
        sessionRef.current = {
          storyId: request.storyId,
          session: new LivePart1StorySession(`Live: ${request.storyId}`),
        };
      }
      const response = await postPart1Passage(baseUrl.trim(), request);
      const result = sessionRef.current.session.ingest(request, response);
      onStoryUpdate(result.story);
      setNotice({
        kind: "success",
        message: `Accepted ${request.passageId} as world v${result.authoritativeSnapshot.version} · +${result.processingSummary.entitiesAdded} added · ${result.processingSummary.entitiesMoved} moved · ${result.processingSummary.entitiesUpdated} updated.`,
      });

      if (/127\.0\.0\.1:8787|localhost:8787/.test(baseUrl)) {
        const next = MOCK_PASSAGES[request.passageId];
        if (next?.nextId && next.nextText) {
          setPassageId(next.nextId);
          setText(next.nextText);
        }
      }
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="part1-connection">
      <summary>Live Part 1 connection</summary>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          <span>API base URL</span>
          <input
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>
        <label>
          <span>Story ID</span>
          <input value={storyId} onChange={(event) => setStoryId(event.target.value)} />
        </label>
        <label>
          <span>Passage ID</span>
          <input value={passageId} onChange={(event) => setPassageId(event.target.value)} />
        </label>
        <label className="part1-passage-input">
          <span>Passage text</span>
          <textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <div className="part1-actions">
          <button type="submit" disabled={busy}>
            {busy ? "Processing…" : "Process through Part 1"}
          </button>
          <button type="button" className="secondary" onClick={resetSession} disabled={busy}>
            New live session
          </button>
        </div>
      </form>
      <p className="part1-help">
        The opening response must include <code>visual_plan</code>. Later passages may reuse it
        until the visual context changes.
      </p>
      {notice && (
        <p className={`part1-notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.message}
        </p>
      )}
    </details>
  );
}
