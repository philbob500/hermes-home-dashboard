import { useEffect, useState } from "react";
import { fetchJSON } from "../../sdk";
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
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await fetchJSON<SubscriptionUsageResponse>(
          `/api/plugins/home-dashboard/subscription-usage/${encodeURIComponent(provider)}`,
        );
        if (active) {
          setUsage(result);
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      }
    };
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [provider]);

  if (!usage && failed) return <span className="dim">Kontingent nicht erreichbar</span>;
  if (!usage) return <span className="dim">Lade Kontingent…</span>;
  if (!usage.available || !usage.windows.length) {
    return <span className="dim">Keine Kontingentdaten verfügbar</span>;
  }

  return (
    <div className="quota-usage">
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
