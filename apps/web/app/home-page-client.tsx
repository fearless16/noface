"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  buildConfessionShareCardSvg,
  buildConfessionShareFileName,
  buildConfessionShareText,
  type Confession,
  formatConfessionDate,
  type Mood,
  MAX_CONFESSION_LENGTH,
  MOODS,
  validateConfession
} from "@noface/shared";
import {
  canDeleteMyConfessions,
  deleteMyConfession,
  isSupabaseConfigured,
  loadFeed,
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

export default function HomePageClient({
  initialFeed,
  hasServerSupabase
}: HomePageClientProps) {
  const [currentView, setCurrentView] = useState<View>("feed");
  const [userId, setUserId] = useState<string>("");
  const [feed, setFeed] = useState<Confession[]>(initialFeed);
  const [mine, setMine] = useState<Confession[]>([]);
  const [text, setText] = useState("");
  const [selectedMood, setSelectedMood] = useState<Mood | "">("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const isDemoMode = useMemo(() => !hasServerSupabase && !isSupabaseConfigured(), [hasServerSupabase]);
  const canDelete = useMemo(() => canDeleteMyConfessions(), []);
  const visibleFeed = feed.slice(0, visibleCount);

  useEffect(() => {
    let isActive = true;

    async function bootstrap() {
      const anonymousUserId = await resolveAnonymousUserId();

      if (!isActive) {
        return;
      }

      setUserId(anonymousUserId);

      const [nextFeed, nextMine] = await Promise.all([
        loadFeed(),
        loadMyConfessions(anonymousUserId)
      ]);

      if (!isActive) {
        return;
      }

      setFeed(nextFeed);
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
  }, []);

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
          if (current >= feed.length) {
            return current;
          }

          return Math.min(current + PAGE_SIZE, feed.length);
        });
      },
      { rootMargin: "0px 0px 240px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [currentView, feed.length]);

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
        mood: selectedMood || null
      });

      setFeed((current) => [created, ...current]);
      setMine((current) => [created, ...current]);
      setVisibleCount((current) => Math.max(PAGE_SIZE, current));
      setText("");
      setSelectedMood("");
      setStatusMessage("Confession posted.");
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

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">anonymous daily confession app</p>
          <h1>Say it without becoming it.</h1>
        </div>
        <p>
          Noface keeps the loop simple: generate a local anonymous id, write one honest note,
          and read what strangers are carrying today. No profiles, no replies, no social score.
        </p>
        <div className="hero-grid">
          <article className="metric">
            <span>Mode</span>
            <strong>{isDemoMode ? "Demo" : "Supabase"}</strong>
          </article>
          <article className="metric">
            <span>Feed items</span>
            <strong>{feed.length}</strong>
          </article>
          <article className="metric">
            <span>My confessions</span>
            <strong>{mine.length}</strong>
          </article>
          <article className="metric">
            <span>User id</span>
            <strong>{userId ? `${userId.slice(0, 8)}...` : "loading"}</strong>
          </article>
        </div>
        <div className="mode-banner">
          {isDemoMode
            ? "Running in local demo mode until Supabase credentials are added."
            : "Live mode connected to Supabase."}
        </div>
        {shareMessage ? <div className="mode-banner">{shareMessage}</div> : null}
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
              <h2>Today&apos;s confessions</h2>
              <p>Infinite scroll, stripped back to text and mood only.</p>
            </div>
            <button className="ghost" onClick={() => setCurrentView("write")} type="button">
              Write now
            </button>
          </div>

          <div className="feed">
            {visibleFeed.map((confession) => (
              <article className="card" key={confession.id}>
                <div className="card-meta">
                  <span>
                    {formatConfessionDate(confession.createdAt)}
                  </span>
                  {confession.mood ? <span className="pill">{confession.mood}</span> : null}
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
              <div className="empty">No confessions yet. Be the first one to write today.</div>
            ) : null}

            <div aria-hidden className="sentinel" ref={sentinelRef} />
          </div>
        </section>
      ) : null}

      {currentView === "write" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Write anonymously</h2>
              <p>Up to {MAX_CONFESSION_LENGTH} characters. Nothing attached except your local id.</p>
            </div>
          </div>

          <form className="composer" onSubmit={onSubmit}>
            <textarea
              maxLength={MAX_CONFESSION_LENGTH}
              onChange={(event) => setText(event.target.value)}
              placeholder="Say the thing you would never post under your real name."
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
              <h2>My confessions</h2>
              <p>Everything written by this local anonymous id, newest first.</p>
              {!canDelete ? <p>Delete stays disabled in live mode until trusted identity exists.</p> : null}
            </div>
            <button className="ghost" onClick={() => setCurrentView("write")} type="button">
              Write another
            </button>
          </div>

          <div className="feed">
            {mine.map((confession) => (
              <article className="card" key={confession.id}>
                <div className="card-meta">
                  <span>{formatConfessionDate(confession.createdAt)}</span>
                  {confession.mood ? <span className="pill">{confession.mood}</span> : null}
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