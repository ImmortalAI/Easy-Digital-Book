import { onBeforeUnmount, watch } from "vue";
import { createResourceUrlCache } from "@/components/editor/preview-resources";
import { useProjectStore } from "@/stores/project";

/** blob: URLs for the book's images, kept in sync and released on unmount. */
export function useResourceUrls() {
  const project = useProjectStore();
  const cache = createResourceUrlCache();
  watch(
    () => project.book?.resources,
    (resources) => cache.sync(resources ?? new Map()),
    { immediate: true },
  );
  onBeforeUnmount(cache.releaseAll);
  return { url: (path: string) => cache.resolve(path) };
}
