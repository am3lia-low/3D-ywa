import { describe, expect, it } from "vitest";
import patch2Fixture from "../../fixtures/patch_2.json";
import patch3Fixture from "../../fixtures/patch_3.json";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import conservatorySnapshotFixture from "../../fixtures/snapshot_conservatory_1.json";
import conservatoryPatchFixture from "../../fixtures/patch_conservatory_2.json";
import courtyardSnapshotFixture from "../../fixtures/snapshot_courtyard_1.json";
import courtyardPatchFixture from "../../fixtures/patch_courtyard_2.json";
import scenePatchJsonSchema from "../../contracts/scene-patch.schema.json";
import worldSnapshotJsonSchema from "../../contracts/world-snapshot.schema.json";
import {
  ContractValidationError,
  validateScenePatch,
  validateWorldSnapshot,
} from "./validation";

describe("cross-team contracts", () => {
  it("accepts every renderer fixture", () => {
    expect(validateWorldSnapshot(snapshotFixture).version).toBe(1);
    expect(validateScenePatch(patch2Fixture).toVersion).toBe(2);
    expect(validateScenePatch(patch3Fixture).toVersion).toBe(3);
    expect(validateWorldSnapshot(conservatorySnapshotFixture).storyId).toBe("story-moonlit-conservatory");
    expect(validateScenePatch(conservatoryPatchFixture).toVersion).toBe(2);
    expect(validateWorldSnapshot(courtyardSnapshotFixture).storyId).toBe("story-rain-courtyard");
    expect(validateScenePatch(courtyardPatchFixture).toVersion).toBe(2);
  });

  it("rejects semantic references to entities that do not exist", () => {
    const invalidSnapshot = {
      ...snapshotFixture,
      relations: [
        ...snapshotFixture.relations,
        {
          id: "invalid-relation",
          subjectId: "missing-entity",
          predicate: "near",
          objectId: "desk-1",
        },
      ],
    };

    expect(() => validateWorldSnapshot(invalidSnapshot)).toThrow(ContractValidationError);
    expect(() => validateWorldSnapshot(invalidSnapshot)).toThrow("Unknown subject entity");
  });

  it("rejects duplicate stable IDs", () => {
    const duplicateEntity = {
      ...snapshotFixture,
      entities: [...snapshotFixture.entities, snapshotFixture.entities[0]],
    };

    expect(() => validateWorldSnapshot(duplicateEntity)).toThrow("Duplicate entity ID");
  });

  it("rejects malformed and non-forward patches", () => {
    expect(() =>
      validateScenePatch({ fromVersion: 2, toVersion: 2, operations: [] }),
    ).toThrow("toVersion must be greater than fromVersion");
    expect(() => validateScenePatch({ fromVersion: 1, operations: [] })).toThrow(
      ContractValidationError,
    );
    expect(() =>
      validateScenePatch({
        fromVersion: 1,
        toVersion: 2,
        operations: [
          { op: "update_entity", entityId: "desk-1", changes: { unsupported: true } },
        ],
      }),
    ).toThrow("Unrecognized key");
  });

  it("publishes generated Draft 2020-12 schemas for both frozen interfaces", () => {
    expect(worldSnapshotJsonSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(worldSnapshotJsonSchema.title).toBe("WorldSnapshot");
    expect(worldSnapshotJsonSchema.required).toContain("entities");
    expect(scenePatchJsonSchema.title).toBe("ScenePatch");
    expect(scenePatchJsonSchema.required).toEqual(["fromVersion", "toVersion", "operations"]);
  });
});
