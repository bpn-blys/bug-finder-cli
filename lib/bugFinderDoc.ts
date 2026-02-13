import { writeFile, stat } from "node:fs/promises";
import * as path from "node:path";

import { CopilotClient, type MessageOptions } from "@github/copilot-sdk";

import { formatError } from "./errors";
import { status, warnStatus } from "./logging";

const CLI_PATH = "/home/acutie/.local/bin/copilot";
const LOG_DIR = "./copilot-logs";
const MODEL = process.env.COPILOT_MODEL ?? "gpt-4.1";
const TIMEOUT_MS = 3 * 60 * 1000;

const BUG_FINDER_SYSTEM_MESSAGE = `
You are a documentation engineer who generates concise architecture guides.
Produce only the contents of a bug-finder.md file for the attached repository.
Focus on creating an "Architecture Index" that lists high-level directories or modules with short descriptions (1-2 sentences) and how they relate to the project.
Keep the format purely Markdown and avoid analysis, to-do lists, or narrative text.
`.trim();

type Session = Awaited<ReturnType<CopilotClient["createSession"]>>;

const hasBugFinderFile = async (filePath: string) => {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
};

export const ensureBugFinderDocs = async (repoPaths: string[]) => {
  for (const repoPath of repoPaths) {
    const docPath = path.join(repoPath, "bug-finder.md");
    if (await hasBugFinderFile(docPath)) {
      status(`✅ Existing bug-finder.md detected at ${docPath}`);
      continue;
    }

    status(`🧩 Generating bug-finder.md for ${repoPath}...`);
    let content: string;
    try {
      content = await generateBugFinderDoc(repoPath);
    } catch (error) {
      throw new Error(`Failed to generate bug-finder.md for ${repoPath}: ${formatError(error)}`);
    }

    await writeFile(docPath, `${content.trimEnd()}\n`, "utf8");
    status(`💾 Written bug-finder.md to ${docPath}`);
  }
};

const generateBugFinderDoc = async (repoPath: string) => {
  const client = new CopilotClient({
    cliPath: CLI_PATH,
    logLevel: "debug",
    cliArgs: ["--log-dir", LOG_DIR],
  });
  await client.start();

  let session: Session | undefined;
  try {
    session = await client.createSession({
      model: MODEL,
      streaming: false,
      systemMessage: { content: BUG_FINDER_SYSTEM_MESSAGE },
      workingDirectory: repoPath,
    });

    const attachments: MessageOptions["attachments"] = [
      {
        type: "directory",
        path: repoPath,
        displayName: path.basename(repoPath),
      },
    ];

    const response = await session.sendAndWait({
      prompt: buildBugFinderPrompt(repoPath),
      attachments,
    }, TIMEOUT_MS);

    const content = response?.data?.content?.trim();
    if (!content) {
      throw new Error("Copilot did not return any content when generating bug-finder.md.");
    }

    return content;
  } finally {
    if (session) {
      try {
        await session.destroy();
      } catch (error) {
        warnStatus(`⚠️ Failed to destroy Copilot session for ${repoPath}: ${formatError(error)}`);
      }
    }

    try {
      const stopErrors = await client.stop();
      if (stopErrors.length > 0) {
        warnStatus(`⚠️ Copilot client stop reported errors: ${stopErrors.map((err) => err.message).join("; ")}`);
      }
    } catch (error) {
      warnStatus(`⚠️ Failed to stop Copilot client for ${repoPath}: ${formatError(error)}`);
    }
  }
};

const buildBugFinderPrompt = (repoPath: string) => `
Repository root: ${repoPath}

Task: Inspect the attached repository to create a concise bug-finder.md.
Outline an Architecture Index section (or similar structure) that lists the most relevant directories/modules followed by a short purpose sentence that describes how each area helps navigate the codebase.
Include any other sections that support navigation (e.g., key entry points, important frameworks).
Return only the markdown content of bug-finder.md.
`.trim();
