import { del, get, set } from "idb-keyval";
import { defaultShouldDehydrateQuery, type Query } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

/**
 * The last results of the read queries (dashboard, transactions, goals, score, forecast...) are kept
 * in IndexedDB so the app can show them offline. Cleared on sign out. Only the signed-in user's own
 * data is ever in here, and it is no more sensitive than what the open app already holds in memory.
 */
const KEY = "compass.query-cache.v1";
export const OFFLINE_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const queryPersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    try {
      await set(KEY, client);
    } catch {
      // storage full or unavailable: offline reading just will not work
    }
  },
  restoreClient: async () => {
    try {
      return await get<PersistedClient>(KEY);
    } catch {
      return undefined;
    }
  },
  removeClient: async () => {
    try {
      await del(KEY);
    } catch {
      // ignore
    }
  },
};

/** Coach conversations are the most personal thing in the app; they are never kept offline. */
const NEVER_PERSIST = new Set(["coach"]);

export function shouldPersistQuery(query: Query): boolean {
  return defaultShouldDehydrateQuery(query) && !NEVER_PERSIST.has(String(query.queryKey[0]));
}

export function clearOfflineCache() {
  return queryPersister.removeClient();
}
