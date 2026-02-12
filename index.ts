import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";

import { errorStatus, status } from "./lib/logging";
import { parseBugInput, type BugInput } from "./lib/bug";
import { buildPrompt, buildSystemMessage } from "./lib/prompt";
import { formatError } from "./lib/errors";
import { runCopilotSession } from "./lib/session";

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
      "\nBug JSON schema:\n  {\n    \"title\": \"Bug title\",\n    \"description\": \"Detailed description of the bug\",\n    \"localRepoUrls\": [\"/absolute/path/to/local/repo\"],\n    \"imagePaths\": [\"/absolute/path/to/screenshot.png\"]\n  }\n\nNotes:\n- localRepoUrl (string) is still supported for a single repository.\n- imagePaths is optional.",
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

const resolveRepoPaths = async (repoUrls: string[]) => {
  if (repoUrls.length === 0) {
    throw new Error("At least one repository path must be provided.");
  }

  const resolved = await Promise.all(
    repoUrls.map(async (repoUrl) => {
      const repoPath = path.resolve(repoUrl);
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

const resolveImagePaths = async (imagePaths?: string[]) => {
  if (!imagePaths || imagePaths.length === 0) {
    return [];
  }

  const resolved = await Promise.all(
    imagePaths.map(async (imagePath) => {
      const resolvedPath = path.resolve(imagePath);
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

const main = async () => {
  const program = buildProgram();
  program.parse(process.argv);

  const bugJsonPath = path.resolve(program.args[0] as string);
  const bug = await readBugInput(bugJsonPath);
  const repoPaths = await resolveRepoPaths(bug.localRepoUrls);
  const imagePaths = await resolveImagePaths(bug.imagePaths);
  const workingDirectory = findCommonAncestor(repoPaths);
  const normalizedBug: BugInput = {
    ...bug,
    localRepoUrls: repoPaths,
    imagePaths: imagePaths.length > 0 ? imagePaths : undefined,
  };

  status(`📂 Using repositories:\n${repoPaths.map((repoPath) => `- ${repoPath}`).join("\n")}`);
  status(`📍 Working directory: ${workingDirectory}`);
  process.chdir(workingDirectory);

  const prompt = buildPrompt(normalizedBug, repoPaths);
  const attachments = buildAttachments(repoPaths, imagePaths);
  await runCopilotSession({
    prompt,
    systemMessage: buildSystemMessage(),
    model: resolveModel(),
    attachments,
    workingDirectory,
  });
};

try {
  await main();
} catch (error) {
  errorStatus(`Error: ${formatError(error)}`);
  process.exitCode = 1;
}
