import assert from "node:assert/strict";
import test from "node:test";

import { LAYOUT_VERSION, parseLayout } from "../src/home/layout-schema.ts";

test("legacy layouts preserve user placement and gain Codex once", () => {
  const layout = parseLayout({
    version: 1,
    widgets: [{ id: "clock", gx: 2, gy: 1, gw: 5, gh: 3, props: { format: "24" } }],
  });

  assert.equal(LAYOUT_VERSION, 2);
  assert.equal(layout.version, 2);
  assert.deepEqual(layout.widgets[0], {
    id: "clock", gx: 2, gy: 1, gw: 5, gh: 3, props: { format: "24" },
  });
  assert.equal(layout.widgets.filter((widget) => widget.id === "codex").length, 1);
});

test("current layouts do not re-add a widget the user removed", () => {
  const layout = parseLayout({
    version: 2,
    widgets: [{ id: "clock", gx: 0, gy: 0, gw: 5, gh: 3 }],
  });

  assert.deepEqual(layout.widgets.map((widget) => widget.id), ["clock"]);
});
