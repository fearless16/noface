"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  applyFeedFilters,
  buildConfessionShareCardSvg,
  buildConfessionShareFileName,
  buildConfessionShareText,
  type Confession,
  createDefaultFeedFilters,
  FEED_PAGE_FETCH_SIZE,
  type FeedFilter,
  type FeedFilters,
  formatConfessionDate,
  getFeedFilterLabel,
  isPremiumFeedFilter,
  type Mood,
  MAX_CONFESSION_LENGTH,
  MOOD_EMOJI,
  MOODS,
  validateConfession
} from "@noface/shared";
import {
  canDeleteMyConfessions,
  deleteMyConfession,
  loadFeedPage,
  loadMyConfessions,
  publishConfession,
  resolveAnonymousUserId
} from "../lib/confessions";


type View = "feed" | "write" | "mine";

type HomePageClientProps = {
  initialFeed: Confession[];
  hasServerSupabase: boolean;
};

const PAGE_SIZE = 8;
const FEED_FILTER_OPTIONS: FeedFilter[] = ["all", "mood", "short", "long"];

export default function HomePageClient({
  initialFeed,
}: HomePageClientProps) {
  const [currentView, setCurrentView] = useState<View>("feed");
  const [userId, setUserId] = useState<string>("");
  const [feed, setFeed] = useState<Confession[]>(initialFeed);
  const [mine, setMine] = useState<Confession[]>([]);
  const [text, setText] = useState("");
  const [selectedMood, setSelectedMood] = useState<Mood | "">("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [feedFilters, setFeedFilters] = useState<FeedFilters>(() => createDefaultFeedFilters());
  const [isPremiumPreviewEnabled, setIsPremiumPreviewEnabled] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [feedOffset, setFeedOffset] = useState(initialFeed.length);
  const [hasMoreFeed, setHasMoreFeed] = useState(initialFeed.length === FEED_PAGE_FETCH_SIZE);
  const [isLoadingFeedPage, setIsLoadingFeedPage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const canDelete = useMemo(() => canDeleteMyConfessions(), []);
  const filteredFeed = useMemo(() => applyFeedFilters(feed, feedFilters), [feed, feedFilters]);
  const visibleFeed = filteredFeed.slice(0, visibleCount);

  async function loadNextFeedPage() {
    if (isLoadingFeedPage || !hasMoreFeed) {
      return;
    }

    try {
      setIsLoadingFeedPage(true);

      const nextPage = await loadFeedPage({ offset: feedOffset });

      setFeed((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        const uniqueNextPage = nextPage.filter((item) => !existingIds.has(item.id));

        return [...current, ...uniqueNextPage];
      });
      setFeedOffset((current) => current + nextPage.length);
      setHasMoreFeed(nextPage.length === FEED_PAGE_FETCH_SIZE);
    } catch (error) {
      console.error(error);
      setErrorMessage("Unable to load more confessions right now.");
    } finally {
      setIsLoadingFeedPage(false);
    }
  }

  useEffect(() => {
    let isActive = true;

    async function bootstrap() {
      const anonymousUserId = await resolveAnonymousUserId();

      if (!isActive) {
        return;
      }

      setUserId(anonymousUserId);

      const nextFeedPromise = initialFeed.length > 0 ? Promise.resolve(initialFeed) : loadFeedPage();
      const [nextFeed, nextMine] = await Promise.all([
        nextFeedPromise,
        loadMyConfessions(anonymousUserId)
      ]);

      if (!isActive) {
        return;
      }

      setFeed(nextFeed);
      setFeedOffset(nextFeed.length);
      setHasMoreFeed(nextFeed.length === FEED_PAGE_FETCH_SIZE);
      setMine(nextMine);
    }

    bootstrap().catch((error: unknown) => {
      console.error(error);
      if (isActive) {
        setErrorMessage("Unable to load confessions right now.");
      }
    });

    return () => {
      isActive = false;
    };
  }, [initialFeed]);

  useEffect(() => {
    if (currentView !== "feed") {
      return;
    }

    const sentinel = sentinelRef.current;

    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (!entry?.isIntersecting) {
          return;
        }

        setVisibleCount((current) => {
          if (current >= filteredFeed.length) {
            if (hasMoreFeed && !isLoadingFeedPage) {
              void loadNextFeedPage();
            }

            return current;
          }

          return Math.min(current + PAGE_SIZE, filteredFeed.length);
        });
      },
      { rootMargin: "0px 0px 240px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [currentView, filteredFeed.length, hasMoreFeed, isLoadingFeedPage]);

  useEffect(() => {
    if (currentView !== "feed") {
      return;
    }

    if (!hasMoreFeed || isLoadingFeedPage) {
      return;
    }

    if (visibleCount < filteredFeed.length || filteredFeed.length >= PAGE_SIZE) {
      return;
    }

    void loadNextFeedPage();
  }, [currentView, filteredFeed.length, hasMoreFeed, isLoadingFeedPage, visibleCount]);

  async function handlePublish() {
    const validationError = validateConfession(text);

    if (validationError) {
      setErrorMessage(validationError);
      setStatusMessage(null);
      return;
    }

    if (!userId) {
      setErrorMessage("Anonymous user id is still loading.");
      return;
    }

    setErrorMessage(null);

    try {
      const created = await publishConfession({
        userId,
        text,
        mood: selectedMood || null,
        isPrivate
      });

      setFeed((current) => (created.isPrivate ? current : [created, ...current]));
      setMine((current) => [created, ...current]);
      if (!created.isPrivate) {
        setFeedOffset((current) => current + 1);
      }
      setVisibleCount((current) => Math.max(PAGE_SIZE, current));
      setText("");
      setSelectedMood("");
      setIsPrivate(false);
      setStatusMessage(created.isPrivate ? "Private confession saved." : "Confession posted.");
      setCurrentView("feed");
    } catch (error) {
      console.error(error);
      setErrorMessage("Unable to post right now.");
      setStatusMessage(null);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => {
      void handlePublish();
    });
  }

  async function handleShare(confession: Confession) {
    const shareText = buildConfessionShareText(confession);

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "Noface confession",
          text: shareText
        });
        setShareMessage("Confession shared.");
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        setShareMessage("Confession copied to the clipboard.");
        return;
      }

      setShareMessage("Web sharing is not available in this browser.");
    } catch (error) {
      console.error(error);
      setShareMessage("Unable to share right now.");
    }
  }

  function handleDownloadCard(confession: Confession) {
    const svg = buildConfessionShareCardSvg(confession);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = buildConfessionShareFileName(confession);
    anchor.click();

    URL.revokeObjectURL(objectUrl);
    setShareMessage("Share card downloaded.");
  }

  async function handleDelete(confession: Confession) {
    if (!canDelete) {
      setErrorMessage("Delete is only available in demo mode right now.");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Delete this confession from your device?");

      if (!confirmed) {
        return;
      }
    }

    try {
      await deleteMyConfession(confession.id, confession.userId);
      setMine((current) => current.filter((item) => item.id !== confession.id));
      setFeed((current) => current.filter((item) => item.id !== confession.id));
      setStatusMessage("Confession deleted.");
      setErrorMessage(null);
    } catch (error) {
      console.error(error);
      setErrorMessage("Unable to delete this confession right now.");
    }
  }

  function handleFeedFilterSelect(filter: FeedFilter) {
    if (isPremiumFeedFilter(filter) && !isPremiumPreviewEnabled) {
      return;
    }

    setFeedFilters((current) => ({
      ...current,
      filter
    }));
    setVisibleCount(PAGE_SIZE);
  }

  function handleMoodFilterSelect(mood: Mood | "all") {
    setFeedFilters((current) => ({
      ...current,
      filter: "mood",
      mood
    }));
    setVisibleCount(PAGE_SIZE);
  }

  function handlePremiumPreviewToggle() {
    setIsPremiumPreviewEnabled((current) => {
      const next = !current;

      if (!next) {
        setFeedFilters(createDefaultFeedFilters());
      }

      return next;
    });
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">anonymous daily confession app</p>
          <h1>Say it without <em>becoming</em> it.</h1>
        </div>
        <p>
          // generate a ghost id. write one honest note. read what strangers carry.
          // no profiles. no replies. no social score. just words in the dark.
        </p>
        <div className="hero-grid">
          <article className="metric">
            <span>// confessions</span>
            <strong>{hasMoreFeed ? `${filteredFeed.length}+` : filteredFeed.length}</strong>
          </article>
          <article className="metric">
            <span>// mine</span>
            <strong>{mine.length}</strong>
          </article>
          <article className="metric">
            <span>// ghost id</span>
            <strong>{userId ? `${userId.slice(0, 8)}` : "···"}</strong>
          </article>
        </div>
        {shareMessage ? <div className="share-banner">{shareMessage}</div> : null}
      </section>

      <nav className="tabs" aria-label="Primary views">
        {[
          { label: "Feed", value: "feed" },
          { label: "Write", value: "write" },
          { label: "My confessions", value: "mine" }
        ].map((tab) => (
          <button
            key={tab.value}
            className={`tab ${currentView === tab.value ? "active" : ""}`}
            onClick={() => setCurrentView(tab.value as View)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {currentView === "feed" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>// confessions</h2>
              <p>anonymous. infinite. stripped to text and mood only.</p>
            </div>
            <button className="ghost" onClick={() => setCurrentView("write")} type="button">
              Write now
            </button>
          </div>

          <div className="filter-panel">
            <div>
              <p className="filter-eyebrow">premium filters</p>
              <h3>Shape the public feed</h3>
              <p className="filter-copy">
                Refine the public feed by mood or reading length. Private confessions stay hidden
                even when premium filters are enabled.
              </p>
            </div>
            <button className="ghost small" onClick={handlePremiumPreviewToggle} type="button">
              {isPremiumPreviewEnabled ? "Lock preview" : "Unlock premium preview"}
            </button>
          </div>

          <div className="filter-chip-row" aria-label="Feed filters">
            {FEED_FILTER_OPTIONS.map((filter) => {
              const isPremium = isPremiumFeedFilter(filter);
              const isDisabled = isPremium && !isPremiumPreviewEnabled;

              return (
                <button
                  key={filter}
                  aria-pressed={feedFilters.filter === filter}
                  className={`filter-chip ${feedFilters.filter === filter ? "active" : ""}`}
                  disabled={isDisabled}
                  onClick={() => handleFeedFilterSelect(filter)}
                  type="button"
                >
                  {getFeedFilterLabel(filter)}
                  {isPremium ? " Premium" : ""}
                </button>
              );
            })}
          </div>

          {feedFilters.filter === "mood" && isPremiumPreviewEnabled ? (
            <div className="filter-chip-row" aria-label="Mood filters">
              <button
                aria-pressed={feedFilters.mood === "all"}
                className={`filter-chip ${feedFilters.mood === "all" ? "active" : ""}`}
                onClick={() => handleMoodFilterSelect("all")}
                type="button"
              >
                All moods
              </button>
              {MOODS.map((mood) => (
                <button
                  key={mood}
                  aria-pressed={feedFilters.mood === mood}
                  className={`filter-chip ${feedFilters.mood === mood ? "active" : ""}`}
                  onClick={() => handleMoodFilterSelect(mood)}
                  type="button"
                >
                  {MOOD_EMOJI[mood] ?? ""} {mood}
                </button>
              ))}
            </div>
          ) : null}

          <p className="filter-note">
            {isPremiumPreviewEnabled
              ? `Preview unlocked. Currently showing ${getFeedFilterLabel(feedFilters.filter).toLowerCase()}.`
              : "Premium filters stay locked until you unlock the local preview on this device."}
          </p>

          <div className="feed">
            {visibleFeed.map((confession) => (
              <article className="card" data-mood={confession.mood ?? undefined} key={confession.id}>
                <div className="card-meta">
                  <span className="card-date">{formatConfessionDate(confession.createdAt)}</span>
                  {confession.mood ? (
                    <span className="pill" data-mood={confession.mood}>
                      {MOOD_EMOJI[confession.mood] ?? ""} {confession.mood}
                    </span>
                  ) : null}
                </div>
                <p>{confession.text}</p>
                <div className="card-actions">
                  <button className="ghost small" onClick={() => void handleShare(confession)} type="button">
                    Share
                  </button>
                  <button className="ghost small" onClick={() => handleDownloadCard(confession)} type="button">
                    Download card
                  </button>
                </div>
              </article>
            ))}

            {!visibleFeed.length ? (
              <div className="empty">
                {filteredFeed.length === 0 && feed.length > 0
                  ? "No public confessions match this filter yet."
                  : "No confessions yet. Be the first one to write today."}
              </div>
            ) : null}

            <div aria-hidden className="sentinel" ref={sentinelRef} />
            {isLoadingFeedPage ? <div className="loading-row">// loading more...</div> : null}
          </div>
        </section>
      ) : null}

      {currentView === "write" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>// write</h2>
              <p>up to {MAX_CONFESSION_LENGTH} chars. nothing attached except your ghost id.</p>
            </div>
          </div>

          <form className="composer" onSubmit={onSubmit}>
            <textarea
              maxLength={MAX_CONFESSION_LENGTH}
              onChange={(event) => setText(event.target.value)}
              placeholder="// say the thing you’d never post under your real name."
              value={text}
            />

            <select
              onChange={(event) => setSelectedMood(event.target.value as Mood | "")}
              value={selectedMood}
            >
              <option value="">No mood tag</option>
              {MOODS.map((mood) => (
                <option key={mood} value={mood}>
                  {mood}
                </option>
              ))}
            </select>

            <label className="toggle-row">
              <input
                checked={isPrivate}
                onChange={(event) => setIsPrivate(event.target.checked)}
                type="checkbox"
              />
              <span>Save as private confession</span>
            </label>
            <p className="helper">
              Private confessions stay out of the public feed and only appear in My Confessions.
            </p>

            <div className="composer-footer">
              <div>
                <p className="helper">{text.trim().length}/{MAX_CONFESSION_LENGTH} characters</p>
                {statusMessage ? <p className="status">{statusMessage}</p> : null}
                {errorMessage ? <p className="error">{errorMessage}</p> : null}
              </div>

              <div>
                <button className="ghost" onClick={() => setCurrentView("feed")} type="button">
                  Cancel
                </button>
                <span style={{ display: "inline-block", width: 12 }} />
                <button className="primary" disabled={isPending} type="submit">
                  {isPending ? "Posting..." : "Post confession"}
                </button>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      {currentView === "mine" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>// mine</h2>
              <p>everything written under this ghost id, newest first.</p>
              {!canDelete ? <p>Delete stays disabled in live mode until trusted identity exists.</p> : null}
            </div>
            <button className="ghost" onClick={() => setCurrentView("write")} type="button">
              Write another
            </button>
          </div>

          <div className="feed">
            {mine.map((confession) => (
              <article className="card" data-mood={confession.mood ?? undefined} key={confession.id}>
                <div className="card-meta">
                  <span className="card-date">{formatConfessionDate(confession.createdAt)}</span>
                  <div className="card-badges">
                    {confession.isPrivate ? <span className="pill private">🔒 private</span> : null}
                    {confession.mood ? (
                      <span className="pill" data-mood={confession.mood}>
                        {MOOD_EMOJI[confession.mood] ?? ""} {confession.mood}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p>{confession.text}</p>
                <div className="card-actions">
                  <button className="ghost small" onClick={() => void handleShare(confession)} type="button">
                    Share
                  </button>
                  <button className="ghost small" onClick={() => handleDownloadCard(confession)} type="button">
                    Download card
                  </button>
                  <button className="danger small" onClick={() => void handleDelete(confession)} type="button">
                    Delete
                  </button>
                </div>
              </article>
            ))}

            {!mine.length ? (
              <div className="empty">You have not posted yet. Write once and it will appear here.</div>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}