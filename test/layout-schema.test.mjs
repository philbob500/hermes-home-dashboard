import assert from "node:assert/strict";
import test from "node:test";

import { LAYOUT_VERSION, parseLayout } from "../src/home/layout-schema.ts";

const ids = (layout) => layout.widgets.map((widget) => widget.id);

test("a paper-value tile is seeded once into an existing version-2 layout", () => {
  const layout = parseLayout({
    version: 2,
    seeded: ["usage"],
    widgets: [{ id: "clock", gx: 0, gy: 0, gw: 5, gh: 3 }],
  });

  assert.equal(ids(layout).filter((id) => id === "paper-value").length, 1);
  assert.deepEqual(layout.widgets.at(-1), {
    id: "paper-value", gx: 5, gy: 0, gw: 5, gh: 4,
  });
  assert.deepEqual(layout.seeded, ["usage", "paper-value"]);
  assert.deepEqual(ids(parseLayout(layout)).filter((id) => id === "paper-value"), ["paper-value"]);
});

test("a seeded paper-value tile the user removed stays removed", () => {
  const layout = parseLayout({
    version: 2,
    seeded: ["usage", "paper-value"],
    widgets: [{ id: "clock", gx: 0, gy: 0, gw: 5, gh: 3 }],
  });

  assert.deepEqual(ids(layout), ["clock"]);
});

test("a document written before the limits tile gains it", () => {
  const layout = parseLayout({
    version: 1,
    widgets: [{ id: "clock", gx: 2, gy: 1, gw: 5, gh: 3, props: { format: "24" } }],
  });

  assert.equal(LAYOUT_VERSION, 2);
  assert.equal(layout.version, 2);
  assert.deepEqual(layout.widgets[0], {
    id: "clock", gx: 2, gy: 1, gw: 5, gh: 3, props: { format: "24" },
  });
  assert.equal(ids(layout).filter((id) => id === "usage").length, 1);
  assert.deepEqual(layout.seeded, ["usage", "paper-value"]);
});

test("a codex and claude pair becomes one limits tile in the first slot", () => {
  const layout = parseLayout({
    version: 2,
    seeded: ["codex", "claude"],
    widgets: [
      { id: "clock", gx: 0, gy: 0, gw: 5, gh: 3 },
      { id: "codex", gx: 3, gy: 10, gw: 4, gh: 3 },
      { id: "claude", gx: 7, gy: 10, gw: 4, gh: 3 },
    ],
  });

  assert.deepEqual(ids(layout), ["clock", "usage", "paper-value"]);
  assert.deepEqual(layout.widgets[1], { id: "usage", gx: 3, gy: 10, gw: 6, gh: 3 });
  assert.deepEqual(layout.seeded, ["usage", "paper-value"]);
});

test("the fold never pushes the tile past the right edge", () => {
  const layout = parseLayout({
    version: 2,
    seeded: ["paper-value"],
    widgets: [{ id: "codex", gx: 10, gy: 0, gw: 2, gh: 3 }],
  });

  assert.deepEqual(layout.widgets, [{ id: "usage", gx: 10, gy: 0, gw: 2, gh: 3 }]);
});

test("a limits tile the user removed stays removed", () => {
  const layout = parseLayout({
    version: 2,
    seeded: ["usage", "paper-value"],
    widgets: [{ id: "clock", gx: 0, gy: 0, gw: 5, gh: 3 }],
  });

  assert.deepEqual(ids(layout), ["clock"]);
});

test("an existing limits tile keeps its placement", () => {
  const layout = parseLayout({
    version: 2,
    seeded: ["paper-value"],
    widgets: [{ id: "usage", gx: 6, gy: 4, gw: 4, gh: 3 }],
  });

  assert.deepEqual(layout.widgets, [{ id: "usage", gx: 6, gy: 4, gw: 4, gh: 3 }]);
  assert.deepEqual(layout.seeded, ["paper-value", "usage"]);
});

test("an unusable document falls back to the default layout", () => {
  assert.equal(
    parseLayout({ version: 9, widgets: [] }).widgets.length,
    parseLayout(null).widgets.length,
  );
});
