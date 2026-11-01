/**
 * WHEN THE PLANNING STRIP MOUNTS, in one place, so the mount and the camera inset are computed
 * from the same call. Kept out of `PlanningChrome.tsx` so a test can stub that component and
 * still reach the predicate.
 */
export const mountsPlanningChrome = (
  isGlobal: boolean,
  use: string | undefined,
  focusId: string | null,
  fullPane: boolean,
) => !isGlobal && use === "portfolio_planning" && !focusId && !fullPane;

/**
 * Viewport-space px the board must clear below the strip. The strip sits at top-3 and is about
 * 30px tall; this is its bottom plus a gutter.
 */
export const PLANNING_CHROME_INSET = 48;
