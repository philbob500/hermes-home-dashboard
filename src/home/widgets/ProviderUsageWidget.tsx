import { useCallback, useEffect, useState } from "react";
import { fetchJSON } from "../../sdk";
import { HoverCtl } from "./HoverArrows";
import {
  displayPercent,
  progressPercent,
  timeToReset,
  windowTitle,
} from "./subscription-usage-display";

const POLL_MS = 5 * 60 * 1000;
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

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

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
      <div className="quota-usage">
        {refresh}
        <span className="dim">
          {failed ? "Kontingent nicht erreichbar" : "Lade Kontingent…"}
        </span>
      </div>
    );
  }

  if (!usage.available || !usage.windows.length) {
    return (
      <div className="quota-usage">
        {refresh}
        <span className="dim">Keine Kontingentdaten verfügbar</span>
      </div>
    );
  }

  return (
    <div className="quota-usage">
      {refresh}
      {usage.windows.map((window) => {
        const percent = progressPercent(window.used_percent);
        const title = windowTitle(provider, window.label);
        const reset = timeToReset(window.reset_at, now);
        const fillClass = percent !== null && percent >= 95
          ? "fill quota-critical"
          : percent !== null && percent >= 75
            ? "fill quota-warning"
            : "fill";
        return (
          <div className="quota-window" key={`${window.label}:${window.reset_at ?? "none"}`}>
            <div className="meter quota-meter">
              <span className="lbl">{title}</span>
              <div
                className="track"
                role="progressbar"
                aria-label={`${title} genutzt`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent ?? undefined}
                aria-valuetext={`${displayPercent(percent)} genutzt`}
              >
                {percent !== null && (
                  <div className={fillClass} style={{ width: `${percent}%` }} />
                )}
              </div>
              <span className="val">{displayPercent(percent)} genutzt</span>
            </div>
            <div className="quota-reset dim">
              {reset ? `Reset ${reset}` : "Resetzeit unbekannt"}
            </div>
          </div>
        );
      })}
      {failed && <div className="quota-reset werr">Aktualisierung fehlgeschlagen</div>}
      {usage.fetched_at && (
        <div className="quota-updated dim">
          Stand {new Date(usage.fetched_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}
