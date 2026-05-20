import { describe, it, expect, beforeEach, vi } from "vitest";
import { createCopyButton } from "../../src/obsidian/CopyButton";

describe("createCopyButton", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
  });

  it("returns a button element with class json-copy-btn and ⧉ glyph", () => {
    const btn = createCopyButton("hello", ["name"]);
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.classList.contains("json-copy-btn")).toBe(true);
    expect(btn.textContent).toBe("⧉");
  });

  it("plain click writes value as JSON to clipboard", async () => {
    const btn = createCopyButton({ a: 1, b: [true, null] }, ["x"]);
    document.body.appendChild(btn);
    btn.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith('{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}');
  });

  it("Alt+Click writes pathToString output to clipboard", async () => {
    const btn = createCopyButton("hello", ["users", 0, "name"]);
    document.body.appendChild(btn);
    btn.dispatchEvent(new MouseEvent("click", { altKey: true, bubbles: true }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith("users[0].name");
  });

  it("after successful copy, button gets .copied class and ✓ glyph", async () => {
    const btn = createCopyButton("x", ["a"]);
    document.body.appendChild(btn);
    btn.click();
    await vi.waitFor(() => expect(btn.classList.contains("copied")).toBe(true));
    expect(btn.textContent).toBe("✓");
  });

  it("after 800ms, button reverts to ⧉ and loses .copied class", async () => {
    const btn = createCopyButton("x", ["a"]);
    document.body.appendChild(btn);
    btn.click();
    await vi.waitFor(() => expect(btn.classList.contains("copied")).toBe(true));
    vi.advanceTimersByTime(800);
    expect(btn.classList.contains("copied")).toBe(false);
    expect(btn.textContent).toBe("⧉");
  });

  it("clipboard rejection does not throw and does not mark .copied", async () => {
    writeText.mockRejectedValueOnce(new Error("clipboard unavailable"));
    const btn = createCopyButton("x", ["a"]);
    document.body.appendChild(btn);
    btn.click();
    // Allow the rejected promise to settle
    await Promise.resolve();
    await Promise.resolve();
    expect(btn.classList.contains("copied")).toBe(false);
    expect(btn.textContent).toBe("⧉");
  });
});
