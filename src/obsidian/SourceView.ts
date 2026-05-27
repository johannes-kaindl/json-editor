import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { defaultKeymap } from "@codemirror/commands";

export interface SourceViewOptions {
  onChange?: (newText: string) => void;
}

export class SourceView {
  private view: EditorView | null = null;
  private suppressChange = false;

  constructor(private container: HTMLElement, private opts: SourceViewOptions) {
    this.mount("");
  }

  private mount(initial: string): void {
    const state = EditorState.create({
      doc: initial,
      extensions: [
        lineNumbers(),
        // History is intentionally NOT installed here — JsonFileView holds the
        // unified cross-mode history (1.2.0). The plugin's "undo-edit" command
        // dispatches to that single source of truth.
        keymap.of(defaultKeymap),
        json(),
        EditorView.updateListener.of((update) => {
          if (this.suppressChange) return;
          if (update.docChanged && this.opts.onChange) {
            this.opts.onChange(update.state.doc.toString());
          }
        }),
      ],
    });
    this.view = new EditorView({ state, parent: this.container });
  }

  setValue(text: string): void {
    if (!this.view) return;
    this.suppressChange = true;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
      annotations: Transaction.addToHistory.of(false),
    });
    this.suppressChange = false;
  }

  getValue(): string {
    return this.view ? this.view.state.doc.toString() : "";
  }

  destroy(): void {
    this.view?.destroy();
    this.view = null;
  }

  /** Test-only helper (leading underscore signals non-public).
   *  Simulates a user-initiated insert at the given position. */
  _dispatchInsertForTest(from: number, text: string): void {
    if (!this.view) return;
    this.view.dispatch({ changes: { from, insert: text } });
  }
}
