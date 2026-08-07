import type { WorldSnapshot } from "../contracts/world";
import type { AssetRegistry } from "./assetRegistry";
import type { ResolvedDressingInstance } from "./dressingResolver";
import type { ScenePresentation } from "./sceneCompiler";
import {
  auditSceneComposition,
  type CompositionIssueCode,
  type SceneCompositionAudit,
} from "./sceneCompositionAudit";

const REPAIRABLE_DRESSING_ISSUES = new Set<CompositionIssueCode>([
  "blocked_access",
  "dressing_overlap",
  "duplicate_dressing",
  "floating_dressing",
  "broken_dressing_support",
  "broken_wall_anchor",
  "urban_facade_overlap",
  "urban_gutter_overlap",
]);

export interface SceneCompositionRepairAction {
  locationId: string;
  dressingId: string;
  action: "suppressed";
  issueCodes: CompositionIssueCode[];
  reason: "invalid_placement" | "support_removed";
}

export interface RepairedSceneComposition {
  dressingByLocation: Readonly<Record<string, ResolvedDressingInstance[]>>;
  composition: SceneCompositionAudit;
  repairs: SceneCompositionRepairAction[];
}

function cloneDressing(
  dressingByLocation: Readonly<Record<string, readonly ResolvedDressingInstance[]>>,
): Record<string, ResolvedDressingInstance[]> {
  return Object.fromEntries(
    Object.entries(dressingByLocation).map(([locationId, instances]) => [locationId, [...instances]]),
  );
}

/**
 * Removes only presentation-owned dressing that fails the final composition
 * audit. Canonical story entities are never candidates: their errors remain in
 * the returned audit for the narrative/product pipelines to review.
 */
export function repairSceneComposition(
  snapshot: WorldSnapshot,
  presentations: Readonly<Record<string, ScenePresentation>>,
  registry: AssetRegistry,
  dressingByLocation: Readonly<Record<string, readonly ResolvedDressingInstance[]>>,
): RepairedSceneComposition {
  const current = cloneDressing(dressingByLocation);
  const repairs: SceneCompositionRepairAction[] = [];
  const recorded = new Set<string>();
  const maximumPasses = Object.values(current).reduce((total, instances) => total + instances.length, 0) + 1;

  for (let pass = 0; pass < maximumPasses; pass += 1) {
    const composition = auditSceneComposition(snapshot, presentations, registry, current);
    const suppressions = new Map<string, Set<CompositionIssueCode>>();

    for (const [locationId, locationAudit] of Object.entries(composition.locations)) {
      const instances = current[locationId] ?? [];
      const byId = new Map(instances.map((instance) => [instance.dressingId, instance]));
      const originalIndex = new Map(instances.map((instance, index) => [instance.dressingId, index]));
      const dependentCount = new Map<string, number>();
      for (const instance of instances) {
        if (!instance.supportId) continue;
        dependentCount.set(instance.supportId, (dependentCount.get(instance.supportId) ?? 0) + 1);
      }

      for (const issue of locationAudit.issues) {
        if (issue.severity !== "error" || !REPAIRABLE_DRESSING_ISSUES.has(issue.code)) continue;
        const candidates = issue.entityIds
          .filter((entityId) => byId.has(entityId))
          .sort((left, right) =>
            (dependentCount.get(left) ?? 0) - (dependentCount.get(right) ?? 0) ||
            Number(byId.get(right)!.placementStatus === "rerouted") -
              Number(byId.get(left)!.placementStatus === "rerouted") ||
            (originalIndex.get(right) ?? 0) - (originalIndex.get(left) ?? 0) ||
            right.localeCompare(left),
          );
        const victim = candidates[0];
        if (!victim) continue;
        const key = `${locationId}\u0000${victim}`;
        const codes = suppressions.get(key) ?? new Set<CompositionIssueCode>();
        codes.add(issue.code);
        suppressions.set(key, codes);
      }
    }

    if (suppressions.size === 0) {
      return { dressingByLocation: current, composition, repairs };
    }

    const removed = new Set<string>();
    for (const [key, issueCodes] of suppressions) {
      const [locationId, dressingId] = key.split("\u0000") as [string, string];
      removed.add(dressingId);
      if (!recorded.has(key)) {
        repairs.push({
          locationId,
          dressingId,
          action: "suppressed",
          issueCodes: [...issueCodes].sort(),
          reason: "invalid_placement",
        });
        recorded.add(key);
      }
    }

    // A removed table/crate cannot leave decorative children hovering. Cascade
    // through the support graph in the same deterministic pass.
    let cascadeChanged = true;
    while (cascadeChanged) {
      cascadeChanged = false;
      for (const [locationId, instances] of Object.entries(current)) {
        for (const instance of instances) {
          if (!instance.supportId || !removed.has(instance.supportId) || removed.has(instance.dressingId)) continue;
          removed.add(instance.dressingId);
          const key = `${locationId}\u0000${instance.dressingId}`;
          if (!recorded.has(key)) {
            repairs.push({
              locationId,
              dressingId: instance.dressingId,
              action: "suppressed",
              issueCodes: ["broken_dressing_support"],
              reason: "support_removed",
            });
            recorded.add(key);
          }
          cascadeChanged = true;
        }
      }
    }

    for (const locationId of Object.keys(current)) {
      current[locationId] = current[locationId]!.filter((instance) => !removed.has(instance.dressingId));
    }
  }

  return {
    dressingByLocation: current,
    composition: auditSceneComposition(snapshot, presentations, registry, current),
    repairs,
  };
}
