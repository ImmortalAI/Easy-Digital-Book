import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "@/assets/style.css";
import { createI18nPlugin, type SupportedLocale } from "@/plugins/i18n";
import { useTheme } from "@/composables/use-theme";
import {
  createInMemoryPlatformServices,
  platformServices,
  setRuntimePlatformServices,
} from "@/services/platform";
import { reportUnexpectedError } from "@/services/platform/error-reporting";
import { installGlobalErrorHandlers } from "@/services/platform/global-errors";
import packageJson from "../package.json";

const supportedLocales: SupportedLocale[] = ["ru", "en", "zh-CN"];
const e2eServices =
  import.meta.env.MODE === "e2e"
    ? createInMemoryPlatformServices({
        dialogPaths: {
          project: "/memory/book.edb",
          epub: "/memory/book.epub",
          azw3: "/memory/book.azw3",
        },
        confirm: true,
      })
    : null;
const runtimeServices = e2eServices ?? platformServices;
if (e2eServices) {
  (window as Window & { edbE2e?: unknown }).edbE2e = e2eServices.test;
}
setRuntimePlatformServices(runtimeServices);

function browserLocale(): SupportedLocale {
  const value = navigator.language;
  return (
    supportedLocales.find((locale) => value === locale) ??
    supportedLocales.find((locale) => value.startsWith(`${locale}-`)) ??
    "en"
  );
}

function report(error: unknown) {
  const details = reportUnexpectedError(error, runtimeServices.logger, {
    version: packageJson.version,
  });
  window.dispatchEvent(new CustomEvent("edb-unexpected-error", { detail: details }));
}

export async function bootstrap() {
  let initialLocale = browserLocale();
  try {
    const saved = await runtimeServices.settings.get<SupportedLocale | null>("locale", null);
    if (saved && supportedLocales.includes(saved)) initialLocale = saved;
  } catch {
    runtimeServices.logger.warn("Could not load interface locale", { code: "settings.locale" });
  }
  const app = createApp(App);
  app.config.errorHandler = (error) => report(error);
  installGlobalErrorHandlers(report);
  app.use(createPinia());
  useTheme();
  app.use(createI18nPlugin(initialLocale)).mount("#app");
}

void bootstrap().catch(report);
