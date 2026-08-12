export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonPath = (string | number)[];

export type ParseResult =
  | { ok: true; value: JsonValue }
  | { ok: false; error: string; line: number; col: number };

export type MarkerStyle = "modern" | "classic";

export interface RenderOptions {
  /**
   * The Document to create elements in. Injected by the caller (the adapter
   * passes `container.ownerDocument`) so core/render stays Obsidian-free and
   * works correctly in pop-out windows. Tests pass the happy-dom `document`.
   */
  doc: Document;
  /**
   * Element factory. The core must not call `document.createElement` itself:
   * Obsidian requires plugins to build DOM through its own `createEl` helpers
   * (obsidianmd/prefer-create-el), and the core must stay Obsidian-free. The
   * adapter therefore injects Obsidian's helper; tests inject the plain one.
   * `doc` remains for `createElementNS`, which has no createEl equivalent.
   */
  makeEl: <K extends keyof HTMLElementTagNameMap>(tag: K) => HTMLElementTagNameMap[K];
  readonly?: boolean;
  markerStyle?: MarkerStyle;
  autoCollapseDepth?: number;
  onValueClick?: (path: JsonPath, currentValue: JsonValue) => void;
  onCollapse?: (path: JsonPath, collapsed: boolean) => void;
  onPathClick?: (path: JsonPath) => void;
  onValueHover?: (target: HTMLElement, path: JsonPath, value: JsonValue) => void;
}

export interface SerializeOptions {
  indent: number | "\t";
}

export interface SearchOptions {
  matchKeys?: boolean;
  matchValues?: boolean;
}

export interface SearchResult {
  matches: Set<string>;
  onPath: Set<string>;
  counts: { keys: number; values: number };
}
