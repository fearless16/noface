export const MAX_CONFESSION_LENGTH = 500;
export const FEED_PAGE_FETCH_SIZE = 100;

export const MOODS = [
  "sad",
  "angry",
  "regret",
  "happy",
  "anxious",
  "hopeful"
] as const;

export type Mood = (typeof MOODS)[number];

export const MOOD_EMOJI: Record<Mood, string> = {
  sad: "🌧️",
  angry: "🔥",
  regret: "💀",
  happy: "🖤",
  anxious: "🕷️",
  hopeful: "🌙"
};

export type Confession = {
  id: string;
  userId: string;
  text: string;
  mood: Mood | null;
  isPrivate: boolean;
  createdAt: string;
  source?: "local" | "supabase";
};

export type ConfessionDraft = {
  userId: string;
  text: string;
  mood: Mood | null;
  isPrivate: boolean;
};

export const PREMIUM_FEED_FILTERS = [
  "mood",
  "short",
  "long"
] as const;

export type PremiumFeedFilter = (typeof PREMIUM_FEED_FILTERS)[number];

export type FeedFilter = "all" | PremiumFeedFilter;

export type FeedFilters = {
  filter: FeedFilter;
  mood: Mood | "all";
};

export type ConfessionRow = {
  id: string;
  user_id: string;
  text: string;
  mood: string | null;
  is_private: boolean | null;
  created_at: string;
};

type ShareCardPalette = {
  background: string;
  border: string;
  accent: string;
  text: string;
  muted: string;
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

  if (cryptoObject.crypto?.randomUUID) {
    return cryptoObject.crypto.randomUUID();
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

export function formatConfessionDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function createDefaultFeedFilters(): FeedFilters {
  return {
    filter: "all",
    mood: "all"
  };
}

export function isPremiumFeedFilter(filter: FeedFilter): filter is PremiumFeedFilter {
  return PREMIUM_FEED_FILTERS.includes(filter as PremiumFeedFilter);
}

export function applyFeedFilters(confessions: Confession[], filters: FeedFilters): Confession[] {
  switch (filters.filter) {
    case "mood":
      if (filters.mood === "all") {
        return confessions;
      }

      return confessions.filter((confession) => confession.mood === filters.mood);
    case "short":
      return confessions.filter((confession) => confession.text.trim().length <= 140);
    case "long":
      return confessions.filter((confession) => confession.text.trim().length >= 220);
    case "all":
    default:
      return confessions;
  }
}

export function getFeedFilterLabel(filter: FeedFilter): string {
  switch (filter) {
    case "mood":
      return "Mood match";
    case "short":
      return "Short reads";
    case "long":
      return "Long reads";
    case "all":
    default:
      return "All confessions";
  }
}

export function buildConfessionShareText(confession: Confession): string {
  const mood = confession.mood ? `Mood: ${confession.mood}\n` : "";
  const privacy = confession.isPrivate ? "Private confession\n" : "";

  return `${confession.text}\n\n${privacy}${mood}Shared from Noface.`;
}

export function buildConfessionShareFileName(confession: Confession): string {
  return `noface-confession-${confession.id.slice(0, 8)}.svg`;
}

export function buildConfessionShareCardSvg(confession: Confession): string {
  const palette = pickSharePalette(confession.mood);
  const formattedDate = formatConfessionDate(confession.createdAt);
  const lines = wrapText(confession.text, 33).slice(0, 7);
  const lineMarkup = lines
    .map((line, index) => {
      return `<tspan x="56" dy="${index === 0 ? 0 : 32}">${escapeSvgText(line)}</tspan>`;
    })
    .join("");
  const moodMarkup = confession.mood
    ? `<text x="56" y="448" font-size="20" font-family="Avenir Next, Segoe UI, sans-serif" fill="${palette.accent}" text-transform="capitalize">${escapeSvgText(confession.mood)}</text>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="Noface confession share card">`,
    `<rect width="1080" height="1080" rx="64" fill="${palette.background}" />`,
    `<circle cx="980" cy="120" r="180" fill="${palette.accent}" fill-opacity="0.08" />`,
    `<circle cx="120" cy="960" r="220" fill="${palette.accent}" fill-opacity="0.08" />`,
    `<rect x="40" y="40" width="1000" height="1000" rx="48" fill="none" stroke="${palette.border}" stroke-width="4" />`,
    `<text x="56" y="108" font-size="28" letter-spacing="8" font-family="Avenir Next, Segoe UI, sans-serif" fill="${palette.muted}">NOFACE</text>`,
    `<text x="56" y="178" font-size="76" font-family="Georgia, Times New Roman, serif" fill="${palette.text}">Anonymous confession</text>`,
    `<text x="56" y="260" font-size="24" font-family="Avenir Next, Segoe UI, sans-serif" fill="${palette.muted}">${escapeSvgText(formattedDate)}</text>`,
    `<text x="56" y="360" font-size="44" font-family="Avenir Next, Segoe UI, sans-serif" fill="${palette.text}">${lineMarkup}</text>`,
    moodMarkup,
    `<text x="56" y="982" font-size="26" font-family="Avenir Next, Segoe UI, sans-serif" fill="${palette.muted}">Write freely. Leave no face behind.</text>`,
    `</svg>`
  ].join("");
}

export function fromRow(row: ConfessionRow): Confession {
  return {
    id: row.id,
    userId: row.user_id,
    text: row.text,
    mood: normalizeMood(row.mood),
    isPrivate: Boolean(row.is_private),
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
    is_private: confession.isPrivate,
    created_at: confession.createdAt
  };
}

export const DEMO_CONFESSIONS: Confession[] = [
  {
    id: "demo-1",
    userId: "anon-demo",
    text: "I keep pretending I am fine at work because I do not want anyone to think I am falling behind.",
    mood: "anxious",
    isPrivate: false,
    createdAt: "2026-04-24T23:42:00.000Z",
    source: "local"
  },
  {
    id: "demo-2",
    userId: "anon-demo",
    text: "Today was the first day in months that I felt genuinely hopeful about starting over.",
    mood: "hopeful",
    isPrivate: false,
    createdAt: "2026-04-24T21:10:00.000Z",
    source: "local"
  },
  {
    id: "demo-3",
    userId: "anon-demo",
    text: "I still replay one conversation from years ago and wish I had said the kinder thing.",
    mood: "regret",
    isPrivate: false,
    createdAt: "2026-04-24T18:05:00.000Z",
    source: "local"
  }
];

function wrapText(text: string, maxLength: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= maxLength) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function escapeSvgText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pickSharePalette(mood: Mood | null): ShareCardPalette {
  switch (mood) {
    case "happy":
      return {
        background: "#fff7d6",
        border: "#f0c95b",
        accent: "#d58f00",
        text: "#2c2414",
        muted: "#7b6741"
      };
    case "sad":
      return {
        background: "#eaf2ff",
        border: "#9eb6e5",
        accent: "#5379bf",
        text: "#18253d",
        muted: "#5b6880"
      };
    case "angry":
      return {
        background: "#fff0eb",
        border: "#e3a896",
        accent: "#c24f2e",
        text: "#381d16",
        muted: "#7b5c52"
      };
    default:
      return {
        background: "#fcf6ea",
        border: "#decdb0",
        accent: "#d76a3b",
        text: "#17202a",
        muted: "#566573"
      };
  }
}