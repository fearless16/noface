import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEMO_CONFESSIONS } from "@noface/shared";
import {
  MOBILE_MIN_PUBLIC_DEMO_CONFESSIONS,
  MOBILE_SCROLL_PROPS,
  MOBILE_TOUCH_TARGETS,
  MOBILE_WRITE_SCROLL_PROPS
} from "./ui-contract";

const appSource = readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");

describe("mobile scroll contract", () => {
  it("keeps feed and mine lists visibly scrollable", () => {
    expect(MOBILE_SCROLL_PROPS.alwaysBounceVertical).toBe(true);
    expect(MOBILE_SCROLL_PROPS.bounces).toBe(true);
    expect(MOBILE_SCROLL_PROPS.contentInsetAdjustmentBehavior).toBe("automatic");
    expect(MOBILE_SCROLL_PROPS.showsVerticalScrollIndicator).toBe(true);
  });

  it("keeps the write screen scrollable while preserving taps", () => {
    expect(MOBILE_WRITE_SCROLL_PROPS.alwaysBounceVertical).toBe(true);
    expect(MOBILE_WRITE_SCROLL_PROPS.bounces).toBe(true);
    expect(MOBILE_WRITE_SCROLL_PROPS.keyboardShouldPersistTaps).toBe("handled");
    expect(MOBILE_WRITE_SCROLL_PROPS.showsVerticalScrollIndicator).toBe(true);
  });
});

describe("mobile touch target contract", () => {
  it("keeps tabs large enough to tap comfortably", () => {
    expect(MOBILE_TOUCH_TARGETS.tabMinHeight).toBeGreaterThanOrEqual(44);
  });

  it("keeps chips and action buttons large enough to tap comfortably", () => {
    expect(MOBILE_TOUCH_TARGETS.chipMinHeight).toBeGreaterThanOrEqual(40);
    expect(MOBILE_TOUCH_TARGETS.actionButtonMinHeight).toBeGreaterThanOrEqual(40);
  });

  it("uses a brighter inactive text color than the original muddy dark value", () => {
    expect(MOBILE_TOUCH_TARGETS.inactiveTextColor).toBe("#b7b7d4");
    expect(MOBILE_TOUCH_TARGETS.inactiveTextColor).not.toBe("#4a4a6a");
  });
});

describe("demo feed contract", () => {
  it("seeds enough public confessions to overflow a simulator viewport", () => {
    const publicDemoConfessions = DEMO_CONFESSIONS.filter((confession) => !confession.isPrivate);

    expect(publicDemoConfessions.length).toBeGreaterThanOrEqual(MOBILE_MIN_PUBLIC_DEMO_CONFESSIONS);
  });

  it("keeps demo confession ids unique when topping up existing local storage", () => {
    expect(new Set(DEMO_CONFESSIONS.map((confession) => confession.id)).size).toBe(
      DEMO_CONFESSIONS.length
    );
  });
});

describe("App.tsx wiring", () => {
  it("wires feed and mine lists to the shared scroll contract", () => {
    expect(appSource).toContain("alwaysBounceVertical={MOBILE_SCROLL_PROPS.alwaysBounceVertical}");
    expect(appSource).toContain("bounces={MOBILE_SCROLL_PROPS.bounces}");
    expect(appSource).toContain(
      "contentInsetAdjustmentBehavior={MOBILE_SCROLL_PROPS.contentInsetAdjustmentBehavior}"
    );
    expect(appSource).toContain(
      "showsVerticalScrollIndicator={MOBILE_SCROLL_PROPS.showsVerticalScrollIndicator}"
    );
  });

  it("wires the write screen to the dedicated write scroll contract", () => {
    expect(appSource).toContain(
      "alwaysBounceVertical={MOBILE_WRITE_SCROLL_PROPS.alwaysBounceVertical}"
    );
    expect(appSource).toContain("bounces={MOBILE_WRITE_SCROLL_PROPS.bounces}");
    expect(appSource).toContain(
      "keyboardShouldPersistTaps={MOBILE_WRITE_SCROLL_PROPS.keyboardShouldPersistTaps}"
    );
    expect(appSource).toContain(
      "showsVerticalScrollIndicator={MOBILE_WRITE_SCROLL_PROPS.showsVerticalScrollIndicator}"
    );
  });

  it("wires tabs, chips, and action buttons to the touch-target contract", () => {
    expect(appSource).toContain("minHeight: MOBILE_TOUCH_TARGETS.tabMinHeight");
    expect(appSource).toContain("minHeight: MOBILE_TOUCH_TARGETS.chipMinHeight");
    expect(appSource).toContain("minHeight: MOBILE_TOUCH_TARGETS.actionButtonMinHeight");
    expect(appSource).toContain("color: MOBILE_TOUCH_TARGETS.inactiveTextColor");
  });

  it("wires the composer to the shared moderation preflight", () => {
    expect(appSource).toContain("getConfessionModerationMessage");
    expect(appSource).toContain("Links, handle drops, and promo phrases are filtered before publish.");
    expect(appSource).toContain("disabled={isSubmitting || Boolean(composerModerationMessage)}");
  });
});