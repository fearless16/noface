import { describe, expect, it } from "vitest";
import {
  type Confession,
  MAX_CONFESSION_LENGTH,
  MOOD_EMOJI,
  MOODS,
  applyFeedFilters,
  buildConfessionShareText,
  createAnonymousUserId,
  createDefaultFeedFilters,
  fromRow,
  getFeedFilterLabel,
  isPremiumFeedFilter,
  normalizeMood,
  sortConfessionsDescending,
  toRow,
  validateConfession
} from "./index";

function makeConfession(overrides: Partial<Confession> = {}): Confession {
  return {
    id: "confession-1",
    userId: "anon-1",
    text: "A medium length confession used for shared package tests.",
    mood: "hopeful",
    isPrivate: false,
    createdAt: "2026-04-25T12:00:00.000Z",
    source: "local",
    ...overrides
  };
}

describe("validateConfession", () => {
  it("rejects empty text", () => {
    expect(validateConfession("   ")).toBe("Write something before posting.");
  });

  it("rejects text above the max length", () => {
    expect(validateConfession("x".repeat(MAX_CONFESSION_LENGTH + 1))).toBe(
      `Keep it under ${MAX_CONFESSION_LENGTH} characters.`
    );
  });

  it("accepts text at exactly max length", () => {
    expect(validateConfession("x".repeat(MAX_CONFESSION_LENGTH))).toBeNull();
  });

  it("accepts valid text", () => {
    expect(validateConfession("I said the hard thing.")).toBeNull();
  });

  it("trims before length check so whitespace-padded text within limit passes", () => {
    const padded = "  " + "x".repeat(MAX_CONFESSION_LENGTH - 1) + "  ";
    expect(validateConfession(padded)).toBeNull();
  });
});

describe("createAnonymousUserId", () => {
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("returns a RFC-4122 v4 UUID formatted string", () => {
    const id = createAnonymousUserId();
    expect(id).toMatch(UUID_PATTERN);
  });

  it("returns a different value on each call", () => {
    const a = createAnonymousUserId();
    const b = createAnonymousUserId();
    expect(a).not.toBe(b);
  });
});

