import { describe, expect, it } from "vitest";
import {
  emptySelection,
  selectAll,
  selectRange,
  toggle,
} from "@/components/images/gallery-selection";

const items = ["a", "b", "c", "d", "e"];

describe("gallery selection", () => {
  it("keeps the order in which items were toggled", () => {
    const s = toggle(toggle(toggle(emptySelection(), "c"), "a"), "e");
    expect(s.order).toEqual(["c", "a", "e"]);
    expect(toggle(s, "a").order).toEqual(["c", "e"]);
  });

  it("selects from the anchor towards the target, in that direction", () => {
    expect(selectRange(items, [], "b", "d").order).toEqual(["b", "c", "d"]);
    expect(selectRange(items, [], "d", "b").order).toEqual(["d", "c", "b"]);
  });

  it("shrinks back when the pointer returns, keeping the earlier selection", () => {
    const base = ["e"];
    expect(selectRange(items, base, "a", "c").order).toEqual(["e", "a", "b", "c"]);
    expect(selectRange(items, base, "a", "a").order).toEqual(["e", "a"]);
  });

  it("selects all in grid order", () => {
    expect(selectAll(items).order).toEqual(items);
  });
});
