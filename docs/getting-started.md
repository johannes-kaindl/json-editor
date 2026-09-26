# Getting started

This walk-through takes you from a fresh install to an edited `.json` file, a `.jsonc` file with comments and a JSON code block in a note. It needs about five minutes and no extra setup.

## 1. Install and enable the plugin

Follow one of the [install routes in the README](https://github.com/johannes-kaindl/json-editor/blob/main/README.md#install), then enable **JSON Editor** under **Settings → Community plugins**.

## 2. Open a `.json` file

Create a file `example.json` in your vault (for instance with a file manager, or a note and a rename) with this content:

```json
{
  "name": "demo",
  "tags": ["a", "b"],
  "nested": { "count": 3, "active": true }
}
```

Click it in the file explorer. It opens in the plugin's view, in **Tree** mode: a toolbar with the path, a search field and the **Tree / Source** pills sits above a collapsible tree.

## 3. Edit in the tree

1. Click the value `3`, type `4` and press <kbd>Enter</kbd> (<kbd>Esc</kbd> cancels).
2. Hover the row `tags`: the buttons ✎ (rename key), ✕ (delete), `⋮⋮` (drag to reorder) and `T` (change the JSON type) appear. Use `+ Add item` at the bottom of `tags` to append an entry.
3. Press <kbd>Cmd/Ctrl</kbd>+<kbd>Z</kbd> to undo, <kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> to redo. Undo spans tree and source mode.

## 4. Switch to Source

Click **Source** in the toolbar, or press <kbd>Cmd/Ctrl</kbd>+<kbd>E</kbd>. The file is now plain text with syntax highlighting; <kbd>Cmd/Ctrl</kbd>+<kbd>F</kbd> opens find. Break the file on purpose (delete a comma): a banner names the line and column. Undo, and it is valid again.

## 5. Try `.jsonc` with comments

Create `settings.jsonc`:

```jsonc
{
  // the port the server listens on
  "port": 8080,
  "debug": false // turn on while testing
}
```

Change `port` in the tree and switch to Source: both comments are still where you put them. `.json` files stay strict; comments there are an error.

## 6. Render JSON inside a note

In any Markdown note, write a fenced block:

````markdown
```json
{ "feature": "tree-rendered", "collapsible": true }
```
````

In reading view and Live Preview it renders as a collapsible tree card, read-only. An invalid block shows an error card with the parser's message instead — and a **Repair** button if you have set up an LLM endpoint (see [Repair with an LLM](https://github.com/johannes-kaindl/json-editor/blob/main/README.md#repair-with-an-llm)).

## Where next

Every setting is listed under [Configuration](https://github.com/johannes-kaindl/json-editor/blob/main/README.md#configuration) in the README. If something behaves differently from this page, see [Troubleshooting](troubleshooting.md).
