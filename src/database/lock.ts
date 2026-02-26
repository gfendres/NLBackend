/**
 * Per-collection in-memory mutex lock.
 * Single-process only — sufficient for the target scale.
 */

const DEFAULT_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 50;

export class CollectionLock {
  private locks = new Map<string, { owner: string; acquired: number }>();

  /** Acquire a lock for a collection. Waits with polling until timeout. */
  async acquire(
    collection: string,
    ownerId: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const existing = this.locks.get(collection);
      if (!existing) {
        this.locks.set(collection, { owner: ownerId, acquired: Date.now() });
        return;
      }

      // Same owner re-acquiring (reentrant)
      if (existing.owner === ownerId) return;

      // Wait and retry
      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(
      `Lock timeout: collection "${collection}" is busy (held by ${this.locks.get(collection)?.owner})`,
    );
  }

  /** Release a lock. Only the owner can release it. */
  release(collection: string, ownerId: string): void {
    const existing = this.locks.get(collection);
    if (!existing) return;

    if (existing.owner !== ownerId) {
      throw new Error(
        `Cannot release lock on "${collection}": owned by ${existing.owner}, not ${ownerId}`,
      );
    }

    this.locks.delete(collection);
  }

  /** Check if a collection is currently locked */
  isLocked(collection: string): boolean {
    return this.locks.has(collection);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
