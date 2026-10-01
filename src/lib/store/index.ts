import "server-only";
import { getConfig } from "../config";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  cached = getConfig().data === "supabase" ? new SupabaseStore() : new LocalStore();
  return cached;
}

/** For tests only. */
export function setStoreForTests(s: Store | null) {
  cached = s;
}
