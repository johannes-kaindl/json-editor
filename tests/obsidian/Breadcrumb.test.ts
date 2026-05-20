import { describe, it, expect, beforeEach } from "vitest";
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
