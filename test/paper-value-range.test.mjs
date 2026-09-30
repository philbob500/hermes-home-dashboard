import assert from "node:assert/strict";
import test from "node:test";

import { selectRangePoints } from "../src/home/widgets/paper-value-range.ts";

const points = [
  { at: "2026-09-20T12:00:00Z", total_eur: 1 },
  { at: "2026-09-30T11:30:00Z", total_eur: 2 },
];

test("range selection keeps a single point inside the chosen window", () => {
  assert.deepEqual(selectRangePoints(points, 24 * 60 * 60 * 1000), [points[1]]);
});

test("zero duration selects all history", () => {
  assert.deepEqual(selectRangePoints(points, 0), points);
});
