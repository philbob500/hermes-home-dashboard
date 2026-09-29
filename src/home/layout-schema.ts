export const LAYOUT_VERSION = 2;

export interface LayoutWidget {
  id: string; gx: number; gy: number; gw: number; gh: number;
  props?: Record<string, unknown>;
}
export interface HomeLayout {
  version: number;
  widgets: LayoutWidget[];
}

/** Factory layout — the approved home-rice-v2 mockup composition. */
export const DEFAULT_LAYOUT: HomeLayout = {
  version: LAYOUT_VERSION,
  widgets: [
    { id: "ascii",    gx: 0, gy: 0, gw: 3, gh: 6 },
    { id: "clock",    gx: 3, gy: 0, gw: 5, gh: 3 },
    { id: "gateway",  gx: 8, gy: 0, gw: 4, gh: 3 },
    { id: "tokens",   gx: 3, gy: 3, gw: 5, gh: 4 },
    { id: "host",     gx: 8, gy: 3, gw: 4, gh: 4 },
    { id: "matrix",   gx: 0, gy: 6, gw: 3, gh: 4 },
    { id: "sessions", gx: 3, gy: 7, gw: 3, gh: 3 },
    { id: "cron",     gx: 6, gy: 7, gw: 3, gh: 3 },
    { id: "errors",   gx: 9, gy: 7, gw: 3, gh: 3 },
    { id: "codex",    gx: 3, gy: 10, gw: 4, gh: 3 },
  ],
};

function isValidWidget(w: unknown): w is LayoutWidget {
  if (typeof w !== "object" || w === null) return false;
  const o = w as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    [o.gx, o.gy, o.gw, o.gh].every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function firstFreeSlot(widgets: LayoutWidget[], gw: number, gh: number): { gx: number; gy: number } {
  const maxRow = widgets.reduce((max, widget) => Math.max(max, widget.gy + widget.gh), 0);
  for (let gy = 0; gy <= maxRow; gy += 1) {
    for (let gx = 0; gx <= 12 - gw; gx += 1) {
      const collision = widgets.some((widget) =>
        gx < widget.gx + widget.gw && gx + gw > widget.gx &&
        gy < widget.gy + widget.gh && gy + gh > widget.gy,
      );
      if (!collision) return { gx, gy };
    }
  }
  return { gx: 0, gy: maxRow };
}

/** Unknown/corrupt documents fall back to the default layout. */
export function parseLayout(raw: unknown): HomeLayout {
  if (typeof raw !== "object" || raw === null) return DEFAULT_LAYOUT;
  const o = raw as Record<string, unknown>;
  if ((o.version !== 1 && o.version !== LAYOUT_VERSION) || !Array.isArray(o.widgets)) return DEFAULT_LAYOUT;
  const widgets = o.widgets.filter(isValidWidget);
  if (o.version === 1 && !widgets.some((widget) => widget.id === "codex")) {
    const size = { gw: 4, gh: 3 };
    widgets.push({ id: "codex", ...firstFreeSlot(widgets, size.gw, size.gh), ...size });
  }
  return { version: LAYOUT_VERSION, widgets };
}
