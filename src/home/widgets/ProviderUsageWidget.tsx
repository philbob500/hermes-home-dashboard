import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchJSON } from "../../sdk";
import { HoverCtl } from "./HoverArrows";
import {
  displayPercent,
  formatMoney,
  progressPercent,
  timeToReset,
  windowTitle,
} from "./subscription-usage-display";

/** Poll cadence while the tile is actually on screen. A hidden window or a
 *  tile scrolled out of view costs nothing. */
const POLL_MS = 2 * 60 * 1000;
const CLOCK_MS = 60 * 1000;

/** Providers with quota windows. Order is the order on the tile. */
const QUOTA_PROVIDERS: { id: "openai-codex" | "anthropic"; name: string }[] = [
  { id: "openai-codex", name: "codex" },
  { id: "anthropic", name: "claude" },
];

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

interface BalanceResponse {
  provider: string;
  available: boolean;
  fetched_at: string | null;
  peak: boolean;
  currency?: string;
  total?: number;
  topped_up?: number;
  granted?: number;
  reason?: string;
}

/** One tile for every limit that matters: subscription windows per provider,
 *  plus prepaid credit for the providers that have no quota at all. */
export function ProviderUsageWidget() {
  const [usage, setUsage] = useState<Record<string, SubscriptionUsageResponse | null>>({});
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [balanceFailed, setBalanceFailed] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
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
    const quota = await Promise.all(
      QUOTA_PROVIDERS.map(async ({ id }) => {
        try {
          const result = await fetchJSON<SubscriptionUsageResponse>(
            `/api/plugins/home-dashboard/subscription-usage/${encodeURIComponent(id)}`,
          );
          return [id, result] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    );
    let credit: BalanceResponse | null = null;
    let creditFailed = false;
    try {
      credit = await fetchJSON<BalanceResponse>("/api/plugins/home-dashboard/balance/deepseek");
    } catch {
      credit = null;
      creditFailed = true;
    }

    setUsage(Object.fromEntries(quota));
    setBalance(credit);
    setBalanceFailed(creditFailed);
    setFailed(quota.every(([, value]) => value === null) && credit === null);
    setLoadedOnce(true);
    setBusy(false);
  }, []);

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
        title="Kontingente aktualisieren"
        aria-label="Kontingente aktualisieren"
      >
        {busy ? "…" : "↻"}
      </button>
    </HoverCtl>
  );

  if (!loadedOnce) {
    return (
      <div className="usage" ref={setRoot}>
        {refresh}
        <span className="dim">Lade Kontingente…</span>
      </div>
    );
  }

  const rows: ReactNode[] = [];
  for (const { id, name } of QUOTA_PROVIDERS) {
    const data = usage[id];
    if (!data?.available || !data.windows.length) {
      rows.push(
        <div className="usage-row" key={`${id}-empty`}>
          <span className="usage-name">{name}</span>
          <span className="dim">keine Daten</span>
        </div>,
      );
      continue;
    }
    data.windows.forEach((window, index) => {
      const percent = progressPercent(window.used_percent);
      const title = windowTitle(id, window.label);
      const reset = timeToReset(window.reset_at, now);
      const fillClass = percent !== null && percent >= 95
        ? "fill usage-critical"
        : percent !== null && percent >= 75
          ? "fill usage-warning"
          : "fill";
      rows.push(
        <div className="usage-row" key={`${id}-${window.label}-${index}`}>
          <span className="usage-name">{`${name} ${title}`}</span>
          <div
            className="usage-track"
            role="progressbar"
            aria-label={`${name} ${title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-valuetext={displayPercent(percent)}
          >
            {percent !== null && <div className={fillClass} style={{ width: `${percent}%` }} />}
          </div>
          <span className="usage-value">
            <span className="usage-pct">{displayPercent(percent)}</span>
            <span className="usage-reset dim" title={window.reset_at ?? ""}>
              {reset ? `· ${reset}` : "—"}
            </span>
          </span>
        </div>,
      );
    });
  }

  // The credit row stays visible when the read fails, so a missing route or a
  // rejected key is not silently mistaken for "this provider is fine".
  if (balance || balanceFailed) {
    const amount = balance ? formatMoney(balance.total, balance.currency) : null;
    rows.push(
      <div className="usage-row" key="deepseek">
        <span className="usage-name">DeepSeek</span>
        <div className="usage-track usage-track-plain" />
        <span className="usage-value">
          <span className="usage-pct ok">{amount ?? "—"}</span>
          <span className="usage-reset dim">
            {!balance ? "n/a" : balance.peak ? "· Peak" : "· Off-Peak"}
          </span>
        </span>
      </div>,
    );
  }

  // One "Stand" line for the whole tile: the newest of the three reads.
  const stamps = [
    usage["openai-codex"]?.fetched_at,
    usage["anthropic"]?.fetched_at,
    balance?.fetched_at,
  ]
    .filter((stamp): stamp is string => typeof stamp === "string")
    .map((stamp) => Date.parse(stamp))
    .filter((value) => Number.isFinite(value));
  const newestStamp = stamps.length ? Math.max(...stamps) : null;

  return (
    <div className="usage" ref={setRoot}>
      {refresh}
      {rows}
      {failed && <span className="werr">Kontingente nicht erreichbar</span>}
      <div className="hover-reveal">
        <div className="tok-stats">
          {balance?.topped_up !== undefined && balance.topped_up !== null && (
            <span>
              <span className="dim">aufgeladen</span> {formatMoney(balance.topped_up, balance.currency)}
            </span>
          )}
          {balance?.granted ? (
            <span>
              <span className="dim">guthaben</span> {formatMoney(balance.granted, balance.currency)}
            </span>
          ) : null}
          {newestStamp && (
            <span>
              <span className="dim">Stand</span>{" "}
              {new Date(newestStamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <span>
            <span className="dim">DeepSeek Peak</span> Mo–Fr 01:00–04:00, 06:00–10:00 UTC
          </span>
        </div>
      </div>
    </div>
  );
}
