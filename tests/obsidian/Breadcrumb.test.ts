import { beforeEach, describe, expect, it } from "vitest";
import { Breadcrumb } from "../../src/obsidian/Breadcrumb";

describe("Breadcrumb", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("getElement returns an HTMLElement", () => {
    const b = new Breadcrumb({});
    expect(b.getElement()).toBeInstanceOf(HTMLElement);
    expect(b.getElement().classList.contains("json-breadcrumb")).toBe(true);
  });

  it("renders 'root' only when path is empty", () => {
    const b = new Breadcrumb({});
    b.setPath([]);
    const segs = b.getElement().querySelectorAll(".bc-seg");
    expect(segs.length).toBe(1);
    expect(segs[0].textContent).toBe("root");
  });

  it("renders root + segments with separators for a nested path", () => {
    const b = new Breadcrumb({});
    b.setPath(["users", 0, "name"]);
    const segs = b.getElement().querySelectorAll(".bc-seg");
    expect(segs.length).toBe(4);
    expect(segs[0].textContent).toBe("root");
    expect(segs[1].textContent).toBe("users");
    expect(segs[2].textContent).toBe("[0]");
    expect(segs[3].textContent).toBe("name");
    const seps = b.getElement().querySelectorAll(".bc-sep");
    expect(seps.length).toBe(3);
  });

  it("renders segments as focusable <button>s (keyboard accessible, WCAG 2.1.1)", () => {
    const b = new Breadcrumb({});
    b.setPath(["a", "b"]);
    const segs = b.getElement().querySelectorAll(".bc-seg");
    expect(segs.length).toBe(3);
    segs.forEach((s) => expect(s.tagName).toBe("BUTTON"));
  });

  it("marks the last segment with .bc-seg-terminal", () => {
    const b = new Breadcrumb({});
    b.setPath(["a", "b"]);
    const segs = b.getElement().querySelectorAll(".bc-seg");
    expect(segs[segs.length - 1].classList.contains("bc-seg-terminal")).toBe(true);
    expect(segs[0].classList.contains("bc-seg-terminal")).toBe(false);
  });

  it("fires onSegmentClick with truncated path when a segment is clicked", () => {
    const calls: Array<(string | number)[]> = [];
    const b = new Breadcrumb({ onSegmentClick: (p) => calls.push(p) });
    b.setPath(["users", 0, "name"]);
    const segs = b.getElement().querySelectorAll<HTMLElement>(".bc-seg");
    // Click 'users' (segs[1], index 1) — truncated path is ["users"]
    segs[1].click();
    // Click 'root' (segs[0], index 0) — truncated path is []
    segs[0].click();
    expect(calls).toEqual([["users"], []]);
  });

  it("replaces previous segments on subsequent setPath calls", () => {
    const b = new Breadcrumb({});
    b.setPath(["a", "b", "c"]);
    b.setPath(["x"]);
    const segs = b.getElement().querySelectorAll(".bc-seg");
    expect(segs.length).toBe(2);
    expect(segs[0].textContent).toBe("root");
    expect(segs[1].textContent).toBe("x");
  });
});

