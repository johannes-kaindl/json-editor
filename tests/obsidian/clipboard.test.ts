import { Notice } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyJsonPath, copyJsonValue } from "../../src/obsidian/clipboard";

describe("clipboard util", () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    Notice.instances = [];
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
  });

  it("copyJsonValue writes pretty JSON and calls onCopied", async () => {
    const onCopied = vi.fn();
    copyJsonValue({ a: 1 }, onCopied);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('{\n  "a": 1\n}'));
    await vi.waitFor(() => expect(onCopied).toHaveBeenCalled());
  });

  it("copyJsonPath writes pathToString output", async () => {
    copyJsonPath(["users", 0, "name"]);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("users[0].name"));
  });

  it("absent clipboard API shows a Copy failed Notice and does not throw", () => {
    vi.stubGlobal("navigator", {});
    expect(() => copyJsonValue("x")).not.toThrow();
    expect(Notice.instances.some((n) => /copy failed/i.test(n.message))).toBe(true);
  });
});
