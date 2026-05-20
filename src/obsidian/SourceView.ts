import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

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
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
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

  /** Test-only helper: simulates a user-initiated insert at position. */
  dispatchInsertForTest(from: number, text: string): void {
    if (!this.view) return;
    this.view.dispatch({ changes: { from, insert: text } });
  }
}
