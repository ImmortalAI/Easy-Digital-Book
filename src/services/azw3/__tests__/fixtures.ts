import type { Book } from "@/types/book";
import type { ImageProcessor } from "@/types/platform";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

// Generated from the project favicon and stored as a real 64×64 baseline JPEG.
export const jpeg = Uint8Array.from(
  readFileSync(resolve("src/services/azw3/__tests__/assets/fixture.jpg")),
);

const uuid = "urn:uuid:f1c7d8e2-3b4a-4c5d-9e6f-0a1b2c3d4e5f";
export function fixtureBook(): Book {
  return {
    metadata: {
      id: uuid,
      title: "AZW3 Fixture",
      version: "v1",
      created: "2026-01-02T03:04:05.000Z",
      modified: "2026-01-02T03:04:05.000Z",
      language: "ru-RU",
      authors: ["Автор"],
      translators: ["Translator"],
      series: null,
      description: "Deterministic fixture book.",
      cover: null,
    },
    chapters: [
      { id: "chapter1", source: "# Глава 1\n\nТекст[^a], снова [^a].\n\n[^a]: Примечание." },
      { id: "chapter2", source: "# Chapter 2\n\nCJK 中文 and emoji 😀." },
    ],
    resources: new Map(),
    customCss: null,
    dictionary: [],
  };
}

export function fixtureProcessor(): ImageProcessor {
  return {
    process: async ({ bytes, plan }) => ({
      bytes: bytes.slice(),
      mediaType: plan.format === "png" ? "image/png" : "image/jpeg",
      width: plan.width,
      height: plan.height,
    }),
    dispose() {},
  };
}

export function exportOptions() {
  return {
    imagePreset: "original" as const,
    grayscale: false,
    titlePage: false,
    versionInTitle: false,
  };
}
