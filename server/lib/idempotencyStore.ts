type CacheEntry = { seenAt: number };

const SEEN_MS = 10 * 60 * 1000; // 10 minutes window
const memoryStore = new Map<string, CacheEntry>();

export function seenRecently(id: string): boolean {
  cleanup();
  return memoryStore.has(id);
}

export function markSeen(id: string): void {
  cleanup();
  memoryStore.set(id, { seenAt: Date.now() });
}

function cleanup(): void {
  const now = Date.now();
  for (const [k, v] of memoryStore) {
    if (now - v.seenAt > SEEN_MS) memoryStore.delete(k);
  }
}


