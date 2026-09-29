"use client";
import type { Candidate } from "@/lib/board";
import type { PublicConfig } from "@/lib/config";

export interface AppState {
  config: PublicConfig;
  session: { email: string; demo: boolean };
  rubricVersion: string;
  candidates: Candidate[];
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { "content-type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body);
  return body as T;
}
