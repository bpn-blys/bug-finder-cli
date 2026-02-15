# Basic Usage Instructions

## 1) Prerequisites

- Install **Bun**
- Install and authenticate **GitHub Copilot CLI**
  - Verify: `copilot --version`
  - Login: `copilot login`

## 2) Install dependencies

Run in the project folder:

`bun install`

## 3) Prepare your bug file

Create a JSON file (for example `bug.json`) like this:

```json
[
  {
    "title": "Bug title",
    "description": "Detailed description of the bug",
    "status": "todo",
    "bug-details": null,
    "localRepoUrls": ["/absolute/path/to/local/repo"],
    "imagePaths": ["/absolute/path/to/screenshot.png"]
  }
]
```

Notes:
- `status` is optional (`todo`, `in-progress`, `done`)
- `localRepoUrl` (single string) is still supported for legacy single-repo usage
- `imagePaths` is optional

## 4) Run the CLI

`bun run index.ts /path/to/bug.json`

Example:

`bun run index.ts bug.json`

## 5) Optional: view help

`bun run index.ts --help`

## 6) Optional environment overrides

- Model (default: `gpt-4.1`):
  - `COPILOT_MODEL=gpt-5 bun run index.ts bug.json`
- Copilot CLI binary path (default: `~/.local/bin/copilot`):
  - `COPILOT_PATH=/custom/path/to/copilot bun run index.ts bug.json`

## 7) What you get

For each bug entry, the tool fills `bug-details` with structured analysis:
- `probableCause`
- `reason`
- `suggestedFixes`
- `confidenceScore` (0–1)
- `evidence` (when available)

Also:
- Progress/tool logs go to **stderr**
- Bug entries with `todo` / `in-progress` are processed and marked `done`
