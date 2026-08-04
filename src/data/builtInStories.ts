import snapshotFixture from "../../fixtures/snapshot_1.json";
import patch2Fixture from "../../fixtures/patch_2.json";
import patch3Fixture from "../../fixtures/patch_3.json";
import visualPlan1Fixture from "../../fixtures/visual_scene_plan_1.json";
import visualPlan3Fixture from "../../fixtures/visual_scene_plan_3.json";
import conservatorySnapshotFixture from "../../fixtures/snapshot_conservatory_1.json";
import conservatoryPatch2Fixture from "../../fixtures/patch_conservatory_2.json";
import conservatoryPlan1Fixture from "../../fixtures/visual_scene_plan_conservatory_1.json";
import conservatoryPlan2Fixture from "../../fixtures/visual_scene_plan_conservatory_2.json";
import courtyardSnapshotFixture from "../../fixtures/snapshot_courtyard_1.json";
import courtyardPatch2Fixture from "../../fixtures/patch_courtyard_2.json";
import courtyardPlan1Fixture from "../../fixtures/visual_scene_plan_courtyard_1.json";
import courtyardPlan2Fixture from "../../fixtures/visual_scene_plan_courtyard_2.json";
import woodlandSnapshotFixture from "../../fixtures/snapshot_woodland_1.json";
import woodlandPlan1Fixture from "../../fixtures/visual_scene_plan_woodland_1.json";
import unfamiliarStoryPackageFixture from "../../fixtures/story_package_unfamiliar_demo.json";
import worldFamiliesStoryPackageFixture from "../../fixtures/story_package_world_families_demo.json";
import {
  runtimeStoryFromPackage,
  type RuntimeStory,
} from "../integration/storyPackage";

export const builtInStoryPackages = [
  {
    schemaVersion: "1.0",
    packageId: "attic-study",
    label: "The attic study",
    initialSnapshot: snapshotFixture,
    moments: [
      {
        passageId: "P1",
        text: "Elian enters the old attic study. A faded rug faces the writing desk, while a folded map rests beside the cold north-wall hearth.",
        visualPlan: visualPlan1Fixture,
      },
      {
        passageId: "P2",
        text: "He drags the chair away and finds fresh scratches in the wood. An unlit brass lantern waits beside the desk.",
        patchFromPrevious: patch2Fixture,
        actionLabel: "Apply passage 2",
      },
      {
        passageId: "P3",
        text: "Elian lights the hearth and carries the lantern north. In the warm flicker, the outline of a hidden door appears.",
        patchFromPrevious: patch3Fixture,
        visualPlan: visualPlan3Fixture,
        actionLabel: "Reveal passage 3",
      },
    ],
  },
  {
    schemaVersion: "1.0",
    packageId: "moonlit-conservatory",
    label: "The moonlit conservatory",
    initialSnapshot: conservatorySnapshotFixture,
    moments: [
      {
        passageId: "C1",
        text: "Mara enters the moonlit conservatory. A dormant celestial orrery rests on the potting table beneath iron ribs and fogged panes.",
        visualPlan: conservatoryPlan1Fixture,
      },
      {
        passageId: "C2",
        text: "She pulls the chair towards the locked garden door. The orrery unfolds like a flower as a copper storm lantern begins to glow.",
        patchFromPrevious: conservatoryPatch2Fixture,
        visualPlan: conservatoryPlan2Fixture,
        actionLabel: "Awaken the conservatory",
      },
    ],
  },
  {
    schemaVersion: "1.0",
    packageId: "rain-courtyard",
    label: "The rain-washed courtyard",
    initialSnapshot: courtyardSnapshotFixture,
    moments: [
      {
        passageId: "R1",
        text: "Sera waits in the rain-washed coaching courtyard. A sealed parcel and a dull brass lantern rest on the courier's table before the locked north gate.",
        visualPlan: courtyardPlan1Fixture,
      },
      {
        passageId: "R2",
        text: "She lights the lantern, unfolds the rain-marked route map and draws the chair towards the gate as its old lock releases.",
        patchFromPrevious: courtyardPatch2Fixture,
        visualPlan: courtyardPlan2Fixture,
        actionLabel: "Prepare the departure",
      },
    ],
  },
  {
    schemaVersion: "1.0",
    packageId: "mosswood-path",
    label: "The misted Mosswood path",
    initialSnapshot: woodlandSnapshotFixture,
    moments: [
      {
        passageId: "W1",
        text: "At blue dawn, Ilyra reaches the Mosswood path. A brass lantern burns on a fallen cedar beside red mushrooms, while a marked stone points north into the mist.",
        visualPlan: woodlandPlan1Fixture,
      },
    ],
  },
  unfamiliarStoryPackageFixture,
  worldFamiliesStoryPackageFixture,
] as const;

export const builtInStories: readonly RuntimeStory[] = builtInStoryPackages.map(
  runtimeStoryFromPackage,
);
