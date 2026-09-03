"use client";

import { useCallback, useEffect, useState } from "react";

type FeedState =
  | { status: "loading" }
  | { status: "ready"; feedUrl: string }
  | { status: "error" };

/**
 * Shows the signed-in user's iCal feed URL with copy, subscribe, and
 * rotate actions. Rendered on the rider profile and the coach calendar —
 * the same feed covers both roles (sessions you ride plus sessions you
 * coach).
 */
export default function CalendarSubscribe() {
  const [state, setState] = useState<FeedState>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/calendar")
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        return (await response.json()) as { feedUrl: string };
      })
      .then(({ feedUrl }) => {
        if (!cancelled) setState({ status: "ready", feedUrl });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = useCallback(async (feedUrl: string) => {
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const rotate = useCallback(async () => {
    setRotating(true);
    try {
      const response = await fetch("/api/me/calendar", { method: "POST" });
      if (!response.ok) throw new Error("failed");
      const { feedUrl } = (await response.json()) as { feedUrl: string };
      setState({ status: "ready", feedUrl });
    } catch {
      setState({ status: "error" });
    } finally {
      setRotating(false);
    }
  }, []);

  return (
    <section className="mt-10 border-t border-[#e3e3e3] pt-8">
      <h2 className="text-xl font-semibold">Subscribe to your calendar</h2>
      <p className="mt-2 max-w-xl text-sm text-[#56585e]">
        Add your sessions to Google or Apple Calendar. The feed updates
        automatically when the schedule changes and includes a reminder 30
        minutes before each session.
      </p>

      {state.status === "loading" && (
        <p className="mt-4 text-sm text-[#56585e]">Loading your feed…</p>
      )}
      {state.status === "error" && (
        <p className="mt-4 text-sm text-[#a33]">
          Could not load your calendar feed. Try refreshing the page.
        </p>
      )}
      {state.status === "ready" && (
        <div className="mt-4">
          <div className="flex max-w-xl flex-wrap items-center gap-2">
            <input
              readOnly
              value={state.feedUrl}
              onFocus={(event) => event.target.select()}
              aria-label="Your calendar feed URL"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#c9c9c9] bg-[#f7f7f7] px-3 text-sm text-[#56585e]"
            />
            <button
              type="button"
              onClick={() => copy(state.feedUrl)}
              className="min-h-11 rounded-[50px] border border-[#c9c9c9] px-5 text-sm font-semibold text-[#56585e] transition-colors hover:border-[#1a1a1a] hover:text-[#1a1a1a]"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <a
              href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(
                state.feedUrl.replace(/^https?:/, "webcal:"),
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white transition-colors hover:bg-black"
            >
              Add to Google Calendar
            </a>
            <button
              type="button"
              onClick={rotate}
              disabled={rotating}
              className="min-h-11 rounded-[50px] border border-[#c9c9c9] px-6 text-sm font-semibold text-[#56585e] transition-colors hover:border-[#1a1a1a] hover:text-[#1a1a1a] disabled:opacity-50"
            >
              {rotating ? "Regenerating…" : "Regenerate link"}
            </button>
          </div>
          <p className="mt-3 max-w-xl text-xs text-[#56585e]">
            Anyone with this link can see your schedule. Regenerate it to
            stop sharing — the old link stops working immediately.
          </p>
        </div>
      )}
    </section>
  );
}
