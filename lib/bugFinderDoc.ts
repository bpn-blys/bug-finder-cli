import { writeFile, stat } from "node:fs/promises";
import * as path from "node:path";

import { CopilotClient, type MessageOptions } from "@github/copilot-sdk";

import { formatError } from "./errors";
import { status, warnStatus } from "./logging";
import { config, resolveCopilotCliPath, resolveCopilotLogDir } from "../constants/config";

const CLI_PATH = resolveCopilotCliPath();
const LOG_DIR = resolveCopilotLogDir();
const MODEL = process.env[config.copilot.env.model] ?? config.copilot.defaults.model;
const TIMEOUT_MS = config.copilot.defaults.bugFinderDocTimeoutMs;

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
    const docPath = path.join(repoPath, config.files.bugFinderDocName);
    if (await hasBugFinderFile(docPath)) {
      status(`✅ Existing ${config.files.bugFinderDocName} detected at ${docPath}`);
      continue;
    }

    status(`🧩 Generating ${config.files.bugFinderDocName} for ${repoPath}...`);
    let content: string;
    try {
      content = await generateBugFinderDoc(repoPath);
    } catch (error) {
      throw new Error(`Failed to generate ${config.files.bugFinderDocName} for ${repoPath}: ${formatError(error)}`);
    }

    await writeFile(docPath, `${content.trimEnd()}\n`, "utf8");
    status(`💾 Written ${config.files.bugFinderDocName} to ${docPath}`);
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
      systemMessage: { content: config.copilot.bugFinderDocSystemMessage },
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
      throw new Error(`Copilot did not return any content when generating ${config.files.bugFinderDocName}.`);
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

Task: Inspect the attached repository to create a concise ${config.files.bugFinderDocName}.
Outline an Architecture Index section (or similar structure) that lists the most relevant directories/modules followed by a short purpose sentence that describes how each area helps navigate the codebase.
Include any other sections that support navigation (e.g., key entry points, important frameworks).
Return only the markdown content of ${config.files.bugFinderDocName}.
`.trim();