describe("Breadcrumb focus on a branch", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const labels = (b: Breadcrumb): string[] =>
    [...b.getElement().querySelectorAll(".bc-seg")].map((s) => s.textContent ?? "");

  it("offers 'Show as root' only when the current location can be focused", () => {
    const b = new Breadcrumb({ onFocusRequest: () => {} });
    b.setPath(["cfg"]);
    expect(b.getElement().querySelector(".bc-focus-btn")).toBeNull();
    b.setCanFocus(true);
    const btn = b.getElement().querySelector<HTMLButtonElement>(".bc-focus-btn");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("aria-label")).toBe("Show as root");
    expect(btn?.type).toBe("button");
  });

  it("the focus button reports the current path", () => {
    const got: unknown[] = [];
    const b = new Breadcrumb({ onFocusRequest: (p) => got.push(p) });
    b.setCanFocus(true);
    b.setPath(["cfg", "net"]);
    b.getElement().querySelector<HTMLButtonElement>(".bc-focus-btn")?.click();
    expect(got).toEqual([["cfg", "net"]]);
  });

  it("marks the focused root and the segments above it", () => {
    const b = new Breadcrumb({});
    b.setFocusRoot(["cfg"]);
    b.setPath(["cfg", "net", "host"]);
    const segs = [...b.getElement().querySelectorAll<HTMLElement>(".bc-seg")];
    expect(labels(b)).toEqual(["root", "cfg", "net", "host"]);
    expect(segs[0].classList.contains("bc-seg-outside")).toBe(true);
    expect(segs[1].classList.contains("bc-seg-focus-root")).toBe(true);
    expect(segs[2].classList.contains("bc-seg-outside")).toBe(false);
  });

  it("the root segment says it shows the whole file while focused", () => {
    const b = new Breadcrumb({});
    b.setFocusRoot(["cfg"]);
    b.setPath(["cfg"]);
    const root = b.getElement().querySelector<HTMLElement>(".bc-seg-root");
    expect(root?.getAttribute("aria-label")).toBe("Show whole file");
    b.setFocusRoot([]);
    b.setPath(["cfg"]);
    expect(b.getElement().querySelector(".bc-seg-root")?.hasAttribute("aria-label")).toBe(false);
  });

  it("without a focus nothing is marked", () => {
    const b = new Breadcrumb({});
    b.setPath(["a", "b"]);
    expect(b.getElement().querySelector(".bc-seg-outside, .bc-seg-focus-root")).toBeNull();
  });
});

describe("Breadcrumb: long paths are shortened in the middle", () => {
  const deep = ["a", "b", "c", "d", "e", "f", "g", "h"]; // root + 8 = 9 segments

  it("keeps root, an ellipsis button and the last three segments", () => {
    const b = new Breadcrumb({});
    b.setPath(deep);
    const labels = [...b.getElement().querySelectorAll(".bc-seg")].map((s) => s.textContent);
    expect(labels).toEqual(["root", "…", "f", "g", "h"]);
  });

  it("does not shorten a path of up to five segments", () => {
    const b = new Breadcrumb({});
    b.setPath(["a", "b", "c", "d"]);
    const labels = [...b.getElement().querySelectorAll(".bc-seg")].map((s) => s.textContent);
    expect(labels).toEqual(["root", "a", "b", "c", "d"]);
  });

  it("the ellipsis expands the full path and does not navigate", () => {
    let clicked = 0;
    const b = new Breadcrumb({ onSegmentClick: () => clicked++ });
    b.setPath(deep);
    (b.getElement().querySelector(".bc-ellipsis") as HTMLButtonElement).click();
    const labels = [...b.getElement().querySelectorAll(".bc-seg")].map((s) => s.textContent);
    expect(labels).toEqual(["root", "a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(clicked).toBe(0);
  });

  it("a new path folds the breadcrumb again", () => {
    const b = new Breadcrumb({});
    b.setPath(deep);
    (b.getElement().querySelector(".bc-ellipsis") as HTMLButtonElement).click();
    b.setPath([...deep, "i"]);
    expect(b.getElement().querySelector(".bc-ellipsis")).not.toBeNull();
  });

  it("root stays a clickable segment and the last segment stays terminal", () => {
    const seen: unknown[] = [];
    const b = new Breadcrumb({ onSegmentClick: (p) => seen.push(p) });
    b.setPath(deep);
    const segs = b.getElement().querySelectorAll<HTMLButtonElement>(".bc-seg");
    segs[0].click();
    expect(seen).toEqual([[]]);
    expect(segs[segs.length - 1].classList.contains("bc-seg-terminal")).toBe(true);
  });

  it("the focus root keeps its marker when it is among the visible segments", () => {
    const b = new Breadcrumb({});
    b.setFocusRoot(["a", "b", "c", "d", "e", "f"]);
    b.setPath(deep);
    expect(b.getElement().querySelector(".bc-seg-focus-root")?.textContent).toBe("f");
  });
});
