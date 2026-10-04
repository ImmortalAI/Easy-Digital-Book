export interface Selection {
  /** Selected paths in the order the user picked them; rename numbers follow it. */
  order: string[];
  anchor: string | null;
}

export const emptySelection = (): Selection => ({ order: [], anchor: null });

export function toggle(selection: Selection, path: string): Selection {
  return selection.order.includes(path)
    ? { order: selection.order.filter((item) => item !== path), anchor: path }
    : { order: [...selection.order, path], anchor: path };
}

export function selectRange(
  items: string[],
  base: string[],
  anchor: string,
  target: string,
): Selection {
  const from = items.indexOf(anchor);
  const to = items.indexOf(target);
  if (from < 0 || to < 0) return { order: base, anchor };
  const step = to >= from ? 1 : -1;
  const range: string[] = [];
  for (let i = from; i !== to + step; i += step) range.push(items[i]!);
  return { order: [...base.filter((path) => !range.includes(path)), ...range], anchor };
}

export const selectAll = (items: string[]): Selection => ({
  order: [...items],
  anchor: items[0] ?? null,
});
