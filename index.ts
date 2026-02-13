import { readFile, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";

import { errorStatus, status } from "./lib/logging";
import { parseBugInput, type BugFinding, type BugInput, type BugRecord } from "./lib/bug";
import { buildPrompt, buildSystemMessage } from "./lib/prompt";
import { formatError } from "./lib/errors";
import { runCopilotSession } from "./lib/session";
import { ensureBugFinderDocs } from "./lib/bugFinderDoc";

type Attachments = NonNullable<Parameters<typeof runCopilotSession>[0]["attachments"]>;

const buildProgram = () =>
  new Command()
    .name("bug-finder-cli")
    .description("Analyze a bug description against a local repository using the GitHub Copilot SDK.")
    .argument("<bug.json>", "Path to the bug JSON file")
    .usage("<bug.json>")
    .showHelpAfterError()
    .addHelpText(
      "after",
      '\nBug JSON schema:\n  [\n    {\n      "title": "Bug title",\n      "description": "Detailed description of the bug",\n      "status": "todo",\n      "bug-details": null,\n      "localRepoUrls": ["/absolute/path/to/local/repo"],\n      "imagePaths": ["/absolute/path/to/screenshot.png"]\n    }\n  ]\n\nNotes:\n- status is optional; when omitted it defaults to todo.\n- if provided, status must be one of: todo, in-progress, done.\n- bug-details is optional and is filled with structured findings after analysis.\n- localRepoUrl (string) is still supported for a single repository entry.\n- imagePaths is optional.',
    );

const readBugInput = async (bugJsonPath: string): Promise<BugInput> => {
  status(`📄 Reading bug file: ${bugJsonPath}`);

  const bugFile = await readFile(bugJsonPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bugFile);
  } catch (error) {
    throw new Error(`Failed to parse JSON in ${bugJsonPath}: ${formatError(error)}`);
  }

  return parseBugInput(parsed);
};

const writeBugInput = async (bugJsonPath: string, bugs: BugInput) => {
  await writeFile(bugJsonPath, `${JSON.stringify(bugs, null, 2)}\n`, "utf8");
};

const resolveRepoPaths = async (repoUrls: string[], baseDir: string) => {
  if (repoUrls.length === 0) {
    throw new Error("At least one repository path must be provided.");
  }

  const resolved = await Promise.all(
    repoUrls.map(async (repoUrl) => {
      const repoPath = path.resolve(baseDir, repoUrl);
      const repoStat = await stat(repoPath).catch(() => {
        throw new Error(`Repository path not found: ${repoPath}`);
      });
      if (!repoStat.isDirectory()) {
        throw new Error(`Repository path is not a directory: ${repoPath}`);
      }
      return repoPath;
    }),
  );

  return Array.from(new Set(resolved));
};

const resolveImagePaths = async (imagePaths: string[] | undefined, baseDir: string) => {
  if (!imagePaths || imagePaths.length === 0) {
    return [];
  }

  const resolved = await Promise.all(
    imagePaths.map(async (imagePath) => {
      const resolvedPath = path.resolve(baseDir, imagePath);
      const imageStat = await stat(resolvedPath).catch(() => {
        throw new Error(`Image path not found: ${resolvedPath}`);
      });
      if (!imageStat.isFile()) {
        throw new Error(`Image path is not a file: ${resolvedPath}`);
      }
      return resolvedPath;
    }),
  );

  return Array.from(new Set(resolved));
};

const findCommonAncestor = (repoPaths: string[]) => {
  if (repoPaths.length === 0) {
    throw new Error("At least one repository path must be provided.");
  }

  const resolved = repoPaths.map((repoPath) => path.resolve(repoPath));
  const firstPath = resolved[0];
  if (!firstPath) {
    throw new Error("No repositories found.");
  }

  const parsed = path.parse(firstPath);
  const root = parsed.root || "/";
  let commonParts = firstPath.slice(root.length).split(path.sep).filter(Boolean);

  for (const repoPath of resolved.slice(1)) {
    const parts = repoPath.slice(root.length).split(path.sep).filter(Boolean);
    let matchIndex = 0;
    while (
      matchIndex < commonParts.length &&
      matchIndex < parts.length &&
      commonParts[matchIndex] === parts[matchIndex]
    ) {
      matchIndex += 1;
    }
    commonParts = commonParts.slice(0, matchIndex) as string[];
  }

  return path.join(root, ...commonParts);
};

