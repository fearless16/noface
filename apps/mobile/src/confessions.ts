import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import {
  type Confession,
  type ConfessionDraft,
  DEMO_CONFESSIONS,
  FEED_PAGE_FETCH_SIZE,
  STORAGE_KEYS,
  createAnonymousUserId,
  fromRow,
  sortConfessionsDescending,
  toRow
} from "@noface/shared";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      })
    : null;

async function readLocalConfessions(): Promise<Confession[]> {
  const [raw, seeded] = await AsyncStorage.multiGet([
    STORAGE_KEYS.confessions,
    STORAGE_KEYS.demoSeeded
  ]);

  const storedConfessions = raw[1];
  const isSeeded = seeded[1] === "true";

  if (!storedConfessions && !isSeeded) {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.confessions, JSON.stringify(DEMO_CONFESSIONS)],
      [STORAGE_KEYS.demoSeeded, "true"]
    ]);

    return sortConfessionsDescending(DEMO_CONFESSIONS);
  }

  if (!storedConfessions) {
    return [];
  }

  const parsedConfessions = JSON.parse(storedConfessions) as Confession[];
  const existingIds = new Set(parsedConfessions.map((confession) => confession.id));
  const missingSeedConfessions = DEMO_CONFESSIONS.filter((confession) => !existingIds.has(confession.id));

  if (missingSeedConfessions.length === 0) {
    return sortConfessionsDescending(parsedConfessions);
  }

  const mergedConfessions = sortConfessionsDescending([
    ...parsedConfessions,
    ...missingSeedConfessions
  ]);

  await writeLocalConfessions(mergedConfessions);

  return mergedConfessions;
}

async function readPublicLocalConfessions(): Promise<Confession[]> {
  return (await readLocalConfessions()).filter((confession) => !confession.isPrivate);
}

async function writeLocalConfessions(confessions: Confession[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.confessions, JSON.stringify(confessions));
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabase);
}

export function canDeleteMyConfessions(): boolean {
  return !supabase;
}

export async function resolveAnonymousUserId(): Promise<string> {
  const existing = await AsyncStorage.getItem(STORAGE_KEYS.userId);

  if (existing) {
    return existing;
  }

  const nextUserId = createAnonymousUserId();
  await AsyncStorage.setItem(STORAGE_KEYS.userId, nextUserId);
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

  return (await readPublicLocalConfessions()).slice(offset, offset + limit);
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

  const confessions = await readLocalConfessions();
  return confessions.filter((confession) => confession.userId === userId);
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

  const nextConfessions = sortConfessionsDescending([confession, ...(await readLocalConfessions())]);
  await writeLocalConfessions(nextConfessions);
  return confession;
}

export async function deleteMyConfession(confessionId: string, userId: string): Promise<void> {
  if (supabase) {
    throw new Error("Delete is not enabled for live Supabase mode yet.");
  }

  const nextConfessions = (await readLocalConfessions()).filter((confession) => {
    return !(confession.id === confessionId && confession.userId === userId);
  });

  await writeLocalConfessions(nextConfessions);
}