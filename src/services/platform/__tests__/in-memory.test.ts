import { describe, expect, it } from "vitest";
import { createInMemoryPlatformServices } from "../index";

describe("in-memory platform dialogs", () => {
  it("returns deterministic project and EPUB paths for e2e adapters", async () => {
    const services = createInMemoryPlatformServices({
      dialogPaths: {
        project: "/memory/book.edb",
        epub: "/memory/book.epub",
        azw3: "/memory/book.azw3",
      },
      confirm: true,
    });

    await expect(
      services.dialogs.save({ filters: [{ name: "EPUB", extensions: ["epub"] }] }),
    ).resolves.toBe("/memory/book.epub");
    await expect(
      services.dialogs.save({ filters: [{ name: "AZW3", extensions: ["azw3"] }] }),
    ).resolves.toBe("/memory/book.azw3");
    await expect(
      services.dialogs.save({ filters: [{ name: "EDB", extensions: ["edb"] }] }),
    ).resolves.toBe("/memory/book.edb");
    await expect(services.dialogs.open()).resolves.toBe("/memory/book.edb");
    await expect(services.dialogs.confirm("delete")).resolves.toBe(true);
  });

  it("can cancel one pending save for the e2e export harness", async () => {
    const services = createInMemoryPlatformServices({ dialogPaths: { azw3: "/memory/book.azw3" } });
    services.test.cancelNextSave();
    await expect(
      services.dialogs.save({ filters: [{ name: "AZW3", extensions: ["azw3"] }] }),
    ).resolves.toBeNull();
    await expect(
      services.dialogs.save({ filters: [{ name: "AZW3", extensions: ["azw3"] }] }),
    ).resolves.toBe("/memory/book.azw3");
  });
});