const buildAttachments = (repoPaths: string[], imagePaths: string[]) => {
  const attachments: Attachments = [];

  for (const repoPath of repoPaths) {
    attachments.push({
      type: "directory",
      path: repoPath,
      displayName: path.basename(repoPath),
    });
  }

  for (const imagePath of imagePaths) {
    attachments.push({
      type: "file",
      path: imagePath,
      displayName: path.basename(imagePath),
    });
  }

  return attachments.length > 0 ? attachments : undefined;
};

const resolveModel = () => process.env.COPILOT_MODEL ?? "gpt-4.1";

const requireString = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Copilot response field "${field}" must be a non-empty string.`);
  }
  return value.trim();
};

const parseFindings = (report: string): BugFinding => {
  const trimmed = report.trim();
  if (trimmed.length === 0) {
    throw new Error("Copilot response was empty; expected a JSON findings object.");
  }
  const codeFenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonPayload = (codeFenceMatch?.[1] ?? trimmed).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonPayload);
  } catch (error) {
    throw new Error(`Failed to parse Copilot findings JSON: ${formatError(error)}`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Copilot findings must be a JSON object.");
  }

  const record = parsed as Record<string, unknown>;
  const confidenceScore = record.confidenceScore;
  if (typeof confidenceScore !== "number" || !Number.isFinite(confidenceScore)) {
    throw new Error('Copilot response field "confidenceScore" must be a finite number.');
  }
  if (confidenceScore < 0 || confidenceScore > 1) {
    throw new Error('Copilot response field "confidenceScore" must be between 0 and 1.');
  }
  if (!Array.isArray(record.suggestedFixes)) {
    throw new Error('Copilot response field "suggestedFixes" must be an array of strings.');
  }

  return {
    probableCause: requireString(record.probableCause, "probableCause"),
    reason: requireString(record.reason, "reason"),
    suggestedFixes: record.suggestedFixes.map((value, index) => requireString(value, `suggestedFixes[${index}]`)),
    confidenceScore,
    evidence: record.evidence,
  };
};

const main = async () => {
  const program = buildProgram();
  program.parse(process.argv);

  const bugJsonPath = path.resolve(program.args[0] as string);
  const bugFileDir = path.dirname(bugJsonPath);
  const bugs = await readBugInput(bugJsonPath);

  for (const [index, bug] of bugs.entries()) {
    const currentStatus = bug.status ?? "todo";
    if (currentStatus === "done") {
      status(`⏭️ Skipping bug ${index + 1}/${bugs.length} (status: done).`);
      continue;
    }

    const inProgressBug: BugRecord = { ...bug, status: "in-progress" };
    bugs[index] = inProgressBug;
    await writeBugInput(bugJsonPath, bugs);

    status(`🐞 Processing bug ${index + 1}/${bugs.length}: ${bug.title}`);
    const repoPaths = await resolveRepoPaths(inProgressBug.localRepoUrls, bugFileDir);
    await ensureBugFinderDocs(repoPaths);
    const imagePaths = await resolveImagePaths(inProgressBug.imagePaths, bugFileDir);
    const workingDirectory = findCommonAncestor(repoPaths);
    const normalizedBug: BugRecord = {
      ...inProgressBug,
      localRepoUrls: repoPaths,
      imagePaths: imagePaths.length > 0 ? imagePaths : undefined,
    };

    status(`📂 Using repositories:\n${repoPaths.map((repoPath) => `- ${repoPath}`).join("\n")}`);
    status(`📍 Working directory: ${workingDirectory}`);
    process.chdir(workingDirectory);

    const prompt = buildPrompt(normalizedBug, repoPaths);
    const attachments = buildAttachments(repoPaths, imagePaths);
    const report = await runCopilotSession({
      prompt,
      systemMessage: buildSystemMessage(),
      model: resolveModel(),
      attachments,
      workingDirectory,
    });
    const findings = parseFindings(report);

    bugs[index] = {
      ...normalizedBug,
      status: "done",
      "bug-details": findings,
    };
    await writeBugInput(bugJsonPath, bugs);
  }
};

try {
  await main();
} catch (error) {
  errorStatus(`Error: ${formatError(error)}`);
  process.exitCode = 1;
}
