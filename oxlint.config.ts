export const restrictedImports = [
  {
    target: "src/services/{book,edb,epub,azw3,export,search,checks,css-support}/**",
    paths: ["vue", "pinia"],
    patterns: ["@tauri-apps/**"],
  },
  { target: "src/utils/**", paths: ["vue", "pinia"], patterns: ["@tauri-apps/**"] },
] as const;

const domGlobals = [
  "window",
  "document",
  "navigator",
  "location",
  "localStorage",
  "sessionStorage",
  "fetch",
  "XMLHttpRequest",
  "HTMLElement",
  "Element",
  "Node",
  "Blob",
  "File",
  "FormData",
  "URL",
  "URLSearchParams",
  "DOMParser",
  "Event",
  "Image",
  "Worker",
  "customElements",
  "crypto",
];

const restrictedPureGlobals = [...domGlobals, "globalThis"];

export default {
  plugins: ["eslint", "typescript", "vue", "vitest"],
  categories: { correctness: "error", suspicious: "error" },
  env: { browser: true },
  ignorePatterns: ["dist/**", "src-tauri/target/**"],
  overrides: restrictedImports
    .map(({ target, paths, patterns }) => ({
      files: [target],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          { ...(paths && { paths }), ...(patterns && { patterns }) },
        ],
      },
    }))
    .concat([
      {
        files: ["src/**"],
        excludeFiles: [
          "src/services/platform/**",
          "src/services/{book,edb,epub,azw3,export,search,checks,css-support}/**",
          "src/utils/**",
        ],
        rules: {
          "eslint/no-restricted-imports": ["error", { patterns: ["@tauri-apps/**"] }],
        },
      },
      {
        files: [
          "src/services/{book,edb,epub,azw3,export,search,checks,css-support}/**",
          "src/utils/**",
        ],
        env: { browser: false },
        rules: {
          "eslint/no-restricted-globals": [
            "error",
            {
              globals: restrictedPureGlobals,
              checkGlobalObject: true,
              globalObjects: ["globalThis", "self", "window"],
            },
          ],
        },
      },
      { files: ["vite.config.ts"], env: { browser: false, node: true } },
      { files: ["**/__tests__/**"], env: { vitest: true } },
    ]),
};
