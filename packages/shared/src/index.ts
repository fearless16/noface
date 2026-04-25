export const MAX_CONFESSION_LENGTH = 500;

export const MOODS = [
  "sad",
  "angry",
  "regret",
  "happy",
  "anxious",
  "hopeful"
] as const;

export type Mood = (typeof MOODS)[number];

export type Confession = {
  id: string;
  userId: string;
  text: string;
  mood: Mood | null;
  createdAt: string;
  source?: "local" | "supabase";
};

export type ConfessionDraft = {
  userId: string;
  text: string;
  mood: Mood | null;
};

export type ConfessionRow = {
  id: string;
  user_id: string;
  text: string;
  mood: string | null;
  created_at: string;
};

export const STORAGE_KEYS = {
  userId: "noface.user-id",
  confessions: "noface.confessions",
  demoSeeded: "noface.demo-seeded"
} as const;

export function createAnonymousUserId(): string {
  const cryptoObject = globalThis as typeof globalThis & {
    crypto?: {
      randomUUID?: () => string;
    };
  };
  const randomUUID = cryptoObject.crypto?.randomUUID;

  if (randomUUID) {
    return randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;

    return value.toString(16);
  });
}

export function normalizeMood(value: string | null | undefined): Mood | null {
  if (!value) {
    return null;
  }

  return MOODS.includes(value as Mood) ? (value as Mood) : null;
}

export function validateConfession(text: string): string | null {
  const trimmed = text.trim();

  if (!trimmed) {
    return "Write something before posting.";
  }

  if (trimmed.length > MAX_CONFESSION_LENGTH) {
    return `Keep it under ${MAX_CONFESSION_LENGTH} characters.`;
  }

  return null;
}

export function sortConfessionsDescending(confessions: Confession[]): Confession[] {
  return [...confessions].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export function fromRow(row: ConfessionRow): Confession {
  return {
    id: row.id,
    userId: row.user_id,
    text: row.text,
    mood: normalizeMood(row.mood),
    createdAt: row.created_at,
    source: "supabase"
  };
}

export function toRow(confession: Confession): ConfessionRow {
  return {
    id: confession.id,
    user_id: confession.userId,
    text: confession.text,
    mood: confession.mood,
    created_at: confession.createdAt
  };
}

export const DEMO_CONFESSIONS: Confession[] = [
  {
    id: "demo-1",
    userId: "anon-demo",
    text: "I keep pretending I am fine at work because I do not want anyone to think I am falling behind.",
    mood: "anxious",
    createdAt: "2026-04-24T23:42:00.000Z",
    source: "local"
  },
  {
    id: "demo-2",
    userId: "anon-demo",
    text: "Today was the first day in months that I felt genuinely hopeful about starting over.",
    mood: "hopeful",
    createdAt: "2026-04-24T21:10:00.000Z",
    source: "local"
  },
  {
    id: "demo-3",
    userId: "anon-demo",
    text: "I still replay one conversation from years ago and wish I had said the kinder thing.",
    mood: "regret",
    createdAt: "2026-04-24T18:05:00.000Z",
    source: "local"
  }
];