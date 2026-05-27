import { describe, it, expect, beforeEach } from "vitest";
import { SearchBar } from "../../src/obsidian/SearchBar";

describe("SearchBar", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("getElement returns an HTMLElement with the search-bar class", () => {
    const sb = new SearchBar({ onQueryChange: () => {} });
    const el = sb.getElement();
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.classList.contains("json-search-bar")).toBe(true);
  });

  it("contains an input, clear button, and count element", () => {
    const sb = new SearchBar({ onQueryChange: () => {} });
    const el = sb.getElement();
    expect(el.querySelector(".json-search-input")).toBeInstanceOf(HTMLInputElement);
    expect(el.querySelector(".json-search-clear")).toBeInstanceOf(HTMLButtonElement);
    expect(el.querySelector(".json-search-count")).toBeInstanceOf(HTMLElement);
  });

  it("clear button and count are hidden initially", () => {
    const sb = new SearchBar({ onQueryChange: () => {} });
    const el = sb.getElement();
    const clear = el.querySelector<HTMLElement>(".json-search-clear")!;
    const count = el.querySelector<HTMLElement>(".json-search-count")!;
    expect(clear.hidden).toBe(true);
    expect(count.hidden).toBe(true);
  });

  it("input event fires onQueryChange with current value", () => {
    const calls: string[] = [];
    const sb = new SearchBar({ onQueryChange: (q) => calls.push(q) });
    document.body.appendChild(sb.getElement());
    const input = sb.getElement().querySelector<HTMLInputElement>(".json-search-input")!;
    input.value = "port";
    input.dispatchEvent(new Event("input"));
    expect(calls).toEqual(["port"]);
  });

  it("clear button becomes visible when input has content", () => {
    const sb = new SearchBar({ onQueryChange: () => {} });
    document.body.appendChild(sb.getElement());
    const input = sb.getElement().querySelector<HTMLInputElement>(".json-search-input")!;
    const clear = sb.getElement().querySelector<HTMLElement>(".json-search-clear")!;
    expect(clear.hidden).toBe(true);
    input.value = "x";
    input.dispatchEvent(new Event("input"));
    expect(clear.hidden).toBe(false);
  });

  it("clicking clear empties the input and fires onQueryChange('')", () => {
    const calls: string[] = [];
    const sb = new SearchBar({ onQueryChange: (q) => calls.push(q) });
    document.body.appendChild(sb.getElement());
    const input = sb.getElement().querySelector<HTMLInputElement>(".json-search-input")!;
    const clear = sb.getElement().querySelector<HTMLButtonElement>(".json-search-clear")!;
    input.value = "x";
    input.dispatchEvent(new Event("input"));
    clear.click();
    expect(input.value).toBe("");
    expect(calls).toEqual(["x", ""]);
  });

  it("ESC with content clears input and fires onQueryChange('')", () => {
    const calls: string[] = [];
    const sb = new SearchBar({ onQueryChange: (q) => calls.push(q) });
    document.body.appendChild(sb.getElement());
    const input = sb.getElement().querySelector<HTMLInputElement>(".json-search-input")!;
    input.value = "x";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(input.value).toBe("");
    expect(calls).toEqual(["x", ""]);
  });

  it("setMatchInfo({matchCount:3}) shows '3 matches'", () => {
    const sb = new SearchBar({ onQueryChange: () => {} });
    const count = sb.getElement().querySelector<HTMLElement>(".json-search-count")!;
    sb.setMatchInfo({ matchCount: 3 });
    expect(count.hidden).toBe(false);
    expect(count.textContent).toBe("3 matches");
  });

  it("setMatchInfo({matchCount:1}) shows '1 match' (singular)", () => {
    const sb = new SearchBar({ onQueryChange: () => {} });
    const count = sb.getElement().querySelector<HTMLElement>(".json-search-count")!;
    sb.setMatchInfo({ matchCount: 1 });
    expect(count.textContent).toBe("1 match");
  });

  it("setMatchInfo({matchCount:0}) shows 'no matches' and adds is-empty class", () => {
    const sb = new SearchBar({ onQueryChange: () => {} });
    const count = sb.getElement().querySelector<HTMLElement>(".json-search-count")!;
    sb.setMatchInfo({ matchCount: 0 });
    expect(count.textContent).toBe("no matches");
    expect(count.classList.contains("is-empty")).toBe(true);
  });

  it("setMatchInfo(null) hides the count and clears is-empty", () => {
    const sb = new SearchBar({ onQueryChange: () => {} });
    const count = sb.getElement().querySelector<HTMLElement>(".json-search-count")!;
    sb.setMatchInfo({ matchCount: 0 });
    sb.setMatchInfo(null);
    expect(count.hidden).toBe(true);
    expect(count.classList.contains("is-empty")).toBe(false);
  });

  it("clear() method resets input and hides clear button + count", () => {
    const sb = new SearchBar({ onQueryChange: () => {} });
    const input = sb.getElement().querySelector<HTMLInputElement>(".json-search-input")!;
    const clear = sb.getElement().querySelector<HTMLElement>(".json-search-clear")!;
    input.value = "x";
    input.dispatchEvent(new Event("input"));
    sb.setMatchInfo({ matchCount: 5 });
    sb.clear();
    expect(input.value).toBe("");
    expect(clear.hidden).toBe(true);
  });
});
