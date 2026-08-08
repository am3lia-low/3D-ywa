from __future__ import annotations

import re

from .models import Predicate


RENDERER_SPATIAL_PREDICATES = {
    Predicate.LEFT_OF,
    Predicate.RIGHT_OF,
    Predicate.IN_FRONT_OF,
    Predicate.BEHIND,
    Predicate.NEAR,
    Predicate.ON,
    Predicate.INSIDE,
    Predicate.AGAINST_WALL,
    Predicate.CENTERED,
}


PREDICATE_SIMPLIFICATIONS = {
    Predicate.BESIDE: Predicate.NEAR,
    Predicate.ABOVE: Predicate.NEAR,
    Predicate.BENEATH: Predicate.NEAR,
    Predicate.OPPOSITE: Predicate.IN_FRONT_OF,
    Predicate.AGAINST: Predicate.NEAR,
    Predicate.CONNECTED_TO: Predicate.NEAR,
    Predicate.LEADS_TO: Predicate.NEAR,
}


def simplify_predicate(predicate: Predicate) -> Predicate:
    """Reduce narrative relations to the spatial runtime's supported grammar."""

    return PREDICATE_SIMPLIFICATIONS.get(predicate, predicate)


def normalize_property(
    property_name: str,
    value: str,
    semantic_type: str | None = None,
) -> tuple[str, str]:
    """Normalize small phrasing variants before state comparison and conflict checks."""

    compact = re.sub(r"\s+", " ", value.strip().lower())
    if property_name == "orientation":
        orientation_aliases = {
            "crooked angle": "crooked",
            "at a crooked angle": "crooked",
            "tilted angle": "tilted",
            "at a tilted angle": "tilted",
        }
        return property_name, orientation_aliases.get(compact, compact)
    if property_name == "state":
        for state in ("unlocked", "locked", "closed", "open"):
            if re.search(rf"\b{state}\b", compact):
                return property_name, state
    if property_name == "material" and compact == "wooden":
        return property_name, "wood"
    if property_name == "color" and compact == "crimson":
        return property_name, "red"
    if (
        property_name == "color"
        and compact in {"brass", "bronze", "copper", "gold", "silver"}
        and (semantic_type or "").lower()
        in {"key", "lock", "handle", "hinge", "metalwork"}
    ):
        return "material", compact
    return property_name, compact


def normalize_property_value(property_name: str, value: str) -> str:
    return normalize_property(property_name, value)[1]


def normalize_wall(value: str | None) -> str | None:
    if value is None:
        return None
    compact = value.strip().lower()
    aliases = {
        "northern": "north",
        "southern": "south",
        "eastern": "east",
        "western": "west",
    }
    normalized = aliases.get(compact, compact)
    return normalized if normalized in {"north", "south", "east", "west"} else None
