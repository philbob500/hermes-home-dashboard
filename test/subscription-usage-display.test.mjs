import assert from "node:assert/strict";
import test from "node:test";

import {
  displayPercent,
  formatMoney,
  progressPercent,
  timeToReset,
  windowTitle,
} from "../src/home/widgets/subscription-usage-display.ts";

test("subscription percentages are clamped and missing values stay explicit", () => {
  assert.equal(displayPercent(11.2), "11%");
  assert.equal(displayPercent(null), "—");
  assert.equal(displayPercent(Number.NaN), "—");
  assert.equal(progressPercent(-2), 0);
  assert.equal(progressPercent(125), 100);
  assert.equal(progressPercent(null), null);
});

test("Codex and Claude windows share concise dashboard labels", () => {
  assert.equal(windowTitle("openai-codex", "Weekly"), "Woche");
  assert.equal(windowTitle("anthropic", "Current session"), "Session");
  assert.equal(windowTitle("anthropic", "Current week"), "Woche");
  assert.equal(windowTitle("anthropic", "Opus week"), "Opus-Woche");
});

test("reset time is shown as a compact countdown", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");
  assert.equal(timeToReset("2026-09-29T14:15:00Z", now), "in 2h 15m");
  assert.equal(timeToReset("2026-09-29T12:00:00Z", now), "jetzt");
  assert.equal(timeToReset(null, now), null);
});

test("prepaid credit keeps its currency and never invents an amount", () => {
  assert.equal(formatMoney(2.8, "USD"), "$2.80");
  assert.equal(formatMoney(12, "CNY"), "¥12.00");
  assert.equal(formatMoney(4.5, "chf"), "4.50 CHF");
  assert.equal(formatMoney(null, "USD"), null);
  assert.equal(formatMoney(Number.NaN, "USD"), null);
});
