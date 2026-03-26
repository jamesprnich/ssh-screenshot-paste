# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-03-26

### Added

- Unit tests for fileWriter (17 tests covering path traversal, cleanup, gitignore management)

### Changed

- Gitignore management is now opt-in via `manageGitignore` setting (default off)
- Extension no longer marked as preview
- New extension icon (SSH shield design)
- Updated README with "Why this extension?" positioning section

## [0.1.1] - 2026-03-09

### Added

- Intercept Cmd+V in remote terminals to paste clipboard screenshots as file paths
- Save screenshots to `.vscode-screenshots/` in the workspace root via `workspace.fs`
- Auto-add `.vscode-screenshots/` to `.gitignore`
- Auto-cleanup of screenshots older than configurable retention period (default 30 days)
- Transparent fallback to normal paste when clipboard has text or not in a remote session
- Requires `pngpaste` (`brew install pngpaste`) for reliable clipboard image reading
