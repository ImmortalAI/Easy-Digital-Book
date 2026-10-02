import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";

describe("ConfirmDialog review contracts", () => {
  afterEach(cleanup);

  it("focuses the destructive action, supports the ask-again choice, and cancels on Escape", async () => {
    const { emitted } = render(ConfirmDialog, {
      props: { open: true, title: "Delete", message: "Details", showAskAgain: true },
    });
    const confirm = await screen.findByRole("button", { name: "Delete" });
    expect(document.activeElement).toBe(confirm);

    await userEvent.click(screen.getByRole("checkbox", { name: /do not ask again/i }));
    await userEvent.keyboard("{Escape}");
    expect(emitted().cancel).toHaveLength(1);
  });

  it("starts with 'Do not ask again' unticked and keeps asking", async () => {
    const { emitted } = render(ConfirmDialog, {
      props: { open: true, title: "Delete", message: "Details" },
    });

    expect(await screen.findByRole("checkbox", { name: /do not ask again/i })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(emitted().confirm).toEqual([[{ askAgain: true }]]);
  });

  it("stops asking once 'Do not ask again' is ticked", async () => {
    const { emitted } = render(ConfirmDialog, {
      props: { open: true, title: "Delete", message: "Details" },
    });

    await userEvent.click(await screen.findByRole("checkbox", { name: /do not ask again/i }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(emitted().confirm).toEqual([[{ askAgain: false }]]);
  });
});
