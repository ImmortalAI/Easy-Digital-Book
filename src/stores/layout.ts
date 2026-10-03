import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { SettingsRepository } from "@/types/platform";

export type LayoutMode = "text" | "split" | "preview";
export type CenterView =
  | { kind: "chapter"; id: string }
  | { kind: "metadata" }
  | { kind: "css" }
  | { kind: "image"; path: string }
  | { kind: "images" }
  | { kind: "settings" };
export interface LayoutSettings {
  sidebarVisible: boolean;
  sidebarWidth: number;
  splitRatio: number;
  mode: LayoutMode;
  activeView: "explorer" | "search";
}
const defaults: LayoutSettings = {
  sidebarVisible: true,
  sidebarWidth: 250,
  splitRatio: 0.5,
  mode: "split",
  activeView: "explorer",
};
export const useLayoutStore = defineStore("layout", () => {
  const sidebarVisible = ref(defaults.sidebarVisible),
    sidebarWidth = ref(defaults.sidebarWidth);
  const splitRatio = ref(defaults.splitRatio),
    mode = ref<LayoutMode>(defaults.mode);
  const activeView = ref<LayoutSettings["activeView"]>(defaults.activeView);
  const center = ref<CenterView>({ kind: "chapter", id: "" });
  let settings: SettingsRepository | undefined;
  function configure(repository: SettingsRepository) {
    settings = repository;
  }
  const snapshot = computed<LayoutSettings>(() => ({
    sidebarVisible: sidebarVisible.value,
    sidebarWidth: sidebarWidth.value,
    splitRatio: splitRatio.value,
    mode: mode.value,
    activeView: activeView.value,
  }));
  async function load() {
    const value = await settings?.get<Partial<LayoutSettings>>("layout", {});
    if (!value) return;
    sidebarVisible.value = value.sidebarVisible ?? defaults.sidebarVisible;
    sidebarWidth.value = value.sidebarWidth ?? defaults.sidebarWidth;
    splitRatio.value = value.splitRatio ?? defaults.splitRatio;
    mode.value = value.mode ?? defaults.mode;
    activeView.value = value.activeView ?? defaults.activeView;
  }
  async function persist() {
    await settings?.set("layout", snapshot.value);
  }
  function setSidebarVisible(value: boolean) {
    sidebarVisible.value = value;
  }
  function toggleSidebar() {
    sidebarVisible.value = !sidebarVisible.value;
  }
  return {
    sidebarVisible,
    sidebarWidth,
    splitRatio,
    mode,
    activeView,
    center,
    snapshot,
    configure,
    load,
    persist,
    setSidebarVisible,
    toggleSidebar,
  };
});
