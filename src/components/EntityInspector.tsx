import { useMemo } from "react";
import type { WorldSnapshot } from "../contracts/world";
import { getEntitySpatialContext } from "../runtime/spatialAwareness";
import "./EntityInspector.css";

export interface EntityInspectorProps {
  snapshot: WorldSnapshot;
  selectedEntityId?: string | null;
  onEntitySelect?: (entityId: string) => void;
  className?: string;
}

function displayState(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function EntityInspector({
  snapshot,
  selectedEntityId,
  onEntitySelect,
  className,
}: EntityInspectorProps) {
  const context = useMemo(
    () => getEntitySpatialContext(snapshot, selectedEntityId),
    [selectedEntityId, snapshot],
  );

  if (!context) {
    return (
      <aside className={["entity-inspector", className].filter(Boolean).join(" ")} aria-live="polite">
        <span className="entity-inspector__eyebrow">Selected entity</span>
        <strong>None</strong>
        <small>Click an object in the room</small>
      </aside>
    );
  }

  const { entity, relations, conflicts } = context;
  const location = snapshot.locations.find((candidate) => candidate.id === entity.locationId);
  const stateEntries = Object.entries(entity.state ?? {});

  return (
    <aside className={["entity-inspector", className].filter(Boolean).join(" ")} aria-live="polite">
      <span className="entity-inspector__eyebrow">Selected entity</span>
      <strong>{entity.name}</strong>
      <small>
        {entity.id} · {entity.kind} · {entity.assetKey ?? "fallback primitive"}
      </small>

      <dl className="entity-inspector__facts">
        <div>
          <dt>Location</dt>
          <dd>{location?.name ?? entity.locationId}</dd>
        </div>
        {entity.provenance && (
          <div>
            <dt>Source</dt>
            <dd>
              {entity.provenance.passageId}
              {entity.provenance.confidence !== undefined
                ? ` · ${Math.round(entity.provenance.confidence * 100)}% confidence`
                : ""}
            </dd>
          </div>
        )}
      </dl>

      {stateEntries.length > 0 && (
        <section className="entity-inspector__section">
          <h2>State</h2>
          <dl className="entity-inspector__state">
            {stateEntries.map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll("_", " ")}</dt>
                <dd>{displayState(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {relations.length > 0 && (
        <section className="entity-inspector__section">
          <h2>Spatial relations</h2>
          <div className="entity-inspector__relations">
            {relations.map(({ relation, sentence, relatedEntity }) =>
              relatedEntity ? (
                <button
                  key={relation.id}
                  type="button"
                  onClick={() => onEntitySelect?.(relatedEntity.id)}
                  title={`Focus ${relatedEntity.name}`}
                >
                  <span>{sentence}</span>
                  <b aria-hidden="true">→</b>
                </button>
              ) : (
                <p key={relation.id}>{sentence}</p>
              ),
            )}
          </div>
        </section>
      )}

      {conflicts.length > 0 && (
        <section className="entity-inspector__section entity-inspector__conflicts">
          <h2>Needs review</h2>
          {conflicts.map((conflict) => (
            <p key={conflict.id}>{conflict.description}</p>
          ))}
        </section>
      )}
    </aside>
  );
}
