---
name: ssh-screenshot-paste-release
description: Release process for the SSH Screenshot Paste VS Code extension. Use when asked to release, publish, or version bump.
license: MIT
compatibility: ">=1.0.0"
metadata:
  author: jamesprnich
  version: "1.0"
  description: Works with any agent that can read and write code.
---

# SSH Screenshot Paste — Release Skill

Execute this skill when asked to release, publish, or version-bump the extension. Follow every step in order. Do not skip steps. Stop on any failure unless the step says otherwise.

## Step 1: Pre-release checks

Run all checks and collect results before presenting them. Do not stop at the first failure — run everything, then report.

| # | Check | Command / Action | Pass criteria |
|---|-------|-----------------|---------------|
| 1 | TypeScript compiles | `npm run check-types` | Exit code 0 |
| 2 | VSIX builds clean | `npx vsce package` | Produces `.vsix` file without errors |
| 3 | README has no TODOs / placeholders | Scan `README.md` for `TODO`, `FIXME`, `<!-- Uncomment` | None found (commented-out Marketplace badges are expected before first publish — flag them but don't fail) |
| 4 | CHANGELOG has entry for current version | Parse `CHANGELOG.md` | Entry exists for the version in `package.json` |
| 5 | package.json version matches latest CHANGELOG entry | Compare `package.json` `version` with the first `## [x.y.z]` in `CHANGELOG.md` | Match |
| 6 | Icon exists | Check `resources/icon.png` | File exists |
| 7 | .vscodeignore excludes dev files | Verify `src/`, `node_modules/`, `.git/`, `CLAUDE.md` are in `.vscodeignore` | All present (note: `node_modules/` is excluded by vsce by default, but `src/` and `.git/` must be explicit) |
| 8 | No secrets or dev files in VSIX | Run `npx vsce ls` and inspect output | Only expected files: `out/`, `resources/`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`. `SKILL.md` and `CLAUDE.md` must NOT be included. |
| 9 | CHANGELOG covers all changes | Run `git diff` (or `git log` since last tag) and compare against the CHANGELOG entry for the current version. Every user-facing change (new features, behaviour changes, removed features, new settings, icon changes) must be mentioned. Internal-only changes (refactors, test additions, CI tweaks, dev tooling) should also be listed if notable. | All changes accounted for — flag any that are missing and do not proceed until resolved |
| 10 | No stale version strings | Grep the repo for the previous version string, excluding `node_modules/`, `CHANGELOG.md`, and `*.vsix`. | No matches found. If any file still references the old version, flag it — it likely needs updating. |

**Present results** as a checklist:

```
Pre-release checks:
  [PASS] TypeScript compiles
  [PASS] VSIX builds clean
  [WARN] README has commented-out Marketplace badges (expected before first publish)
  [PASS] CHANGELOG entry exists for 0.1.0
  ...
```

**If any check fails (not warns), stop here.** Report the failures and do not proceed until the user fixes them.

## Step 2: Version decision

Tell the user the current version from `package.json` and ask what the new version should be. Present semver options:

- **patch** (x.x.+1) — bug fixes only
- **minor** (x.+1.0) — new features, backwards-compatible
- **major** (+1.0.0) — breaking changes

If this is the initial publish and the current version is already correct (e.g., `0.1.0` for a first release), confirm with the user that no bump is needed.

Wait for the user's answer before continuing.

## Step 3: Update version and changelog

1. **Bump version** in `package.json` to the new version (skip if user confirmed current version is correct).

2. **Add changelog entry** in [Keep a Changelog](https://keepachangelog.com/) format at the top of the release list in `CHANGELOG.md`:

   ```markdown
   ## [{version}] - {YYYY-MM-DD}

   ### Added
   - ...

   ### Changed
   - ...

   ### Fixed
   - ...
   ```

   Use only the sections that apply. Ask the user what changed, or summarise `git log` since the last tag if one exists.

3. **Marketplace badges** — if `README.md` has commented-out Marketplace badges (`<!-- Uncomment after publishing:`) and this is the first publish, ask the user whether to uncomment them now or after confirming the listing is live.

## Step 4: Rebuild VSIX

1. Delete any existing `.vsix` files in the repo root.
2. Run `npx vsce package`.
3. Confirm the `.vsix` was created and report the filename and file size.

## Step 5: Commit

1. Stage the changed files: `package.json`, `CHANGELOG.md`, and `README.md` (if changed).
2. Commit with message: `Release v{version}`
3. Do **NOT** push yet.

## Step 6: Tag and publish decision

Ask the user:

> Ready to tag `v{version}` and push?
>
> - If `VSCE_PAT` secret is configured in GitHub, pushing the tag triggers auto-publish via GitHub Actions (`.github/workflows/publish.yml`).
> - If not, you can manually upload the VSIX at https://marketplace.visualstudio.com/manage.

**If user approves push:**

1. `git tag v{version}`
2. `git push` (push the commit)
3. `git push --tags` (push the tag — triggers publish workflow if PAT is configured)

**If user wants manual upload only:**

1. `git tag v{version}`
2. Ask user if they want to push the commit and tag (without relying on auto-publish), or keep everything local.
3. Point user to the built `.vsix` file path for manual upload at https://marketplace.visualstudio.com/manage.

## Step 7: Post-release verification

- If tags were pushed, check GitHub Actions: `gh run list --limit 3`
- Report the Marketplace URL: https://marketplace.visualstudio.com/items?itemName=jamesprnich.ssh-screenshot-paste
- Remind the user to verify the listing appears correctly.

---

## Error handling

| Condition | Behaviour |
|---|---|
| TypeScript compilation fails | Stop. Show errors. Do not proceed. |
| VSIX build fails | Stop. Show errors. Do not proceed. |
| README has uncommented TODOs/FIXMEs | Warn. Ask user to fix before proceeding. |
| CHANGELOG missing entry for new version | Create one — ask user for change summary. |
| No git changes to commit | Skip commit step if version wasn't bumped. |
| Push fails | Report error. VSIX is still available for manual upload. |
| `vsce` not installed | Run `npm install` first (it's a devDependency). |
