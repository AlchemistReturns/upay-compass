import { clear, createStore, del, get, set, type UseStore } from "idb-keyval";
import type { PinRecord } from "@compass/shared";

/** PIN hash + salt + failed-attempt counter, kept in IndexedDB per user. Never the raw PIN. */
export type StoredPin = PinRecord & { failed: number };

let store: UseStore | undefined;
// Created lazily so importing this module during SSR never touches IndexedDB.
const getStore = () => (store ??= createStore("compass", "kv"));

const key = (userId: string) => `pin:${userId}`;

export const loadPin = (userId: string) => get<StoredPin>(key(userId), getStore());
export const savePin = (userId: string, value: StoredPin) => set(key(userId), value, getStore());
export const deletePin = (userId: string) => del(key(userId), getStore());

/** Logout: wipe everything this app keeps locally. */
export async function wipeLocalData() {
  await clear(getStore());
  try {
    sessionStorage.removeItem(UNLOCKED_FLAG);
  } catch {
    // ignore
  }
}

export const UNLOCKED_FLAG = "compass.unlocked";
