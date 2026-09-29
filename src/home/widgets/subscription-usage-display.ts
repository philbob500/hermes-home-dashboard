export function progressPercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

export function displayPercent(value: number | null | undefined): string {
  const progress = progressPercent(value);
  return progress === null ? "—" : `${Math.round(progress)}%`;
}

const CURRENCY_SIGNS: Record<string, string> = { USD: "$", CNY: "¥", EUR: "€" };

/** Prepaid credit as a compact amount: `$2.80`, `¥1,20`, `12.00 CHF`. */
export function formatMoney(amount: number | null | undefined, currency: string | undefined): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  const code = (currency || "USD").trim().toUpperCase() || "USD";
  const sign = CURRENCY_SIGNS[code];
  return sign ? `${sign}${amount.toFixed(2)}` : `${amount.toFixed(2)} ${code}`;
}

const WINDOW_TITLES: Record<string, Record<string, string>> = {
  "openai-codex": { weekly: "Woche" },
  anthropic: {
    "current session": "Session",
    "current week": "Woche",
    "opus week": "Opus-Woche",
    "sonnet week": "Sonnet-Woche",
  },
};

export function windowTitle(provider: string, label: string): string {
  return WINDOW_TITLES[provider]?.[label.trim().toLowerCase()] ?? label;
}

export function timeToReset(resetAt: string | null | undefined, nowMs = Date.now()): string | null {
  if (!resetAt) return null;
  const timestamp = Date.parse(resetAt);
  if (!Number.isFinite(timestamp)) return null;
  const minutes = Math.ceil((timestamp - nowMs) / 60_000);
  if (minutes <= 0) return "jetzt";
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainder = minutes % 60;
  if (days) return `in ${days}d ${hours}h`;
  if (hours) return `in ${hours}h ${remainder}m`;
  return `in ${remainder}m`;
}
