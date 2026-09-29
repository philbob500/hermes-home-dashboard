import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJSON } from "../../sdk";
import { HoverCtl } from "./HoverArrows";
import {
  displayPercent,
  progressPercent,
  timeToReset,
  windowTitle,
} from "./subscription-usage-display";

/** Poll cadence while the tile is actually on screen. A hidden window or a
 *  tile scrolled out of view costs nothing. */
const POLL_MS = 2 * 60 * 1000;
const CLOCK_MS = 60 * 1000;

export interface SubscriptionUsageWindow {
  label: string;
  used_percent: number | null;
  reset_at: string | null;
}

interface SubscriptionUsageResponse {
  provider: string;
  available: boolean;
  fetched_at: string | null;
  windows: SubscriptionUsageWindow[];
}

interface Props {
  provider: "openai-codex" | "anthropic";
}

/** Shared renderer for independent provider quota tiles. */
export function ProviderUsageWidget({ provider }: Props) {
  const [usage, setUsage] = useState<SubscriptionUsageResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await fetchJSON<SubscriptionUsageResponse>(
        `/api/plugins/home-dashboard/subscription-usage/${encodeURIComponent(provider)}`,
      );
      setUsage(result);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [provider]);

  // First paint always needs data, even for a tile that starts below the fold.
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      setOnScreen(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(clock);
  }, []);

  // Refresh automatically only while the tile is visible; coming back into
  // view or into the window refreshes at once instead of waiting for the tick.
  const live = onScreen && pageVisible;
  const wasLive = useRef(live);
  useEffect(() => {
    if (!live) {
      wasLive.current = false;
      return;
    }
    const returning = !wasLive.current;
    wasLive.current = true;
    if (returning) void load();
    const poll = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(poll);
  }, [live, load]);

  const refresh = (
    <HoverCtl>
      <button
        className="hv-opt"
        disabled={busy}
        onClick={() => void load()}
        title="Kontingent aktualisieren"
        aria-label="Kontingent aktualisieren"
      >
        {busy ? "…" : "↻"}
      </button>
    </HoverCtl>
  );

  if (!usage) {
    return (
      <div className="usage" ref={setRoot}>
        {refresh}
        <span className="dim">
          {failed ? "Kontingent nicht erreichbar" : "Lade Kontingent…"}
        </span>
      </div>
    );
  }

  if (!usage.available || !usage.windows.length) {
    return (
      <div className="usage" ref={setRoot}>
        {refresh}
        <span className="dim">Keine Kontingentdaten verfügbar</span>
      </div>
    );
  }

  return (
    <div className="usage" ref={setRoot}>
      {refresh}
      {/* Shared meter rows: `.meters` puts them side by side once the tile is
        * wide enough, so the bars use the width instead of a fixed slot. */}
      <div className="meters">
        {usage.windows.map((window, index) => {
          const percent = progressPercent(window.used_percent);
          const title = windowTitle(provider, window.label);
          const fillClass = percent !== null && percent >= 95
            ? "fill usage-critical"
            : percent !== null && percent >= 75
              ? "fill usage-warning"
              : "fill";
          return (
            <div className="meter" key={`${window.label}:${window.reset_at ?? "none"}:${index}`}>
              <span className="lbl">{title}</span>
              <div
                className="track"
                role="progressbar"
                aria-label={title}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent ?? undefined}
                aria-valuetext={displayPercent(percent)}
              >
                {percent !== null && (
                  <div className={fillClass} style={{ width: `${percent}%` }} />
                )}
              </div>
              <span className="val">{displayPercent(percent)}</span>
            </div>
          );
        })}
      </div>
      {/* Shared totals line (Tokens footer): one compact row for the reset
        * countdowns instead of a second right-aligned block per window. */}
      <div className="tok-stats">
        {usage.windows.map((window, index) => {
          const reset = timeToReset(window.reset_at, now);
          return (
            <span key={`${window.label}:${index}`}>
              <span className="dim">{windowTitle(provider, window.label)}</span>{" "}
              {reset ? `Reset ${reset}` : "Reset unbekannt"}
            </span>
          );
        })}
        {failed && <span className="werr">Aktualisierung fehlgeschlagen</span>}
      </div>
      {usage.fetched_at && (
        <div className="hover-reveal">
          <div className="tok-stats">
            <span>
              <span className="dim">Stand</span>{" "}
              {new Date(usage.fetched_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
