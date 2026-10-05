import { useDebounceFn } from "@vueuse/core";
import { onScopeDispose, watch } from "vue";
import { useProjectStore } from "@/stores/project";
import { useDiagnosticsStore } from "@/stores/diagnostics";
import { checkKindleCss } from "@/services/css-support/check";

/** One subscription per open book shell, independent of which editor is mounted. */
export function useCssSupport(): void {
  const project = useProjectStore();
  const diagnostics = useDiagnosticsStore();
  const check = () => diagnostics.setCssFindings(checkKindleCss(project.book?.customCss ?? ""));
  const schedule = useDebounceFn(check, 150);
  const stop = watch(
    [() => project.bookGeneration, () => project.book?.customCss],
    ([generation, css], previous) => {
      schedule.cancel();
      diagnostics.clearCss();
      if (!previous || previous[0] !== generation) check();
      else if (css) schedule();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    schedule.cancel();
    stop();
  });
}
