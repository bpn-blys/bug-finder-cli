import { CopilotClient, type MessageOptions } from "@github/copilot-sdk";
import chalk from "chalk";
import os from "os";
import path from "path";

import { errorStatus, intentStatus, status, toolStatus, warnStatus } from "./logging";
import { ensureLineBreak, writeStdout } from "./output";
import { formatToolUsage } from "./toolUsage";
import { formatError } from "./errors";

type RunOptions = {
  prompt: string;
  systemMessage: string;
  model?: string;
  cliPath?: string;
  logDir?: string;
  timeoutMs?: number;
  attachments?: MessageOptions["attachments"];
  workingDirectory?: string;
};

type Session = Awaited<ReturnType<CopilotClient["createSession"]>>;

const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_CLI_PATH = path.join(os.homedir(), ".local", "bin", "copilot");
const DEFAULT_LOG_DIR = "./copilot-logs";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

const registerSessionListeners = (
  session: Session,
  formatThinking: (value: string) => string,
  formatReport: (value: string) => string,
) => {
  let streamedOutput = false;
  let reasoningActive = false;

  const beginReasoning = () => {
    if (!reasoningActive) {
      ensureLineBreak("stdout");
      reasoningActive = true;
    }
  };

  const endReasoning = (doubleBreak = false) => {
    if (!reasoningActive) {
      return;
    }
    ensureLineBreak("stdout");
    if (doubleBreak) {
      ensureLineBreak("stdout");
    }
    reasoningActive = false;
  };

  session.on("assistant.intent", (event) => {
    intentStatus(`🧭 Intent: ${event.data.intent}`);
  });

  session.on("assistant.reasoning_delta", (event) => {
    beginReasoning();
    writeStdout(formatThinking(event.data.deltaContent));
  });

  session.on("assistant.reasoning", () => {
    endReasoning();
  });

  session.on("session.info", (event) => {
    status(`ℹ️ ${event.data.infoType}: ${event.data.message}`);
  });

  session.on("session.model_change", (event) => {
    status(`🔁 Model change: ${event.data.previousModel ?? "unknown"} → ${event.data.newModel}`);
  });

  session.on("session.compaction_start", () => {
    status("🧹 Context compaction started.");
  });

  session.on("session.compaction_complete", (event) => {
    if (event.data.success) {
      status("🧹 Context compaction complete.");
    } else {
      warnStatus(`🧹 Context compaction failed: ${event.data.error ?? "unknown error"}`);
    }
  });

  session.on("tool.execution_start", (event) => {
    toolStatus(formatToolUsage(event.data.toolName, event.data.arguments));
  });

  session.on("session.error", (event) => {
    errorStatus(`❌ Session error (${event.data.errorType}): ${event.data.message}`);
  });

  session.on("subagent.started", (event) => {
    status(`🤖 Subagent started: ${event.data.agentDisplayName}`);
  });

  session.on("subagent.completed", (event) => {
    status(`🤖 Subagent completed: ${event.data.agentName}`);
  });

  session.on("subagent.failed", (event) => {
    errorStatus(`🤖 Subagent failed: ${event.data.agentName} - ${event.data.error}`);
  });

  session.on("assistant.message_delta", (event) => {
    endReasoning(true);
    streamedOutput = true;
    writeStdout(formatReport(event.data.deltaContent));
  });

  session.on("assistant.message", (event) => {
    endReasoning();
    if (!streamedOutput) {
      writeStdout(formatReport(event.data.content));
    }
  });
};

export const runCopilotSession = async (options: RunOptions) => {
  const {
    prompt,
    systemMessage,
    model = DEFAULT_MODEL,
    cliPath = DEFAULT_CLI_PATH,
    logDir = DEFAULT_LOG_DIR,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    attachments,
    workingDirectory,
  } = options;

  let client: CopilotClient | undefined;
  let session: Session | undefined;
  const formatThinking = (value: string) => chalk.gray(value);
  const formatReport = (value: string) => chalk.whiteBright(value);

  try {
    status("🔗 Connecting to Copilot CLI...");
    client = new CopilotClient({
      cliPath,
      logLevel: "debug",
      cliArgs: ["--log-dir", logDir],
    });
    await client.start();

    status(`🧠 Creating Copilot session (model: ${model})...`);
    session = await client.createSession({
      model,
      streaming: true,
      systemMessage: { content: systemMessage },
      workingDirectory,
    });

    registerSessionListeners(session, formatThinking, formatReport);

    status("🔎 Running bug analysis...");

    try {
      await session.sendAndWait({ prompt, attachments }, timeoutMs);
    } finally {
      ensureLineBreak("stdout");
    }
  } finally {
    if (session || client) {
      status("🧹 Cleaning up session...");
    }
    if (session) {
      try {
        await session.destroy();
      } catch (error) {
        warnStatus(`⚠️ Failed to destroy session: ${formatError(error)}`);
      }
    }
    if (client) {
      try {
        const stopErrors = await client.stop();
        if (stopErrors.length > 0) {
          warnStatus(`⚠️ Errors while stopping Copilot client: ${stopErrors.map((err) => err.message).join("; ")}`);
        }
      } catch (error) {
        warnStatus(`⚠️ Failed to stop Copilot client: ${formatError(error)}`);
      }
    }
  }
};
