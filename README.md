# SSH Screenshot Paste

The original native Cmd+V screenshot extension for VS Code Remote-SSH.

Cmd+V screenshots from your Mac clipboard into remote SSH terminals. Everywhere else, paste works exactly as it always does — the extension only activates when you need it.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/jamesprnich.ssh-screenshot-paste)](https://marketplace.visualstudio.com/items?itemName=jamesprnich.ssh-screenshot-paste)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/jamesprnich.ssh-screenshot-paste)](https://marketplace.visualstudio.com/items?itemName=jamesprnich.ssh-screenshot-paste)

## Why this extension?

There are several extensions that paste images into VS Code terminals. They all require a separate keyboard shortcut — Ctrl+Alt+V, Alt+I, or similar. That means you have to remember which shortcut to use and when.

This extension just uses **Cmd+V**. It only activates when you're in a remote SSH terminal with an image on your clipboard — everywhere else, Cmd+V works exactly as it always does. Paste in your editor, paste in a local terminal, paste text into a remote terminal — all normal. The only time the extension steps in is the one moment you actually need it. Nothing to remember, nothing to configure.

## How it works

While connected to a remote host via [Remote-SSH](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh), with a workspace folder open:

1. You take a screenshot on your Mac (Cmd+Ctrl+Shift+4)
2. You Cmd+V in a remote terminal in VS Code
3. The extension saves the PNG to `.vscode-screenshots/` in the workspace on the remote host
4. The file path is typed into the terminal (without pressing Enter)
5. If the clipboard has text instead of an image, normal paste happens — no interference

The extension only activates when **all three** conditions are met: remote SSH session + terminal focused + image on clipboard. Otherwise it's invisible.

Perfect for Claude Code running on remote VMs — paste a screenshot and the path is ready for your prompt.

## Prerequisites

Install [pngpaste](https://github.com/jcsalterego/pngpaste) on your Mac:

```bash
brew install pngpaste
```

## Requirements

- **macOS** — uses `pngpaste` for clipboard image reading
- **VS Code Remote-SSH** — the extension runs locally on your Mac and writes files to the remote via `workspace.fs`
- An open workspace folder on the remote host

## Features

- **Transparent Cmd+V** — no new shortcuts to learn, just paste as normal
- **Remote-first** — files are saved on the remote host, not locally
- **Optional git exclusion** — automatically add `.vscode-screenshots/` to `.gitignore` (opt-in via settings)
- **Auto cleanup** — screenshots older than 30 days are deleted (configurable)
- **Non-intrusive** — only activates in remote SSH terminals with an image on the clipboard. Local terminals, text paste, and non-remote sessions are completely unaffected
- **Zero config** — works out of the box, settings are optional

## Settings

| Setting | Default | Description |
|---|---|---|
| `terminalScreenshotPaste.screenshotDir` | `.vscode-screenshots` | Directory name in the workspace root for saving screenshots |
| `terminalScreenshotPaste.retentionDays` | `30` | Delete screenshots older than this many days. Set to 0 to keep forever. |
| `terminalScreenshotPaste.manageGitignore` | `false` | Auto-add screenshot directory to `.gitignore` |

## Troubleshooting

If pasting doesn't work, check the output log: **View → Output** → select **SSH Screenshot Paste** from the dropdown.

Common issues:

- **"pngpaste is not installed"** — run `brew install pngpaste` on your Mac
- **"No workspace folder open"** — open a folder on the remote host (File → Open Folder)
- **Normal paste happens instead of screenshot** — make sure you copied to clipboard with **Cmd+Ctrl+Shift+4** (not just Cmd+Shift+4, which saves to a file)

## Contributing

Issues and pull requests are welcome at [github.com/jamesprnich/ssh-screenshot-paste](https://github.com/jamesprnich/ssh-screenshot-paste).

## License

[MIT](LICENSE)

![](https://cloud.umami.is/p/cWZVxr2Zz)
