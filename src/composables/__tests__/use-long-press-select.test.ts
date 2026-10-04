import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLongPressSelect } from "@/composables/use-long-press-select";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function pointer(type: string, x = 0, y = 0) {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, button: 0 });
}

describe("useLongPressSelect", () => {
  it("starts after the delay and extends to tiles under the pointer", () => {
    const onStart = vi.fn<(path: string) => void>(),
      onExtend = vi.fn<(path: string) => void>(),
      onEnd = vi.fn<() => void>();
    const tile = document.createElement("div");
    tile.dataset.galleryPath = "b";
    document.body.append(tile);
    document.elementFromPoint = vi.fn<() => Element>(() => tile);
    const press = useLongPressSelect({ onStart, onExtend, onEnd, scroller: () => undefined });
    press.onPointerDown(pointer("pointerdown"), "a");
    vi.advanceTimersByTime(499);
    expect(onStart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStart).toHaveBeenCalledWith("a");
    window.dispatchEvent(pointer("pointermove", 50, 50));
    expect(onExtend).toHaveBeenCalledWith("b");
    window.dispatchEvent(pointer("pointerup"));
    expect(onEnd).toHaveBeenCalled();
    expect(press.suppressClick()).toBe(true);
  });

  it("cancels when the pointer moves before the delay (a scroll, not a press)", () => {
    const onStart = vi.fn<(path: string) => void>();
    const press = useLongPressSelect({
      onStart,
      onExtend: vi.fn<(path: string) => void>(),
      onEnd: vi.fn<() => void>(),
      scroller: () => undefined,
    });
    press.onPointerDown(pointer("pointerdown", 0, 0), "a");
    window.dispatchEvent(pointer("pointermove", 0, 20));
    vi.advanceTimersByTime(600);
    expect(onStart).not.toHaveBeenCalled();
    expect(press.suppressClick()).toBe(false);
  });
});
