export interface WallTrimObstacle {
  center: number;
  width: number;
}

export interface WallTrimSegment {
  center: number;
  length: number;
}

/** Subtracts wall-bound objects from a continuous architectural trim run. */
export function createWallTrimSegments(
  span: number,
  obstacles: readonly WallTrimObstacle[],
  endInset = 0.08,
  obstaclePadding = 0.07,
): WallTrimSegment[] {
  const start = -span / 2 + endInset;
  const end = span / 2 - endInset;
  const blocked = obstacles
    .map((obstacle) => ({
      start: Math.max(start, obstacle.center - obstacle.width / 2 - obstaclePadding),
      end: Math.min(end, obstacle.center + obstacle.width / 2 + obstaclePadding),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of blocked) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }

  const segments: WallTrimSegment[] = [];
  let cursor = start;
  for (const interval of merged) {
    if (interval.start - cursor >= 0.08) {
      segments.push({ center: (cursor + interval.start) / 2, length: interval.start - cursor });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (end - cursor >= 0.08) segments.push({ center: (cursor + end) / 2, length: end - cursor });
  return segments;
}
