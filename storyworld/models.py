from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EntityType(str, Enum):
    LOCATION = "location"
    OBJECT = "object"
    CHARACTER = "character"
    STRUCTURE = "structure"


class EvidenceType(str, Enum):
    EXPLICIT = "explicit"
    STRONG_IMPLICATION = "strong_implication"
    WEAK_INFERENCE = "weak_inference"


class ChangeType(str, Enum):
    ESTABLISH = "establish"
    ADD = "add"
    MOVE = "move"
    UPDATE = "update"
    REMOVE = "remove"
    REVEAL = "reveal"
    REAFFIRM = "reaffirm"
    UNKNOWN = "unknown"


class Predicate(str, Enum):
    INSIDE = "inside"
    ON = "on"
    NEAR = "near"
    LEFT_OF = "left_of"
    RIGHT_OF = "right_of"
    IN_FRONT_OF = "in_front_of"
    CENTERED = "centered"
    BESIDE = "beside"
    ABOVE = "above"
    BENEATH = "beneath"
    BEHIND = "behind"
    OPPOSITE = "opposite"
    AGAINST_WALL = "against_wall"
    AGAINST = "against"
    CONNECTED_TO = "connected_to"
    LEADS_TO = "leads_to"
    HAS_PROPERTY = "has_property"
    NOT_ON = "not_on"
    NOT_INSIDE = "not_inside"
    NOT_PRESENT_IN = "not_present_in"


class PropertyName(str, Enum):
    STATE = "state"
    COLOR = "color"
    MATERIAL = "material"
    CONDITION = "condition"
    ORIENTATION = "orientation"
    SIZE = "size"
    SHAPE = "shape"
    TEMPERATURE = "temperature"
    LIGHTING = "lighting"
    LENGTH = "length"
    DIRECTION = "direction"
    FRAME_STYLE = "frame_style"


class EntityStatus(str, Enum):
    ACTIVE = "active"
    UNKNOWN_LOCATION = "unknown_location"
    REMOVED = "removed"


class ConflictStatus(str, Enum):
    UNRESOLVED = "unresolved"
    RESOLVED = "resolved"


class PatchOperationType(str, Enum):
    ADD_ENTITY = "add_entity"
    DISCOVER_LOCATION = "discover_location"
    MOVE_ENTITY = "move_entity"
    UPDATE_PROPERTY = "update_property"
    REMOVE_ENTITY = "remove_entity"
    ADD_RELATION = "add_relation"
    REMOVE_RELATION = "remove_relation"
    REGISTER_CONFLICT = "register_conflict"


class SentenceUnit(StrictModel):
    id: str
    text: str
    start_char: int
    end_char: int


# These three models are sent to OpenAI as the constrained output schema.
# Nullable values intentionally have no default so every key remains required.
class ExtractedMention(StrictModel):
    mention_id: str
    surface: str
    entity_type: EntityType
    semantic_type: str
    canonical_name: str
    existing_entity_id: str | None
    aliases: list[str]
    evidence_ids: list[str] = Field(min_length=1)


class ExtractedObservation(StrictModel):
    subject_mention_id: str
    predicate: Predicate
    object_mention_id: str | None
    property_name: PropertyName | None
    literal_value: str | None
    change_type: ChangeType
    evidence_ids: list[str] = Field(min_length=1)
    evidence_type: EvidenceType


class ExtractionResult(StrictModel):
    passage_id: str
    location_mention_id: str | None
    mentions: list[ExtractedMention]
    observations: list[ExtractedObservation]
    warnings: list[str]


class EvidenceRef(StrictModel):
    passage_id: str
    sentence_ids: list[str]
    evidence_type: EvidenceType


class Location(StrictModel):
    id: str
    semantic_type: str
    canonical_name: str
    aliases: list[str] = Field(default_factory=list)
    properties: dict[str, str] = Field(default_factory=dict)
    evidence: list[EvidenceRef] = Field(default_factory=list)


class Entity(StrictModel):
    id: str
    entity_type: EntityType
    semantic_type: str
    canonical_name: str
    aliases: list[str] = Field(default_factory=list)
    location_id: str | None = None
    properties: dict[str, str] = Field(default_factory=dict)
    status: EntityStatus = EntityStatus.ACTIVE
    evidence: list[EvidenceRef] = Field(default_factory=list)


class SpatialRelation(StrictModel):
    id: str
    subject_id: str
    predicate: Predicate
    object_id: str | None = None
    literal_value: str | None = None
    evidence: list[EvidenceRef] = Field(default_factory=list)


class ConflictClaim(StrictModel):
    predicate: Predicate
    object_id: str | None = None
    literal_value: str | None = None
    evidence: list[EvidenceRef] = Field(default_factory=list)


class Conflict(StrictModel):
    id: str
    kind: str
    entity_ids: list[str]
    claims: list[ConflictClaim]
    status: ConflictStatus = ConflictStatus.UNRESOLVED
    created_in_passage_id: str
    temporary_render_policy: str = "preserve_previous"


class WorldSnapshot(StrictModel):
    schema_version: str = "0.1"
    story_id: str
    version: int
    passage_id: str | None = None
    locations: list[Location] = Field(default_factory=list)
    entities: list[Entity] = Field(default_factory=list)
    relations: list[SpatialRelation] = Field(default_factory=list)
    conflicts: list[Conflict] = Field(default_factory=list)

    @classmethod
    def empty(cls, story_id: str) -> "WorldSnapshot":
        return cls(story_id=story_id, version=0)


class PatchOperation(StrictModel):
    operation: PatchOperationType
    entity_id: str | None = None
    location_id: str | None = None
    relation: SpatialRelation | None = None
    property_name: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    conflict_id: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)


class ScenePatch(StrictModel):
    from_version: int
    to_version: int
    operations: list[PatchOperation] = Field(default_factory=list)


class ProcessingSummary(StrictModel):
    entities_added: int = 0
    locations_discovered: int = 0
    entities_moved: int = 0
    entities_updated: int = 0
    entities_removed: int = 0
    relations_added: int = 0
    relations_removed: int = 0
    conflicts_added: int = 0


class PassageRequest(StrictModel):
    passage_id: str
    text: str
    replay_cached_extraction: bool = False


class PassageResponse(StrictModel):
    snapshot: WorldSnapshot
    patch: ScenePatch
    conflicts: list[Conflict]
    processing_summary: ProcessingSummary


def json_ready(value: BaseModel | dict[str, Any]) -> dict[str, Any]:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    return value
