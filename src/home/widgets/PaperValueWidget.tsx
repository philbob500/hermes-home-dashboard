import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJSON } from "../../sdk";
import { HoverCtl } from "./HoverArrows";
import { selectRangePoints } from "./paper-value-range";

const POLL_MS = 5 * 60 * 1000;
let paperGradSeq = 0;
const RANGES = [
  { key: "day", label: "24h", duration: 24 * 60 * 60 * 1000 },
  { key: "week", label: "7d", duration: 7 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "all", duration: 0 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

interface ValuePoint {
  at: string;
  total_eur: number;
  source: string | null;
}
interface ValueResponse {
  available: boolean;
  start_eur: number | null;
  current: { total_eur: number; as_of: string; source: string | null } | null;
  series: ValuePoint[];
}

const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const stamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Zeit unbekannt" : date.toLocaleString("de-DE", {
    timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
};
const sourceLabel = (value: string | null) => ({
  runner: "Runner-Bewertung",
  paper_fill_bid: "Paper-Fill-Bid",
  paper_cli_balance_plus_runner_bid: "CLI-Balance + Runner-Bid",
}[value ?? ""] ?? value ?? "Quelle unbekannt");

/** Read-only paper portfolio history; polling pauses when the tile or window is hidden. */
export function PaperValueWidget() {
  const [data, setData] = useState<ValueResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rangeKey, setRangeKey] = useState<RangeKey>("all");
  const [tip, setTip] = useState<{ point: ValuePoint; frac: number } | null>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [gid] = useState(() => `paper-value-fill-${paperGradSeq++}`);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const lastGood = useRef<ValueResponse | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const result = await fetchJSON<ValueResponse>("/api/plugins/home-dashboard/trading-value");
      setData(result);
      lastGood.current = result;
      setFailed(false);
    } catch {
      setData(lastGood.current);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!onScreen || !pageVisible) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [onScreen, pageVisible, refresh]);

  const rangeIndex = RANGES.findIndex((range) => range.key === rangeKey);
  const chosenRange = RANGES[rangeIndex];
  const points = useMemo(
    () => selectRangePoints(data?.series ?? [], chosenRange?.duration ?? 0),
    [data, chosenRange],
  );

  const current = data?.current;
  const start = data?.start_eur;
  const change = current && start !== null && start !== undefined ? current.total_eur - start : null;
  const changePct = change !== null && start ? (change / start) * 100 : null;
  const low = Math.min(...points.map((point) => point.total_eur));
  const high = Math.max(...points.map((point) => point.total_eur));
  const span = high - low;
  const firstAt = points.length ? Date.parse(points[0].at) : 0;
  const lastAt = points.length ? Date.parse(points[points.length - 1].at) : 0;
  const timeSpan = lastAt - firstAt;
  const coords = points.map((point) => {
    const x = timeSpan <= 0 ? 50 : ((Date.parse(point.at) - firstAt) / timeSpan) * 100;
    const y = span === 0 ? 50 : 94 - ((point.total_eur - low) / span) * 88;
    return [x, y] as const;
  });
  const linePath = coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaPath = linePath && coords.length > 1
    ? `${linePath} L${coords[coords.length - 1][0].toFixed(2)},100 L${coords[0][0].toFixed(2)},100 Z`
    : "";
  const currentRangeIndex = RANGES.findIndex((range) => range.key === rangeKey);
  const stepRange = (direction: 1 | -1) => {
    setRangeKey(RANGES[(currentRangeIndex + direction + RANGES.length) % RANGES.length].key);
    setTip(null);
  };

  return (
    <div className="paper-value" ref={setRoot} onMouseLeave={() => setTip(null)}>
      <HoverCtl className="paper-value-ctl">
        <button className="hv-arrow" aria-label="vorheriger Zeitraum" onClick={() => stepRange(-1)}>‹</button>
        <span className="hv-label">{chosenRange.label}</span>
        <button className="hv-arrow" aria-label="nächster Zeitraum" onClick={() => stepRange(1)}>›</button>
        <button className="hv-opt" aria-label="Wertverlauf aktualisieren" title="Aktualisieren" onClick={() => void refresh()}>
          {busy ? "…" : "↻"}
        </button>
      </HoverCtl>
      {current ? (
        <>
          <div className="paper-value-headline">
            <strong>{money.format(current.total_eur)}</strong>
            {change !== null && changePct !== null && (
              <span className={change >= 0 ? "ok" : "warn"}>
                vs Start {change >= 0 ? "+" : ""}{money.format(change)} · {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
              </span>
            )}
          </div>
          <div className="paper-value-meta">
            <span>{sourceLabel(current.source)} · Stand {stamp(current.as_of)}</span>
            {failed && <span className="warn">stale</span>}
          </div>
          <div className="paper-value-chart">
            {tip && (
              <div className="paper-value-tip" style={{ left: `${tip.frac * 100}%` }}>
                <b>{stamp(tip.point.at)}</b> · {money.format(tip.point.total_eur)}
                <span> · {sourceLabel(tip.point.source)}</span>
              </div>
            )}
            {areaPath && <svg className="home-area" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: "var(--home-accent)", stopOpacity: 0.45 }} />
                  <stop offset="100%" style={{ stopColor: "var(--home-accent)", stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <path d={areaPath} fill={`url(#${gid})`} />
              <path d={linePath} fill="none" stroke="var(--home-accent)" strokeWidth={1.5}
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {coords.map(([x], index) => {
                const left = index === 0 ? 0 : (coords[index - 1][0] + x) / 2;
                const right = index === points.length - 1 ? 100 : (x + coords[index + 1][0]) / 2;
                return (
                  <rect key={`${points[index].at}-${index}`} x={left} y="0" width={Math.max(0.5, right - left)}
                    height="100" fill="transparent"
                    onMouseEnter={() => setTip({ point: points[index], frac: x / 100 })} />
                );
              })}
              {coords.length === 1 && <circle cx={coords[0][0]} cy={coords[0][1]} r="2.5"
                fill="var(--home-accent)" vectorEffect="non-scaling-stroke" />}
            </svg>}
            {points.length === 0 && <span className="dim">Keine belegten Werte im Zeitraum.</span>}
            {points.length === 1 && <span className="dim">Ein Wert im Zeitraum; für den Verlauf braucht es zwei.</span>}
          </div>
          <div className="paper-value-foot">
            <span>{points.length} belegte Werte</span>
            <span>{points.length ? stamp(points[0].at) : "—"} → {points.length ? stamp(points[points.length - 1].at) : "—"}</span>
          </div>
        </>
      ) : (
        <span className="dim">{failed ? "Trading-Dashboard lokal/Tailnet nicht erreichbar" : "Noch keine belegte Paper-Bewertung"}</span>
      )}
    </div>
  );
}
