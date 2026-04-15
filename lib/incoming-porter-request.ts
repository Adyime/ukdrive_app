/**
 * Tracks incoming porter requests already handled by the driver
 * to avoid reopening the same request notification repeatedly.
 */

const handledPorterRequests = new Map<string, number>();
const TTL_MS = 10 * 60 * 1000;

function prune(): void {
  const now = Date.now();
  for (const [id, ts] of handledPorterRequests.entries()) {
    if (now - ts > TTL_MS) handledPorterRequests.delete(id);
  }
}

export function markIncomingPorterHandled(porterServiceId: string): void {
  prune();
  handledPorterRequests.set(porterServiceId, Date.now());
}

export function isIncomingPorterHandled(porterServiceId: string): boolean {
  prune();
  return handledPorterRequests.has(porterServiceId);
}
