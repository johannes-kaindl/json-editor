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
  readonly?: boolean;
  markerStyle?: MarkerStyle;
  autoCollapseDepth?: number;
  onValueClick?: (path: JsonPath, currentValue: JsonValue) => void;
  onCollapse?: (path: JsonPath, collapsed: boolean) => void;
}

export interface SerializeOptions {
  indent: number | "\t";
}
