# Canvas Read-Only Copy

A small, standalone Obsidian plugin with one purpose: copy highlighted text
from Markdown and text cards while a Canvas is in read-only mode.

## Installation

1. Close Obsidian.
2. Create this folder inside your vault:
   `<your-vault>/.obsidian/plugins/canvas-readonly-copy-fix/`
3. Copy `main.js` and `manifest.json` into that folder.
4. Open Obsidian.
5. Go to **Settings -> Community plugins** and enable **Canvas Read-Only Copy**.

If an earlier version is already installed, replace its `main.js` and
`manifest.json`, then restart Obsidian or reload the plugin.

## Use

1. Open a Canvas and switch it to read-only mode.
2. Highlight text inside a Markdown or text card.
3. Press the normal copy shortcut (`Ctrl+C` on Windows/Linux or `Cmd+C` on
   macOS).

The plugin puts Markdown in the plain-text clipboard format and the selected
rendered content in the HTML clipboard format.

There is also a fallback command:

`Canvas Read-Only Copy: Copy selected text from read-only canvas`

You can assign it a hotkey in **Settings -> Hotkeys**. The fallback command
copies the Markdown/plain-text form.

## Compatibility and limitations

- The plugin deliberately does nothing in Canvas edit mode.
- Cross-origin web-page cards are not supported because browser security blocks
  access to selections inside embedded external sites.
- Obsidian does not expose Canvas read-only state through its public plugin API.
  This plugin uses the Canvas view's internal `readonly` flag and may need a
  small update if Obsidian changes that internal field.

## Development

The plugin is intentionally distributed as a single hand-written `main.js`
file. There is no build step and there are no runtime dependencies.

Run the dependency-free checks with:

```powershell
node --check main.js
node plugin.test.js
```
