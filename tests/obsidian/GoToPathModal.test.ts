import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { GoToPathModal } from "../../src/obsidian/GoToPathModal";

const appStub = () => ({}) as App;

describe("GoToPathModal", () => {
  it("filters the path list case-insensitively by substring", () => {
    const modal = new GoToPathModal(
      appStub(),
      ["server.host", "server.port", "name"],
      false,
      () => {},
    );
    expect(modal.getSuggestions("PORT")).toEqual(["server.port"]);
  });

  it("returns the whole list for an empty query", () => {
    const modal = new GoToPathModal(appStub(), ["a", "b"], false, () => {});
    expect(modal.getSuggestions("")).toEqual(["a", "b"]);
  });

  it("says so when the list was truncated", () => {
    const modal = new GoToPathModal(appStub(), ["a"], true, () => {});
    expect(modal.emptyStateText).toContain("first");
  });

  it("does not claim truncation when the list is complete", () => {
    const modal = new GoToPathModal(appStub(), ["a"], false, () => {});
    expect(modal.emptyStateText).not.toContain("first");
  });

  it("hands the chosen path to the callback", () => {
    const onChoose = vi.fn();
    const modal = new GoToPathModal(appStub(), ["a.b"], false, onChoose);
    modal.onChooseSuggestion("a.b", new MouseEvent("click"));
    expect(onChoose).toHaveBeenCalledWith("a.b");
  });
});
