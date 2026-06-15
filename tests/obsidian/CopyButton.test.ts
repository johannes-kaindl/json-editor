import { Notice } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCopyButton } from "../../src/obsidian/CopyButton";

describe("createCopyButton", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = "";
    Notice.instances = [];
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

  it("has an aria-label for screen readers (icon-only button)", () => {
    const btn = createCopyButton("x", ["a"]);
    expect(btn.getAttribute("aria-label")).toBe("Copy value");
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

  it("clipboard rejection does not throw, does not mark .copied, and shows a Notice", async () => {
    writeText.mockRejectedValueOnce(new Error("clipboard unavailable"));
    const btn = createCopyButton("x", ["a"]);
    document.body.appendChild(btn);
    btn.click();
    // Wait for the rejected writeText promise to settle, then flush the
    // .then(onErr) microtask that creates the Notice.
    await (writeText.mock.results[0]?.value as Promise<unknown>).catch(() => undefined);
    await Promise.resolve();
    expect(btn.classList.contains("copied")).toBe(false);
    expect(btn.textContent).toBe("⧉");
    expect(Notice.instances.some((n) => /copy failed/i.test(n.message))).toBe(true);
  });

  it("absent clipboard API does not throw and shows a Copy failed Notice (2.19)", () => {
    vi.stubGlobal("navigator", {}); // no clipboard (older WebView / non-secure context)
    const btn = createCopyButton("x", ["a"]);
    document.body.appendChild(btn);
    expect(() => btn.click()).not.toThrow();
    expect(Notice.instances.some((n) => /copy failed/i.test(n.message))).toBe(true);
    expect(btn.textContent).toBe("⧉");
  });
});
