// Story 2.2: the shapes the shared bottom sheet (src/shared/ui/bottom-sheet.tsx)
// shares with its pure snap decisions (src/lib/sheet-snap.ts) and the order
// freeze (src/state/order-freeze.ts). The layer map lets src/shared import
// nothing else, so the sheet gets those through `SheetRuntime`, bound once
// in src/router.tsx (the same pattern as the maindata fetch).

/**
 * How tall the sheet rests (DESIGN bottom-sheet): `fit` its content, at most
 * 90% of the screen; `fixed90` 90% (add torrent); `detail` 70% (detail);
 * `full` the whole screen (rename). Any of them can be dragged up to full
 * screen.
 */
export type SheetMode = 'fit' | 'fixed90' | 'detail' | 'full'

/** Where a released drag ends: closed, the mode's rest height, or full screen. */
export type SheetSnap = 'close' | 'rest' | 'full'

export interface SheetRelease {
  mode: SheetMode
  /** The sheet was full screen when the drag started. */
  expanded: boolean
  /** The mode's rest height in px (`sheetRestHeight`). */
  restHeight: number
  viewportHeight: number
  /** How far the finger moved, px; positive is down. */
  distance: number
  /** Speed at release, px/ms; positive is down. */
  velocity: number
}

/** One pointer position during a drag. */
export interface DragSample {
  /** `event.timeStamp`, ms. */
  time: number
  /** `event.clientY`, px. */
  y: number
}

export interface SheetRuntime {
  restHeight: (
    mode: SheetMode,
    contentHeight: number,
    viewportHeight: number,
  ) => number
  settle: (release: SheetRelease) => SheetSnap
  releaseVelocity: (samples: ReadonlyArray<DragSample>) => number
  /** Counts an open sheet as an order-freeze reason; call the result to end it. */
  holdOrder: () => () => void
}
