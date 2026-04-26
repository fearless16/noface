import { describe, expect, it } from "vitest";
import {
  type Confession,
  createAnonymousUsername,
  DEMO_CONFESSIONS,
  MAX_CONFESSION_LENGTH,
  MOOD_EMOJI,
  MOODS,
  applyFeedFilters,
  buildConfessionShareText,
  BLOCKED_CONFESSION_TERMS,
  createAnonymousUserId,
  createSecretIdentity,
  createDefaultFeedFilters,
  formatSecretId,
  fromRow,
  getConfessionModerationMessage,
  getFeedFilterLabel,
  inspectConfessionModeration,
  isPremiumFeedFilter,
  normalizeMood,
  normalizeConfessionText,
  rankRecommendedConfessions,
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

  it("rejects confessions containing links", () => {
    expect(validateConfession("read this https://example.com right now")).toBe(
      "Links and handle drops are blocked. Keep the confession text-only."
    );
  });

  it("rejects confessions containing blocked promo terms", () => {
    expect(validateConfession("join my telegram and buy now")).toBe(
      "Promo and spam phrases are blocked from the confession feed."
    );
  });
});

describe("confession moderation helpers", () => {
  it("normalizes confession text before moderation checks", () => {
    expect(normalizeConfessionText("  Join   MY   Telegram  ")).toBe("join my telegram");
  });

  it("detects blocked links and terms", () => {
    expect(inspectConfessionModeration("www.example.com telegram onlyfans")).toEqual({
      blockedTerms: BLOCKED_CONFESSION_TERMS.filter((term) => ["telegram", "onlyfans"].includes(term)),
      containsBlockedLink: true,
      shouldBlock: true
    });
  });

  it("returns null moderation message for normal confessions", () => {
    expect(getConfessionModerationMessage("I finally said no and walked away.")).toBeNull();
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

describe("identity helpers", () => {
  it("derives a deterministic username from a secret id", () => {
    expect(createAnonymousUsername("00000000-0000-4000-8000-000000000001")).toBe(
      createAnonymousUsername("00000000-0000-4000-8000-000000000001")
    );
  });

  it("creates different usernames for different secret ids", () => {
    expect(createAnonymousUsername("00000000-0000-4000-8000-000000000001")).not.toBe(
      createAnonymousUsername("00000000-0000-4000-8000-000000000002")
    );
  });

  it("creates a secret identity with the original id and generated username", () => {
    expect(createSecretIdentity("00000000-0000-4000-8000-000000000001")).toEqual({
      secretId: "00000000-0000-4000-8000-000000000001",
      username: createAnonymousUsername("00000000-0000-4000-8000-000000000001")
    });
  });

  it("formats the secret id for premium display", () => {
    expect(formatSecretId("00000000-0000-4000-8000-000000000001")).toBe(
      "00000000 0000 4000 8000 000000000001"
    );
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
    expect(createDefaultFeedFilters()).toEqual({ filter: "recommended", mood: "all" });
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
    expect(isPremiumFeedFilter("recommended")).toBe(true);
    expect(isPremiumFeedFilter("mood")).toBe(true);
    expect(isPremiumFeedFilter("short")).toBe(true);
    expect(isPremiumFeedFilter("long")).toBe(true);
    expect(isPremiumFeedFilter("all")).toBe(false);
    expect(getFeedFilterLabel("recommended")).toBe("Recommended");
    expect(getFeedFilterLabel("short")).toBe("Short reads");
    expect(getFeedFilterLabel("long")).toBe("Long reads");
    expect(getFeedFilterLabel("all")).toBe("All confessions");
  });

  it("ranks recommended confessions by mood affinity and avoids the viewer's own posts", () => {
    const publicFeed = [
      makeConfession({ id: "short", userId: "anon-2", text: "Short confession.", mood: "sad" }),
      makeConfession({ id: "long", userId: "anon-3", text: "l".repeat(240), mood: "hopeful" }),
      makeConfession({ id: "medium", userId: "anon-4", text: "m".repeat(180), mood: "anxious" })
    ];
    const recommended = rankRecommendedConfessions(publicFeed, {
      viewerUserId: "anon-1",
      myConfessions: [
        makeConfession({ id: "mine-1", userId: "anon-1", mood: "hopeful", text: "h".repeat(220) }),
        makeConfession({ id: "mine-2", userId: "anon-1", mood: "hopeful", text: "h".repeat(200) })
      ]
    });

    expect(recommended[0]?.id).toBe("long");
    expect(recommended.at(-1)?.userId).not.toBe("anon-1");
  });

  it("uses recommended ranking when the recommended filter is selected", () => {
    const result = applyFeedFilters(confessions, { filter: "recommended", mood: "all" }, {
      myConfessions: [makeConfession({ id: "mine-1", mood: "sad" })]
    });

    expect(result[0]?.mood).toBe("sad");
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

describe("DEMO_CONFESSIONS", () => {
  it("seeds enough public confessions to overflow the default mobile feed viewport", () => {
    expect(DEMO_CONFESSIONS.length).toBeGreaterThanOrEqual(8);
  });

  it("keeps all demo confessions public so the feed preview is populated", () => {
    expect(DEMO_CONFESSIONS.every((confession) => confession.isPrivate === false)).toBe(true);
  });

  it("uses unique ids for every seeded confession", () => {
    expect(new Set(DEMO_CONFESSIONS.map((confession) => confession.id)).size).toBe(
      DEMO_CONFESSIONS.length
    );
  });
});
