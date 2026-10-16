import { type App, type MarkdownPostProcessorContext, TFile } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { processJsonFileEmbeds } from "../../src/obsidian/FileEmbedProcessor";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";

const ctx = {
  sourcePath: "Notes/a.md",
  getSectionInfo: () => null,
} as unknown as MarkdownPostProcessorContext;

function file(path: string, size = 10): TFile {
  const f = new (TFile as unknown as new (p: string) => TFile)(path);
  Object.assign(f, { name: path.split("/").pop() ?? path, stat: { size, ctime: 0, mtime: 0 } });
  return f;
}

function appWith(files: Record<string, { file: TFile; text: string }>): App {
  return {
    metadataCache: { getFirstLinkpathDest: (p: string) => files[p]?.file ?? null },
    vault: {
      cachedRead: async (f: TFile) => Object.values(files).find((x) => x.file === f)?.text ?? "",
    },
  } as unknown as App;
}

function embedHost(src: string): { host: HTMLElement; embed: HTMLElement } {
  const host = document.createElement("div");
  const embed = document.createElement("span");
  embed.className = "internal-embed file-embed";
  embed.setAttribute("src", src);
  embed.textContent = "chip";
  (embed as HTMLElement & { empty: () => void }).empty = () => {
    embed.innerHTML = "";
  };
  host.appendChild(embed);
  document.body.appendChild(host);
  return { host, embed };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("processJsonFileEmbeds", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("replaces the chip of a .json embed with a collapsed read-only tree named after the file", async () => {
    const f = file("data/x.json");
    const { host, embed } = embedHost("data/x.json");
    processJsonFileEmbeds(
      appWith({ "data/x.json": { file: f, text: '{"a": {"b": 1}}' } }),
      host,
      ctx,
      DEFAULT_SETTINGS,
    );
    await flush();
    expect(embed.classList.contains("json-file-embed")).toBe(true);
    expect(embed.textContent).not.toContain("chip");
    expect(embed.querySelector(".json-tree-root")).not.toBeNull();
    expect(embed.querySelector(".json-codeblock-label")?.textContent).toBe("x.json");
    // Ebene 1 ist eingeklappt, die oberste steht offen.
    expect(embed.querySelectorAll(".json-content.collapsed").length).toBeGreaterThan(0);
  });

  it("names a broken file in the error card and still shows an error card, not the chip", async () => {
    const f = file("bad.json");
    const { host, embed } = embedHost("bad.json");
    processJsonFileEmbeds(
      appWith({ "bad.json": { file: f, text: "{not valid}" } }),
      host,
      ctx,
      DEFAULT_SETTINGS,
    );
    await flush();
    expect(embed.querySelector(".json-codeblock.is-error")).not.toBeNull();
    expect(embed.querySelector(".json-codeblock-label")?.textContent).toBe("bad.json · error");
  });

  it("reads a .jsonc embed with comments", async () => {
    const f = file("c.jsonc");
    const { host, embed } = embedHost("c.jsonc");
    processJsonFileEmbeds(
      appWith({ "c.jsonc": { file: f, text: '{\n  // note\n  "a": 1\n}' } }),
      host,
      ctx,
      DEFAULT_SETTINGS,
    );
    await flush();
    expect(embed.querySelector(".json-tree-root")).not.toBeNull();
  });

  it("leaves other files, section embeds, missing files and big files alone", async () => {
    const big = file("big.json", 600 * 1024);
    const cases: [string, Record<string, { file: TFile; text: string }>][] = [
      ["note.md", {}],
      ["data/x.json#part", { "data/x.json": { file: file("data/x.json"), text: "{}" } }],
      ["missing.json", {}],
      ["big.json", { "big.json": { file: big, text: "{}" } }],
    ];
    for (const [src, files] of cases) {
      document.body.innerHTML = "";
      const { host, embed } = embedHost(src);
      processJsonFileEmbeds(appWith(files), host, ctx, DEFAULT_SETTINGS);
      await flush();
      expect(embed.textContent, src).toBe("chip");
    }
  });

  it("strips an alias from the link path", async () => {
    const f = file("data/x.json");
    const { host, embed } = embedHost("data/x.json|Alias");
    processJsonFileEmbeds(
      appWith({ "data/x.json": { file: f, text: "[1]" } }),
      host,
      ctx,
      DEFAULT_SETTINGS,
    );
    await flush();
    expect(embed.classList.contains("json-file-embed")).toBe(true);
  });
});