describe("normalizeMood", () => {
  it("returns null for null input", () => {
    expect(normalizeMood(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeMood(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeMood("")).toBeNull();
  });

  it("returns null for an unrecognised mood string", () => {
    expect(normalizeMood("joyful")).toBeNull();
    expect(normalizeMood("ANGRY")).toBeNull();
  });

  it("returns the mood for every valid mood string", () => {
    for (const mood of MOODS) {
      expect(normalizeMood(mood)).toBe(mood);
    }
  });
});

describe("sortConfessionsDescending", () => {
  it("places the most recent confession first", () => {
    const older = makeConfession({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeConfession({ id: "newer", createdAt: "2026-04-25T12:00:00.000Z" });
    const sorted = sortConfessionsDescending([older, newer]);
    expect(sorted[0].id).toBe("newer");
    expect(sorted[1].id).toBe("older");
  });

  it("does not mutate the original array", () => {
    const items = [
      makeConfession({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeConfession({ id: "b", createdAt: "2026-04-01T00:00:00.000Z" })
    ];
    const original = [...items];
    sortConfessionsDescending(items);
    expect(items[0].id).toBe(original[0].id);
  });

  it("handles a single-item list without throwing", () => {
    const single = [makeConfession()];
    expect(sortConfessionsDescending(single)).toHaveLength(1);
  });
});

describe("buildConfessionShareText", () => {
  it("contains the confession text", () => {
    const c = makeConfession({ text: "The truth I never said." });
    expect(buildConfessionShareText(c)).toContain("The truth I never said.");
  });

  it("includes mood line when mood is set", () => {
    const c = makeConfession({ mood: "sad" });
    expect(buildConfessionShareText(c)).toContain("Mood: sad");
  });

  it("omits mood line when mood is null", () => {
    const c = makeConfession({ mood: null });
    expect(buildConfessionShareText(c)).not.toContain("Mood:");
  });

  it("includes privacy notice when confession is private", () => {
    const c = makeConfession({ isPrivate: true });
    expect(buildConfessionShareText(c)).toContain("Private confession");
  });

  it("omits privacy notice for public confessions", () => {
    const c = makeConfession({ isPrivate: false });
    expect(buildConfessionShareText(c)).not.toContain("Private confession");
  });

  it("always ends with the Noface attribution", () => {
    expect(buildConfessionShareText(makeConfession())).toContain("Shared from Noface.");
  });
});

describe("feed filters", () => {
  const confessions: Confession[] = [
    makeConfession({ id: "short", text: "Short confession.", mood: "sad" }),
    makeConfession({
      id: "long",
      text: "l".repeat(240),
      mood: "hopeful"
    }),
    makeConfession({
      id: "medium",
      text: "m".repeat(180),
      mood: "anxious"
    })
  ];

  it("creates the default feed filter state", () => {
    expect(createDefaultFeedFilters()).toEqual({ filter: "all", mood: "all" });
  });

  it("returns all confessions for the all filter", () => {
    expect(applyFeedFilters(confessions, { filter: "all", mood: "all" })).toHaveLength(3);
  });

  it("filters by mood when a specific mood is selected", () => {
    expect(applyFeedFilters(confessions, { filter: "mood", mood: "anxious" })).toEqual([
      confessions[2]
    ]);
  });

  it("returns all confessions when mood filter is set to all", () => {
    expect(applyFeedFilters(confessions, { filter: "mood", mood: "all" })).toHaveLength(3);
  });

  it("returns confessions with no mood when filter is mood:all", () => {
    const withNullMood = makeConfession({ id: "null-mood", mood: null });
    const result = applyFeedFilters(
      [...confessions, withNullMood],
      { filter: "mood", mood: "all" }
    );
    expect(result).toHaveLength(4);
  });

  it("returns an empty array when no confessions match the selected mood", () => {
    expect(applyFeedFilters(confessions, { filter: "mood", mood: "angry" })).toEqual([]);
  });

  it("returns only short confessions (<=140 chars) for the short filter", () => {
    const result = applyFeedFilters(confessions, { filter: "short", mood: "all" });
    expect(result).toEqual([confessions[0]]);
    expect(result.every((c) => c.text.trim().length <= 140)).toBe(true);
  });

  it("returns only long confessions (>=220 chars) for the long filter", () => {
    const result = applyFeedFilters(confessions, { filter: "long", mood: "all" });
    expect(result).toEqual([confessions[1]]);
    expect(result.every((c) => c.text.trim().length >= 220)).toBe(true);
  });

  it("identifies premium filters and labels them", () => {
    expect(isPremiumFeedFilter("mood")).toBe(true);
    expect(isPremiumFeedFilter("short")).toBe(true);
    expect(isPremiumFeedFilter("long")).toBe(true);
    expect(isPremiumFeedFilter("all")).toBe(false);
    expect(getFeedFilterLabel("short")).toBe("Short reads");
    expect(getFeedFilterLabel("long")).toBe("Long reads");
    expect(getFeedFilterLabel("all")).toBe("All confessions");
  });
});

describe("serialization helpers", () => {
  it("round-trips a confession through row conversion", () => {
    const confession = makeConfession({ isPrivate: true, mood: "regret", source: undefined });

    expect(fromRow(toRow(confession))).toMatchObject({
      id: confession.id,
      userId: confession.userId,
      text: confession.text,
      mood: confession.mood,
      isPrivate: true,
      createdAt: confession.createdAt,
      source: "supabase"
    });
  });

  it("preserves null mood through row conversion", () => {
    const confession = makeConfession({ mood: null });
    const roundTripped = fromRow(toRow(confession));
    expect(roundTripped.mood).toBeNull();
  });

  it("sets source to supabase after fromRow", () => {
    const row = toRow(makeConfession());
    expect(fromRow(row).source).toBe("supabase");
  });
});

describe("MOOD_EMOJI", () => {
  it("has an emoji entry for every mood", () => {
    for (const mood of MOODS) {
      expect(MOOD_EMOJI[mood]).toBeTruthy();
      expect(typeof MOOD_EMOJI[mood]).toBe("string");
    }
  });

  it("covers all 6 moods", () => {
    expect(Object.keys(MOOD_EMOJI)).toHaveLength(MOODS.length);
  });

  it("maps known moods to the expected emojis", () => {
    expect(MOOD_EMOJI.sad).toBe("🌧️");
    expect(MOOD_EMOJI.angry).toBe("🔥");
    expect(MOOD_EMOJI.regret).toBe("💀");
    expect(MOOD_EMOJI.happy).toBe("🖤");
    expect(MOOD_EMOJI.anxious).toBe("🕷️");
    expect(MOOD_EMOJI.hopeful).toBe("🌙");
  });
});
