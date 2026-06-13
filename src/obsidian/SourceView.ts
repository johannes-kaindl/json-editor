import { defaultKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { diffReplaceSpan } from "../core/textdiff";

export interface SourceViewOptions {
  onChange?: (newText: string) => void;
}

export class SourceView {
  private view: EditorView | null = null;
  private suppressChange = false;

  constructor(
    private container: HTMLElement,
    private opts: SourceViewOptions,
  ) {
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

  /**
   * Apply an externally-computed new document text (e.g. an undo/redo restore)
   * as a MINIMAL change rather than a full setValue (audit 2.2). CodeMirror
   * maps the selection through the change, so the cursor is preserved when it
   * lies outside the edited span — and the editor instance is not rebuilt.
   */
  applyExternalEdit(text: string): void {
    if (!this.view) return;
    const span = diffReplaceSpan(this.getValue(), text);
    this.suppressChange = true;
    this.view.dispatch({
      changes: { from: span.from, to: span.to, insert: span.insert },
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

  /** Test-only: set the cursor/selection anchor. */
  _setSelectionForTest(anchor: number): void {
    this.view?.dispatch({ selection: { anchor } });
  }

  /** Test-only: read the selection head offset. */
  _selectionHeadForTest(): number {
    return this.view ? this.view.state.selection.main.head : -1;
  }
}
