# Copilot Instructions for bug-finder-cli

## Project Overview

This is a CLI tool that analyzes bug descriptions against local repositories using the GitHub Copilot SDK. It takes a bug JSON file as input, attaches one or more local repositories, and uses an AI agent to perform root-cause analysis.

**Runtime**: Bun (not Node.js)
**Language**: TypeScript with strict type checking

## Commands

### Running the CLI

```bash
bun run index.ts /path/to/bug.json
```

### Installing dependencies

```bash
bun install
```

### Notes

- No test, lint, or build commands currently exist in this project
- The entry point is `index.ts` (not a compiled binary)
- TypeScript is configured with `noEmit: true` (bundler mode)

## Architecture

### Data Flow

1. **Input Processing** (`index.ts`)
   - Parse bug JSON with `parseBugInput()` from `lib/bug.ts`
   - Resolve and validate repository paths and optional image paths
   - Find common ancestor directory to use as working directory
   - Build attachments array for Copilot SDK

2. **Copilot Session** (`lib/session.ts`)
   - Initialize `CopilotClient` with CLI path and log directory
   - Create session with system message and working directory
   - Register event listeners for progress tracking (intent, reasoning, tool execution)
   - Send prompt with attachments and wait for completion

3. **Output** (`lib/output.ts`, `lib/logging.ts`)
   - Progress/status messages → stderr (colored with chalk)
   - AI analysis report → stdout (can be redirected/piped)
   - Ensures clean separation for scripting use cases

### Key Modules

- **`lib/bug.ts`**: Bug JSON schema validation and parsing
- **`lib/prompt.ts`**: System message and user prompt construction
- **`lib/session.ts`**: Copilot SDK client lifecycle and event handling
- **`lib/logging.ts`**: Status/error messages to stderr
- **`lib/output.ts`**: Report output to stdout
- **`lib/toolUsage.ts`**: Format tool execution summaries for logging
- **`lib/errors.ts`**: Error formatting utilities

## Key Conventions

### Bug JSON Schema

The input supports both legacy single-repo format (`localRepoUrl` string) and multi-repo format (`localRepoUrls` array). Always use the plural form in new code:

```typescript
// Parsing handles both formats
localRepoUrls: record.localRepoUrls !== undefined
  ? requireNonEmptyStringArray(record.localRepoUrls, "localRepoUrls")
  : [requireNonEmptyString(record.localRepoUrl, "localRepoUrl")]
```

### Working Directory Selection

When multiple repositories are provided, the CLI finds their common ancestor and uses it as the Copilot session's working directory. This ensures all repos are accessible via relative paths.

### Output Separation

- **stdout**: AI-generated report only (formatted with exact emoji headings: 🐛 Probable Cause, 💡 Reason, 🔧 Suggested Fixes, 📊 Confidence Score)
- **stderr**: All progress updates, status messages, errors

This separation enables piping the report without noise: `bun run index.ts bug.json > report.txt`

### Model Override

The default model is `gpt-4.1`, but can be overridden with `COPILOT_MODEL` environment variable:

```bash
COPILOT_MODEL=gpt-5 bun run index.ts bug.json
```

### TypeScript Strictness

The project uses strict TypeScript with additional flags:
- `noUncheckedIndexedAccess: true` - array/object access may be undefined
- `noImplicitOverride: true` - require explicit `override` keyword
- Ensure null checks when accessing array elements or object properties
