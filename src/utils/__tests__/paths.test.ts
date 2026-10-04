import { describe, expect, it } from "vitest";
import { normalizeResourceName, sanitizeNameInput } from "@/utils/paths";

describe("resource names", () => {
  it("keeps underscores in resource names", () => {
    expect(normalizeResourceName("Scene_01.PNG")).toBe("scene_01.png");
  });
  it("filters name input to lowercase latin, digits, _ and -", () => {
    expect(sanitizeNameInput("Сцена Scene_1-A!")).toBe("scene_1-a");
  });
});
