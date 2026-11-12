// vendored from obsidian-kit@0.82.2, src/obsidian/write-ports.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Herkunft: 3d-codeblocks `src/obsidian/write-ports.ts` (gehoben 2026-11-02, nur der Import auf
// `../pure/block-writer` ist angepasst).
// Die Obsidian-Seite der Schreib-Ports aus `block-writer.ts`. Bewusst winzig:
// alle Entscheidungen liegen im testbaren Schreiber, hier ist nur der Zugriff.
import { MarkdownView, TFile, type App } from "obsidian";
import type { EditorHandle, WritePorts } from "../kit/block-writer";

export function obsidianWritePorts(app: App): WritePorts {
  return {
    editorFor(path: string): EditorHandle | null {
      for (const leaf of app.workspace.getLeavesOfType("markdown")) {
        const view = leaf.view;
        // `getMode() === "source"` ist nicht optional: im Lesemodus existiert
        // `view.editor`, ist aber nicht der Puffer, den Obsidian anzeigt und
        // speichert. Ein `replaceRange` darauf verpufft LAUTLOS — kein Wurf,
        // kein Fehler, der Aufrufer meldet "View saved" und die Notiz bleibt
        // unveraendert. Ohne den Modus-Check ist das Speichern im Lesemodus
        // also kaputt und sieht dabei aus wie Erfolg. Mit dem Check faellt es
        // auf `vault.process` zurueck, das genau dafuer gebaut ist.
        //
        // Nicht abbrechen, wenn ein Blatt im Lesemodus passt: dieselbe Notiz
        // kann in zwei Blaettern offen sein (eins lesend, eins bearbeitend) —
        // dann gehoert der Editor-Pfad dem bearbeitenden.
        if (
          view instanceof MarkdownView &&
          view.file?.path === path &&
          view.getMode() === "source"
        )
          return view.editor;
      }
      return null;
    },
    vault: {
      async read(path: string): Promise<string> {
        const file = app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`Note not found: ${path}`);
        return app.vault.read(file);
      },
      async process(path: string, fn: (text: string) => string): Promise<void> {
        const file = app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`Note not found: ${path}`);
        // `vault.process` liest, ruft `fn` und schreibt selbst atomar (siehe obsidian.d.ts:
        // "Atomically read, modify, and save"). Nicht vorher selbst lesen und den Text hier
        // festhalten — das waere ein Schnappschuss, der zwischen Aufbau und Aufruf veralten
        // kann. Ein Wurf in `fn` propagiert unveraendert (kein try/catch): das ist Absicht,
        // `writeBlockBody` faengt `BlockChangedError` gezielt ab, alles andere zeigt `save()`
        // in `block-child.ts` als generischen Fehler an.
        await app.vault.process(file, fn);
      },
    },
  };
}
