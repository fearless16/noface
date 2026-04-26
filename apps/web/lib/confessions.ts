import {
  type Confession,
  type ConfessionDraft,
  DEMO_CONFESSIONS,
  DEMO_CONFESSION_SEED_VERSION,
  FEED_PAGE_FETCH_SIZE,
  STORAGE_KEYS,
  createAnonymousUserId,
  fromRow,
  sortConfessionsDescending,
  toRow
} from "@noface/shared";
import { createClient } from "../utils/supabase/client";

const supabase = createClient();
const DEMO_CONFESSION_IDS = new Set(DEMO_CONFESSIONS.map((confession) => confession.id));

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined";
}

function mergeLatestDemoConfessions(confessions: Confession[]): Confession[] {
  const preservedConfessions = confessions.filter((confession) => !DEMO_CONFESSION_IDS.has(confession.id));
  return sortConfessionsDescending([...DEMO_CONFESSIONS, ...preservedConfessions]);
}

function readLocalConfessions(): Confession[] {
  if (!hasBrowserStorage()) {
    return sortConfessionsDescending(DEMO_CONFESSIONS);
  }

  const raw = window.localStorage.getItem(STORAGE_KEYS.confessions);
  const storedSeedVersion = window.localStorage.getItem(STORAGE_KEYS.demoSeedVersion);

  if (!raw) {
    window.localStorage.setItem(STORAGE_KEYS.confessions, JSON.stringify(DEMO_CONFESSIONS));
    window.localStorage.setItem(STORAGE_KEYS.demoSeeded, "true");
    window.localStorage.setItem(STORAGE_KEYS.demoSeedVersion, DEMO_CONFESSION_SEED_VERSION);
    return sortConfessionsDescending(DEMO_CONFESSIONS);
  }

  const parsed = JSON.parse(raw) as Confession[];

  if (storedSeedVersion === DEMO_CONFESSION_SEED_VERSION) {
    return sortConfessionsDescending(parsed);
  }

  const mergedConfessions = mergeLatestDemoConfessions(parsed);

  window.localStorage.setItem(STORAGE_KEYS.confessions, JSON.stringify(mergedConfessions));
  window.localStorage.setItem(STORAGE_KEYS.demoSeeded, "true");
  window.localStorage.setItem(STORAGE_KEYS.demoSeedVersion, DEMO_CONFESSION_SEED_VERSION);

  return mergedConfessions;
}

function readPublicLocalConfessions(): Confession[] {
  return readLocalConfessions().filter((confession) => !confession.isPrivate);
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

export function canDeleteMyConfessions(): boolean {
  return !supabase;
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

type LoadFeedPageOptions = {
  offset?: number;
  limit?: number;
};

export async function loadFeedPage({
  offset = 0,
  limit = FEED_PAGE_FETCH_SIZE
}: LoadFeedPageOptions = {}): Promise<Confession[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("confessions")
      .select("id, user_id, text, mood, is_private, created_at")
      .eq("is_private", false)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return (data ?? []).map(fromRow);
  }

  return readPublicLocalConfessions().slice(offset, offset + limit);
}

export async function loadMyConfessions(userId: string): Promise<Confession[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("confessions")
      .select("id, user_id, text, mood, is_private, created_at")
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
    isPrivate: draft.isPrivate,
    createdAt: new Date().toISOString(),
    source: supabase ? "supabase" : "local"
  };

  if (supabase) {
    const { data, error } = await supabase
      .from("confessions")
      .insert(toRow(confession))
      .select("id, user_id, text, mood, is_private, created_at")
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

export async function deleteMyConfession(confessionId: string, userId: string): Promise<void> {
  if (supabase) {
    throw new Error("Delete is not enabled for live Supabase mode yet.");
  }

  const nextConfessions = readLocalConfessions().filter((confession) => {
    return !(confession.id === confessionId && confession.userId === userId);
  });

  writeLocalConfessions(nextConfessions);
}