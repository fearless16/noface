import { describe, expect, it } from "vitest";
import {
  type Confession,
  MAX_CONFESSION_LENGTH,
  applyFeedFilters,
  buildConfessionShareText,
  createDefaultFeedFilters,
  fromRow,
  getFeedFilterLabel,
  isPremiumFeedFilter,
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

  it("accepts valid text", () => {
    expect(validateConfession("I said the hard thing.")).toBeNull();
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

  it("filters by mood when a specific mood is selected", () => {
    expect(applyFeedFilters(confessions, { filter: "mood", mood: "anxious" })).toEqual([
      confessions[2]
    ]);
  });

  it("returns all confessions for the short and long filters based on text length", () => {
    expect(applyFeedFilters(confessions, { filter: "short", mood: "all" })).toEqual([
      confessions[0]
    ]);
    expect(applyFeedFilters(confessions, { filter: "long", mood: "all" })).toEqual([
      confessions[1]
    ]);
  });

  it("identifies premium filters and labels them", () => {
    expect(isPremiumFeedFilter("mood")).toBe(true);
    expect(isPremiumFeedFilter("all")).toBe(false);
    expect(getFeedFilterLabel("short")).toBe("Short reads");
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

  it("includes privacy in shared text when the confession is private", () => {
    const sharedText = buildConfessionShareText(makeConfession({ isPrivate: true, mood: "sad" }));

    expect(sharedText).toContain("Private confession");
    expect(sharedText).toContain("Mood: sad");
  });
});