# bug-finder-cli

Analyze a bug description against a local repository using the GitHub Copilot SDK.

## Prerequisites

- Bun
- GitHub Copilot CLI installed and authenticated (`copilot --version`)

## Install

```bash
bun install
```

## Usage

```bash
bun run index.ts /path/to/bug.json
```

Help:

```bash
bun run index.ts --help
```

### Bug JSON schema

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
- `status` is optional; omitted status is treated as `todo`.
- If provided, `status` must be one of `todo`, `in-progress`, or `done`.
- `bug-details` is optional and is populated with structured findings after analysis.
- `localRepoUrl` (string) is still supported for a single repository entry.
- `imagePaths` is optional.
- Each bug entry with `todo` or `in-progress` is processed and then updated to `done`.

### Output

The model response is requested in JSON and parsed into each entry's `bug-details` object:

- `probableCause`
- `reason`
- `suggestedFixes`
- `confidenceScore` (0–1)
- `evidence` (when available)

Progress and tool status updates are printed to stderr.

## Notes

- Optional model override: set `COPILOT_MODEL` (defaults to `gpt-4.1`).
- Repositories missing `bug-finder.md` receive an auto-generated architecture index produced via the Copilot SDK before analysis runs.
- This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
