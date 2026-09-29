import assert from "node:assert/strict";
import test from "node:test";

import { LAYOUT_VERSION, parseLayout } from "../src/home/layout-schema.ts";

const ids = (layout) => layout.widgets.map((widget) => widget.id);

test("a pre-codex document keeps user placement and gains both seeded tiles", () => {
  const layout = parseLayout({
    version: 1,
    widgets: [{ id: "clock", gx: 2, gy: 1, gw: 5, gh: 3, props: { format: "24" } }],
  });

  assert.equal(LAYOUT_VERSION, 2);
  assert.equal(layout.version, 2);
  assert.deepEqual(layout.widgets[0], {
    id: "clock", gx: 2, gy: 1, gw: 5, gh: 3, props: { format: "24" },
  });
  assert.equal(ids(layout).filter((id) => id === "codex").length, 1);
  assert.equal(ids(layout).filter((id) => id === "claude").length, 1);
  assert.deepEqual(layout.seeded?.slice().sort(), ["claude", "codex"]);
});

test("a version-2 document gains the newer tile once, and only once", () => {
  const migrated = parseLayout({
    version: 2,
    widgets: [{ id: "clock", gx: 0, gy: 0, gw: 5, gh: 3 }],
  });

  assert.deepEqual(ids(migrated), ["clock", "claude"]);

  const again = parseLayout(JSON.parse(JSON.stringify(migrated)));

  assert.deepEqual(ids(again), ["clock", "claude"]);
});

test("codex is not re-added to a version-2 document that lost it", () => {
  const layout = parseLayout({
    version: 2,
    widgets: [{ id: "clock", gx: 0, gy: 0, gw: 5, gh: 3 }],
  });

  assert.equal(ids(layout).includes("codex"), false);
});

test("a tile the user removed stays removed", () => {
  const layout = parseLayout({
    version: 2,
    seeded: ["codex", "claude"],
    widgets: [{ id: "clock", gx: 0, gy: 0, gw: 5, gh: 3 }],
  });

  assert.deepEqual(ids(layout), ["clock"]);
});

test("an unusable document falls back to the default layout", () => {
  assert.equal(
    parseLayout({ version: 9, widgets: [] }).widgets.length,
    parseLayout(null).widgets.length,
  );
});
