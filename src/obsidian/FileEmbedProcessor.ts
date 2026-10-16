import { type App, type MarkdownPostProcessorContext, TFile } from "obsidian";
import type { CodeblockLang } from "./CodeblockProcessor";
import { renderJsonCodeblock } from "./CodeblockProcessor";
import type { JsonEditorSettings } from "./SettingsTab";

/** Groesser als das lassen wir den Standard-Chip stehen: ein Embed liest die ganze Datei und rendert sie im Lesemodus. */
const MAX_EMBED_BYTES = 512 * 1024;

const JSON_EXT = /\.(jsonc?)$/i;

/** `![[Datei.json]]` im Lesemodus: statt des Datei-Chips der Inhalt als eingeklappter, schreibgeschuetzter Baum.
 *  Der Baum ist derselbe wie im Code-Block (`renderJsonCodeblock`); die Kopfzeile traegt den Dateinamen statt „JSON“.
 *  Ein Embed mit Ueberschrift oder Block (`#…`) und ein fremdes Format bleiben unberuehrt. */
export function processJsonFileEmbeds(
  app: App,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  settings: JsonEditorSettings,
): void {
  const embeds = Array.from(el.querySelectorAll<HTMLElement>(".internal-embed[src]"));
  for (const embed of embeds) {
    const src = embed.getAttribute("src") ?? "";
    // Obsidian haengt bei `![[x.json|Alias]]` den Alias an `src`, bei `#Teil` den Teil: beides gehoert nicht zum Pfad.
    const linkpath = src.split("|")[0]?.split("#")[0] ?? "";
    const ext = JSON_EXT.exec(linkpath);
    if (!ext || src.includes("#")) continue;
    const file = app.metadataCache.getFirstLinkpathDest(linkpath, ctx.sourcePath);
    if (!(file instanceof TFile)) continue;
    if ((file.stat?.size ?? 0) > MAX_EMBED_BYTES) continue;
    const lang: CodeblockLang = ext[1]?.toLowerCase() === "jsonc" ? "jsonc" : "json";
    void app.vault
      .cachedRead(file)
      .then((text) => {
        if (!embed.isConnected) return;
        embed.empty();
        embed.classList.add("json-file-embed");
        // Eingeklappt: nur die oberste Ebene steht offen, der Rest klappt der Leser selbst auf.
        renderJsonCodeblock(text, embed, ctx, { ...settings, autoCollapseDepth: 0 }, lang);
        const label = embed.querySelector(".json-codeblock-label");
        if (label)
          label.textContent = embed.querySelector(".is-error") ? `${file.name} · error` : file.name;
      })
      .catch(() => undefined);
  }
}
