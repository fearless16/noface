import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
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

  return sortConfessionsDescending(JSON.parse(storedConfessions) as Confession[]);
}

async function writeLocalConfessions(confessions: Confession[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.confessions, JSON.stringify(confessions));
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabase);
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

  const confessions = await readLocalConfessions();
  return confessions.filter((confession) => confession.userId === userId);
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

  const nextConfessions = sortConfessionsDescending([confession, ...(await readLocalConfessions())]);
  await writeLocalConfessions(nextConfessions);
  return confession;
}