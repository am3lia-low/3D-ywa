from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class MainContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MainEnvironment(MainContractModel):
    floorColor: str
    wallColor: str
    ambientColor: str


class MainLocation(MainContractModel):
    id: str
    name: str
    bounds: tuple[float, float, float]
    environment: MainEnvironment


class MainEntity(MainContractModel):
    id: str
    name: str
    kind: str
    locationId: str
    state: dict[str, Any] = Field(default_factory=dict)


class MainRelationMetadata(MainContractModel):
    wall: Literal["north", "south", "east", "west"] | None = None


class MainSpatialRelation(MainContractModel):
    id: str
    subjectId: str
    predicate: str
    objectId: str | None = None
    distance: float | None = None
    metadata: MainRelationMetadata | None = None


class MainConflict(MainContractModel):
    id: str
    entityId: str | None = None
    description: str
    status: Literal["open", "resolved", "ignored"]
    passageIds: list[str] = Field(default_factory=list)


class MainWorldSnapshot(MainContractModel):
    storyId: str
    version: int
    passageId: str
    locations: list[MainLocation]
    entities: list[MainEntity]
    relations: list[MainSpatialRelation]
    conflicts: list[MainConflict]


class MainEntityChanges(MainContractModel):
    name: str | None = None
    kind: str | None = None
    state: dict[str, Any] | None = None


class MainAddEntityOperation(MainContractModel):
    op: Literal["add_entity"] = "add_entity"
    entity: MainEntity


class MainRemoveEntityOperation(MainContractModel):
    op: Literal["remove_entity"] = "remove_entity"
    entityId: str


class MainUpdateEntityOperation(MainContractModel):
    op: Literal["update_entity"] = "update_entity"
    entityId: str
    changes: MainEntityChanges


class MainAddRelationOperation(MainContractModel):
    op: Literal["add_relation"] = "add_relation"
    relation: MainSpatialRelation


class MainRemoveRelationOperation(MainContractModel):
    op: Literal["remove_relation"] = "remove_relation"
    relationId: str


MainPatchOperation = Annotated[
    MainAddEntityOperation
    | MainRemoveEntityOperation
    | MainUpdateEntityOperation
    | MainAddRelationOperation
    | MainRemoveRelationOperation,
    Field(discriminator="op"),
]


class MainScenePatch(MainContractModel):
    fromVersion: int
    toVersion: int
    operations: list[MainPatchOperation]


class MainVisualEvidence(MainContractModel):
    passageIds: list[str]
    confidence: float
    basis: Literal[
        "explicit_text", "cross_passage_inference", "art_direction_default"
    ]


class MainScenePalette(MainContractModel):
    background: str
    fog: str
    floor: str
    wall: str
    timber: str
    ambient: str
    keyLight: str
    practical: str


class MainLighting(MainContractModel):
    warmth: Literal["cool", "neutral", "warm"]
    contrast: Literal["low", "medium", "high"]
    ambientIntensity: float
    keyIntensity: float
    atmosphericEffects: list[str]


class MainVisualLocation(MainContractModel):
    locationId: str
    archetype: str
    visualDescription: str
    architectureTags: list[str]
    dressingTags: list[str]
    dressingDensity: Literal["sparse", "moderate", "rich"]
    mood: str
    timeOfDay: str
    palette: MainScenePalette
    lighting: MainLighting
    evidence: MainVisualEvidence


class MainVisualEntity(MainContractModel):
    entityId: str
    visualDescription: str
    importance: Literal["background", "supporting", "hero"]
    materials: list[str]
    colors: list[str]
    condition: str | None = None
    assetSearchTags: list[str]
    evidence: MainVisualEvidence


class MainArtDirection(MainContractModel):
    styleLabel: str
    stylePrompt: str
    negativePrompt: list[str]
    materialVocabulary: list[str]


class MainVisualScenePlan(MainContractModel):
    schemaVersion: Literal["1.0"] = "1.0"
    storyId: str
    segmentId: str
    sourcePassageIds: list[str]
    snapshotVersion: int
    planVersion: int
    previousPlanVersion: int | None = None
    artDirection: MainArtDirection
    locations: list[MainVisualLocation]
    entities: list[MainVisualEntity]
    presentationConnections: list[dict[str, Any]] = Field(default_factory=list)
    unresolvedQuestions: list[str] = Field(default_factory=list)


class MainProcessingSummary(MainContractModel):
    entities_added: int = 0
    entities_moved: int = 0
    entities_updated: int = 0


class MainPassageResponse(MainContractModel):
    snapshot: MainWorldSnapshot
    patch: MainScenePatch | None
    conflicts: list[MainConflict]
    processing_summary: MainProcessingSummary
    visual_plan: MainVisualScenePlan
