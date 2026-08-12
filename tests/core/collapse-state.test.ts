import { describe, expect, it } from "vitest";
import {
  COLLAPSE_STATE_LIMIT,
  type CollapseStates,
  capStates,
  recordFileState,
  resolveCollapsed,
} from "../../src/core/collapse-state";

describe("resolveCollapsed", () => {
  it("falls back to the depth default when the file has no stored entry", () => {
    expect(resolveCollapsed(undefined, "a", 3, 2)).toBe(true);
    expect(resolveCollapsed(undefined, "a", 2, 2)).toBe(false);
  });

  it("returns false when there is no entry and no depth default", () => {
    expect(resolveCollapsed(undefined, "a", 9, undefined)).toBe(false);
  });

  it("prefers the stored entry over the depth default", () => {
    const entry = { collapsed: ["a"], touched: 1 };
    expect(resolveCollapsed(entry, "a", 0, 2)).toBe(true);
    expect(resolveCollapsed(entry, "b", 9, 2)).toBe(false);
  });

  it("treats an empty stored list as 'everything expanded', not as 'no entry'", () => {
    expect(resolveCollapsed({ collapsed: [], touched: 1 }, "a", 9, 2)).toBe(false);
  });
});

describe("recordFileState", () => {
  it("adds an entry with the given timestamp", () => {
    const next = recordFileState({}, "notes/a.json", ["x", "y"], 1000);
    expect(next["notes/a.json"]).toEqual({ collapsed: ["x", "y"], touched: 1000 });
  });

  it("replaces the previous list rather than merging it", () => {
    const first = recordFileState({}, "a.json", ["x", "y"], 1000);
    const second = recordFileState(first, "a.json", ["x"], 2000);
    expect(second["a.json"]).toEqual({ collapsed: ["x"], touched: 2000 });
  });

  it("does not mutate the input", () => {
    const input: CollapseStates = {};
    recordFileState(input, "a.json", ["x"], 1000);
    expect(input).toEqual({});
  });
});

describe("capStates", () => {
  it("keeps everything below the limit", () => {
    const states = recordFileState({}, "a.json", [], 1);
    expect(Object.keys(capStates(states, 5))).toEqual(["a.json"]);
  });

  it("drops the least recently touched entries beyond the limit", () => {
    let s: CollapseStates = {};
    s = recordFileState(s, "old.json", [], 1);
    s = recordFileState(s, "mid.json", [], 2);
    s = recordFileState(s, "new.json", [], 3);
    const capped = capStates(s, 2);
    expect(Object.keys(capped).sort()).toEqual(["mid.json", "new.json"]);
  });

  it("defaults to the documented limit", () => {
    expect(COLLAPSE_STATE_LIMIT).toBe(50);
    let s: CollapseStates = {};
    for (let i = 0; i < 60; i++) s = recordFileState(s, `f${i}.json`, [], i);
    expect(Object.keys(capStates(s)).length).toBe(50);
  });
});
