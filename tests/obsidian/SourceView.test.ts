import { beforeEach, describe, expect, it } from "vitest";
import { SourceView } from "../../src/obsidian/SourceView";

describe("SourceView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts a CodeMirror editor into its container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SourceView(container, {});
    view.setValue('{"a":1}');
    expect(container.querySelector(".cm-editor")).not.toBeNull();
  });

  it("getValue returns the current document text", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SourceView(container, {});
    view.setValue('{"a":1}');
    expect(view.getValue()).toBe('{"a":1}');
  });

  it("setValue replaces the entire document", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SourceView(container, {});
    view.setValue('{"a":1}');
    view.setValue('{"b":2}');
    expect(view.getValue()).toBe('{"b":2}');
  });

  it("fires onChange after document is updated by user input", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const changes: string[] = [];
    const view = new SourceView(container, { onChange: (text) => changes.push(text) });
    view.setValue("{}");
    view._dispatchInsertForTest(1, '"a":1');
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(view.getValue()).toBe('{"a":1}');
  });

  it("does not fire onChange when setValue is called programmatically", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const changes: string[] = [];
    const view = new SourceView(container, { onChange: (text) => changes.push(text) });
    view.setValue('{"a":1}');
    expect(changes).toEqual([]);
  });

  it("applyExternalEdit updates the value without firing onChange (2.2)", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const changes: string[] = [];
    const view = new SourceView(container, { onChange: (text) => changes.push(text) });
    view.setValue('{"a":1}');
    expect(changes).toEqual([]);
    view.applyExternalEdit('{"a":2}');
    expect(view.getValue()).toBe('{"a":2}');
    expect(changes).toEqual([]);
  });

  it("applyExternalEdit preserves a selection outside the changed span (2.2)", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SourceView(container, {});
    view.setValue('{"name":"a","x":1}');
    view._setSelectionForTest(3); // cursor inside "name", before the change
    view.applyExternalEdit('{"name":"a","x":2}'); // only the trailing 1 -> 2 changes
    expect(view._selectionHeadForTest()).toBe(3);
  });

  it("destroy unmounts the editor", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SourceView(container, {});
    view.setValue("{}");
    view.destroy();
    expect(container.querySelector(".cm-editor")).toBeNull();
  });
});
