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
{
  "title": "Bug title",
  "description": "Detailed description of the bug",
  "localRepoUrls": ["/absolute/path/to/local/repo"],
  "imagePaths": ["/absolute/path/to/screenshot.png"]
}
```

Notes:
- `localRepoUrl` (string) is still supported for a single repository.
- `imagePaths` is optional.

### Output

The report is printed to stdout with sections:

- 🐛 Probable Cause
- 💡 Reason
- 🔧 Suggested Fixes
- 📊 Confidence Score (0–1)

Progress and tool status updates are printed to stderr.

## Notes

- Optional model override: set `COPILOT_MODEL` (defaults to `gpt-4.1`).
- Repositories missing `bug-finder.md` receive an auto-generated architecture index produced via the Copilot SDK before analysis runs.
- This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
