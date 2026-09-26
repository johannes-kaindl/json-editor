# Troubleshooting

Each entry starts with what you see — the wording is the plugin's own English text — then the cause and what to do. If yours is not here, see [Getting help](#getting-help).

## Invalid JSON at line …

> Invalid JSON at line 3, column 5: …

**Cause:** the file (banner above the editor) or a code block in a note (error card) does not parse. `.json` is strict: comments and trailing commas are errors.

**Fix:** the message gives line and column. In a `.json` file switch to **Source** and correct it. If you want comments, rename the file to `.jsonc`, or start the code block with ```` ```jsonc ````. For a broken code block the **Repair** button can propose a fix (see [below](#the-repair-says-no-reachable-llm-endpoint)).

## Large file — opened in Source mode

> Large file — opened in Source mode to stay responsive; tree rendering may freeze the UI.

**Cause:** the file is past the render budget (about 1 MB or 15,000 nodes), so the tree is not built automatically.

**Fix:** edit in Source mode, or press **Load tree anyway** in the banner if you accept a slow tree.

## The tree is read-only: numbers JSON can't represent exactly

> This file contains numbers JSON can't represent exactly (e.g. integers larger than 2^53). Tree editing is disabled to avoid silently rewriting them — switch to Source mode to edit.

**Cause:** JavaScript would round such integers (64-bit IDs, for example) when the tree re-writes the file.

**Fix:** switch to **Source** mode and edit the text there; nothing is rewritten.

## Object keys changed order after a tree edit

**Cause:** a tree edit re-serialises the document, and JavaScript orders keys that look like integers (`"10"`, `"2"`) first, numerically.

**Fix:** where the order of such keys matters, edit in Source mode.

## "another plugin already handles .json"

> JSON editor: another plugin already handles .json — file view disabled, code-block rendering still active.

**Cause:** Obsidian lets only one plugin open a file extension, and another installed plugin claimed `.json` (or `.jsonc`) first.

**Fix:** disable the other plugin, or use it for files and this one only for code blocks in notes, which keep working. Restart Obsidian after changing it.

## This file is empty

> This file is empty — Create an empty object to get started.

**Cause:** the file has no content, so there is nothing to show as a tree.

**Fix:** press **Create empty object**, or switch to Source and type.

## Schema not loaded

> Schema not loaded — …

**Cause:** with **Validate against JSON schema** on, the plugin looked for a sibling `<name>.schema.json` (suffix from **Companion schema suffix**) and could not use it — the text after the dash says why (not valid JSON, not a valid draft-07 schema, too large). Nothing is validated then.

**Fix:** fix the schema file. No banner and no red rows at all usually means the setting is still off — it is off by default.

## The repair says "No reachable LLM endpoint"

> No reachable LLM endpoint — set one up in the plugin settings.

**Cause:** none of the addresses under **Settings → JSON Editor → Repair with an LLM → Endpoints** answered. Each row shows its own status:

| Row status | Meaning |
|---|---|
| Connection refused — server not running or wrong port. | The server is off, or the port in the address is wrong. |
| Unknown host — typo in the address? | The host name does not resolve. |
| Timed out — network unreachable. | The machine is not reachable from here. |
| Answers, but is not an OpenAI-compatible endpoint. | Something answers, but it is not a chat-completions server. |
| Access denied — API key missing or invalid. | The server wants an API key. Enter it on that row. |

**Fix:** start the server and load a model, then press **Test connection**. Local servers usually need a port, for example `http://127.0.0.1:1234`. With the LLM Endpoint Manager installed, the endpoints come from there.

## The model's answer is not valid JSON

> The model's answer is not valid JSON: …

**Cause:** the proposal is checked with the parser that rejected your block; an invalid answer can never be applied.

**Fix:** press **Try again**, or use a larger model. Nothing was written to your note.

## The note changed since the request

> The note changed since the request — nothing was written. Run the repair again.

**Cause:** you (or a sync) edited the note between the request and **Apply**, so the proposal no longer fits.

**Fix:** run the repair again.

## Other repair messages

| Message | Meaning |
|---|---|
| The cursor is not inside a ```` ```json ```` or ```` ```jsonc ```` code block. | The command *Repair JSON in the current code block* needs the cursor inside a block. |
| This code block is already valid JSON — nothing to repair. | There is nothing to fix. |
| The model did not answer within {n} seconds. | Raise **Timeout (seconds)** in the settings. |
| The model returned the document unchanged. | The model saw nothing to change; try again or edit by hand. |
| The endpoint's API key is missing in the LLM Endpoint Manager. | Enter the key in the manager. |

## Getting help

Open an issue at <https://github.com/johannes-kaindl/json-editor/issues>. Say which Obsidian version and platform you use, what you did, and the exact text of any message.
