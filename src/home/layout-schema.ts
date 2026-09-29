export const LAYOUT_VERSION = 2;

export interface LayoutWidget {
  id: string; gx: number; gy: number; gw: number; gh: number;
  props?: Record<string, unknown>;
}
export interface HomeLayout {
  version: number;
  widgets: LayoutWidget[];
  /** Tiles this document has already been offered. A newly introduced tile
   *  appears once without a layout-version bump, and a tile the user removed
   *  stays removed because its id is recorded here. */
  seeded?: string[];
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
    { id: "usage",    gx: 3, gy: 10, gw: 6, gh: 3 },
  ],
  seeded: ["usage"],
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

/** Tiles the layout seeds by itself. Each one is offered exactly once: a
 *  document written before the tile existed gets it, and a document that
 *  already carries or already got it is left alone. */
const SEEDED_TILES = ["usage"] as const;

/** The per-provider quota tiles were folded into the single `usage` tile that
 *  holds every provider. A layout carrying one of them keeps its slot. */
const MERGED_TILES = new Set(["codex", "claude"]);

/** Unknown/corrupt documents fall back to the default layout. */
export function parseLayout(raw: unknown): HomeLayout {
  if (typeof raw !== "object" || raw === null) return DEFAULT_LAYOUT;
  const o = raw as Record<string, unknown>;
  if ((o.version !== 1 && o.version !== LAYOUT_VERSION) || !Array.isArray(o.widgets)) return DEFAULT_LAYOUT;
  const widgets: LayoutWidget[] = [];
  const seeded = new Set<string>(
    Array.isArray(o.seeded) ? (o.seeded as unknown[]).filter((id): id is string => typeof id === "string") : [],
  );
  const size = { gw: 4, gh: 3 };

  // Fold a codex and/or claude tile into one usage tile at the first slot the
  // pair used, dropping the second one instead of leaving a gap.
  let folded = false;
  for (const widget of o.widgets.filter(isValidWidget)) {
    if (MERGED_TILES.has(widget.id)) {
      if (!folded) {
        // Wider than one of the two tiles, but never past the right edge and
        // never narrower than the tile it replaces.
        widgets.push({
          id: "usage",
          gx: widget.gx,
          gy: widget.gy,
          gw: Math.max(widget.gw, Math.min(6, 12 - widget.gx)),
          gh: widget.gh,
        });
        folded = true;
      }
      continue;
    }
    widgets.push(widget);
  }
  seeded.delete("codex");
  seeded.delete("claude");

  for (const id of SEEDED_TILES) {
    if (widgets.some((widget) => widget.id === id) || folded) {
      seeded.add(id);
      continue;
    }
    // A version-2 document that never carried the tile means the user removed
    // it — only a document written before the tile existed gets it seeded.
    if (o.version !== 1 || seeded.has(id)) {
      continue;
    }
    widgets.push({ id, ...firstFreeSlot(widgets, size.gw, size.gh), ...size });
    seeded.add(id);
  }

  return { version: LAYOUT_VERSION, widgets, seeded: [...seeded] };
}
