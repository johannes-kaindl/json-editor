import { type App, SuggestModal } from "obsidian";

/**
 * "Go to path" — the tree's answer to VS Code's Go to Symbol, in Obsidian's own
 * quick-switcher idiom. Typing a path into a bare text field would be the worse
 * half of the same idea: you cannot type what you do not know exists.
 */
export class GoToPathModal extends SuggestModal<string> {
  constructor(
    app: App,
    private paths: string[],
    truncated: boolean,
    private onChoose: (pathStr: string) => void,
  ) {
    super(app);
    this.setPlaceholder("Go to path…");
    // A capped list must say so — silently showing a prefix reads as "that path
    // does not exist" when it merely fell off the end.
    this.emptyStateText = truncated
      ? `No match in the first ${paths.length} paths of this file`
      : "No matching path";
  }

  getSuggestions(query: string): string[] {
    const q = query.trim().toLowerCase();
    if (q === "") return this.paths;
    return this.paths.filter((p) => p.toLowerCase().includes(q));
  }

  renderSuggestion(pathStr: string, el: HTMLElement): void {
    el.setText(pathStr);
  }

  onChooseSuggestion(pathStr: string, _evt: MouseEvent | KeyboardEvent): void {
    this.onChoose(pathStr);
  }
}
