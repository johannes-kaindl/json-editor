# Obsidian JSON Editor

View and edit JSON files in Obsidian with a Tree↔Source toggle. Renders `` ```json `` code blocks inside Markdown notes as collapsible trees that respect your theme.

## Features

- **`.json` file view** with a mode toggle: a tree view for browsing and editing primitive values, and a CodeMirror 6 source view with JSON syntax highlighting.
- **Inline editing** of strings, numbers, and booleans in the tree (click a value).
- **Code-block rendering** — `` ```json `` blocks in Markdown notes show as read-only trees.
- **Theme-aware** — uses Obsidian's CSS variables, follows whichever theme you've selected.
- **Settings** — default mode, indent style (2 / 4 / tab), tree marker style (modern / classic), auto-collapse depth.

## Install (manual)

1. Build the plugin: `npm install && npm run build`.
2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsidian-json-editor/` directory.
3. In Obsidian: Settings → Community Plugins → enable "JSON Editor".

## Usage

- **Open a `.json` file** — the plugin's view opens by default.
- **Toggle mode** with the Tree / Source pills in the top-right of the view.
- **Edit values** by clicking them in tree mode. Press Enter to commit, Escape to cancel.
- **Structural changes** (add/rename/remove keys, change types) are done in Source mode.

## Development

```bash
npm install
npm test           # run all Vitest tests
npm run dev        # esbuild watch mode (rebuilds on change)
npm run build      # production build
```

## License

GPL-3.0
