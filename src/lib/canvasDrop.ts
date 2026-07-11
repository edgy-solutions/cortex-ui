import { useStageStore } from "@/store/useStageStore";

/**
 * canvasDrop — routes an answer "dropped" from the sidebar list into the canvas
 * dock WITHOUT modifying the list. The list ends its pointer-drag by calling
 * useAnswerPanelStore.pinAnswer (repurposed to call routeAnswerDrop). We can't
 * change what the list passes, so we hit-test the drop against the dock chips
 * using the last known pointer position (a global pointermove tracker) and route
 * accordingly. Chips advertise themselves with `data-canvas-chip="<canvasId>"`
 * ("__new__" for the +NEW chip).
 */
let lastPointer = { x: 0, y: 0 };
if (typeof window !== "undefined") {
  const track = (e: PointerEvent) => {
    lastPointer = { x: e.clientX, y: e.clientY };
  };
  window.addEventListener("pointermove", track, { passive: true });
  window.addEventListener("pointerup", track, { passive: true });
}

export function getLastPointer() {
  return lastPointer;
}

/** Which dock chip (canvasId or "__new__") is under the given point, if any. */
export function chipAt(x: number, y: number): string | null {
  const chips = document.querySelectorAll("[data-canvas-chip]");
  for (const c of Array.from(chips)) {
    const r = c.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return c.getAttribute("data-canvas-chip");
    }
  }
  return null;
}

/** Add an answer to whichever canvas the drop landed on (chip under pointer),
 *  else the currently-viewed custom canvas; a drop over the global overview is
 *  ignored (global is derived, never hand-arranged). */
export function routeAnswerDrop(answerId: string) {
  const st = useStageStore.getState();
  const chip = chipAt(lastPointer.x, lastPointer.y);
  if (chip === "global") return; // global is derived — not a drop target
  if (chip === "__new__") {
    const id = st.createCanvas(`Canvas ${st.canvases.length + 1}`, undefined, true);
    useStageStore.getState().addItemAuto(id, answerId);
    return;
  }
  if (chip) {
    st.addItemAuto(chip, answerId);
    return;
  }
  if (st.view !== "global") st.addItemAuto(st.view, answerId);
  // else: over the global overview → ignore (nothing to hand-arrange).
}
