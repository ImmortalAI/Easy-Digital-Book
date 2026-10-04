import { getCurrentScope, onScopeDispose } from "vue";

export interface LongPressOptions {
  delay?: number;
  slop?: number;
  onStart(path: string): void;
  onExtend(path: string): void;
  onEnd(): void;
  scroller(): HTMLElement | undefined;
}

const EDGE = 48;

/**
 * Android-gallery selection: hold a tile to select it, keep holding and move
 * to select every tile from it to the one under the pointer. Pointer events,
 * not HTML5 drag, so dropping files onto the gallery keeps working.
 */
export function useLongPressSelect(options: LongPressOptions) {
  const delay = options.delay ?? 500;
  const slop = options.slop ?? 8;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start = { x: 0, y: 0 };
  let active = false;
  let suppress = false;
  let frame = 0;
  let lastY = 0;

  function cleanup() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  }
  function autoscroll() {
    const scroller = options.scroller();
    if (!active || !scroller) return;
    const box = scroller.getBoundingClientRect();
    const delta = lastY < box.top + EDGE ? -12 : lastY > box.bottom - EDGE ? 12 : 0;
    if (delta) scroller.scrollBy(0, delta);
    frame = requestAnimationFrame(autoscroll);
  }
  function move(event: PointerEvent) {
    lastY = event.clientY;
    if (!active) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > slop) cleanup();
      return;
    }
    const tile = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-gallery-path]");
    if (tile?.dataset.galleryPath) options.onExtend(tile.dataset.galleryPath);
  }
  function up() {
    if (active) {
      suppress = true;
      options.onEnd();
    }
    active = false;
    cleanup();
  }
  function onPointerDown(event: PointerEvent, path: string) {
    if (event.button !== 0) return;
    cleanup();
    suppress = false;
    start = { x: event.clientX, y: event.clientY };
    lastY = event.clientY;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    timer = setTimeout(() => {
      active = true;
      options.onStart(path);
      frame = requestAnimationFrame(autoscroll);
    }, delay);
  }
  // An unmount mid-gesture must not leave the timer, the autoscroll frame or
  // the window listeners behind.
  if (getCurrentScope())
    onScopeDispose(() => {
      active = false;
      cleanup();
    });
  /** True once after a long press, so the click that ends it does not open the image. */
  function suppressClick() {
    const value = suppress;
    suppress = false;
    return value;
  }
  return { onPointerDown, suppressClick };
}
