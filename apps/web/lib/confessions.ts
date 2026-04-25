import {
  type Confession,
  type ConfessionDraft,
  DEMO_CONFESSIONS,
  STORAGE_KEYS,
  createAnonymousUserId,
  fromRow,
  sortConfessionsDescending,
  toRow
} from "@noface/shared";
import { createClient } from "../utils/supabase/client";

const supabase = createClient();

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined";
}

function readLocalConfessions(): Confession[] {
  if (!hasBrowserStorage()) {
    return sortConfessionsDescending(DEMO_CONFESSIONS);
  }

  const raw = window.localStorage.getItem(STORAGE_KEYS.confessions);
  const isSeeded = window.localStorage.getItem(STORAGE_KEYS.demoSeeded) === "true";

  if (!raw && !isSeeded) {
    window.localStorage.setItem(STORAGE_KEYS.confessions, JSON.stringify(DEMO_CONFESSIONS));
    window.localStorage.setItem(STORAGE_KEYS.demoSeeded, "true");
    return sortConfessionsDescending(DEMO_CONFESSIONS);
  }

  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as Confession[];
  return sortConfessionsDescending(parsed);
}

function writeLocalConfessions(confessions: Confession[]): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.confessions, JSON.stringify(confessions));
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabase);
}

export async function resolveAnonymousUserId(): Promise<string> {
  if (!hasBrowserStorage()) {
    return createAnonymousUserId();
  }

  const existing = window.localStorage.getItem(STORAGE_KEYS.userId);

  if (existing) {
    return existing;
  }

  const nextUserId = createAnonymousUserId();
  window.localStorage.setItem(STORAGE_KEYS.userId, nextUserId);
  return nextUserId;
}

export async function loadFeed(): Promise<Confession[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("confessions")
      .select("id, user_id, text, mood, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    return (data ?? []).map(fromRow);
  }

  return readLocalConfessions();
}

export async function loadMyConfessions(userId: string): Promise<Confession[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("confessions")
      .select("id, user_id, text, mood, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map(fromRow);
  }

  return readLocalConfessions().filter((confession) => confession.userId === userId);
}

export async function publishConfession(draft: ConfessionDraft): Promise<Confession> {
  const confession: Confession = {
    id: createAnonymousUserId(),
    userId: draft.userId,
    text: draft.text.trim(),
    mood: draft.mood,
    createdAt: new Date().toISOString(),
    source: supabase ? "supabase" : "local"
  };

  if (supabase) {
    const { data, error } = await supabase
      .from("confessions")
      .insert(toRow(confession))
      .select("id, user_id, text, mood, created_at")
      .single();

    if (error) {
      throw error;
    }

    return fromRow(data);
  }

  const nextConfessions = sortConfessionsDescending([confession, ...readLocalConfessions()]);
  writeLocalConfessions(nextConfessions);
  return confession;
}