/**
 * A location may contain several architectural doors, but only the canonical
 * connection entity declared by the compiled presentation owns its route.
 */
export function isPortalSourceEntity(
  entityId: string,
  portalSourceEntityId?: string,
): boolean {
  return Boolean(portalSourceEntityId && entityId === portalSourceEntityId);
}
