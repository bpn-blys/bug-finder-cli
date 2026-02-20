import { CopilotClient, type MessageOptions } from "@github/copilot-sdk";
import chalk from "chalk";

import { errorStatus, intentStatus, status, toolStatus, warnStatus } from "./logging";
import { ensureLineBreak, writeStdout } from "./output";
import { formatToolUsage } from "./toolUsage";
import { formatError } from "./errors";
import { config, resolveCopilotCliPath, resolveCopilotLogDir } from "../constants/config";

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

const registerSessionListeners = (
  session: Session,
  formatThinking: (value: string) => string,
  formatReport: (value: string) => string,
) => {
  const debugLog = config.debugLog.enabled;

  let streamedOutput = false;
  let reasoningActive = false;
  let reportContent = "";

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
    if (debugLog) intentStatus(`🧭 Intent: ${event.data.intent}`);
  });

  session.on("assistant.reasoning_delta", (event) => {
    if (debugLog) {
      beginReasoning();
      writeStdout(formatThinking(event.data.deltaContent));
    }
  });

  session.on("assistant.reasoning", () => {
    endReasoning();
  });

  session.on("session.info", (event) => {
    if (debugLog) status(`ℹ️ ${event.data.infoType}: ${event.data.message}`);
  });

  session.on("session.model_change", (event) => {
    if (debugLog) status(`🔁 Model change: ${event.data.previousModel ?? "unknown"} → ${event.data.newModel}`);
  });

  session.on("session.compaction_start", () => {
    if (debugLog) status("🧹 Context compaction started.");
  });

  session.on("session.compaction_complete", (event) => {
    if (!debugLog) return;
    if (event.data.success) {
      status("🧹 Context compaction complete.");
    } else {
      warnStatus(`🧹 Context compaction failed: ${event.data.error ?? "unknown error"}`);
    }
  });

  session.on("tool.execution_start", (event) => {
    if (debugLog) toolStatus(formatToolUsage(event.data.toolName, event.data.arguments));
  });

  session.on("session.error", (event) => {
    if (debugLog) errorStatus(`❌ Session error (${event.data.errorType}): ${event.data.message}`);
  });

  session.on("subagent.started", (event) => {
    if (debugLog) status(`🤖 Subagent started: ${event.data.agentDisplayName}`);
  });

  session.on("subagent.completed", (event) => {
    if (debugLog) status(`🤖 Subagent completed: ${event.data.agentName}`);
  });

  session.on("subagent.failed", (event) => {
    if (debugLog) errorStatus(`🤖 Subagent failed: ${event.data.agentName} - ${event.data.error}`);
  });

  session.on("assistant.message_delta", (event) => {
    endReasoning(true);
    streamedOutput = true;
    reportContent += event.data.deltaContent;
    writeStdout(formatReport(event.data.deltaContent));
  });

  session.on("assistant.message", (event) => {
    endReasoning();
    if (!streamedOutput) {
      reportContent = event.data.content;
      writeStdout(formatReport(event.data.content));
    } else if (reportContent.length === 0) {
      reportContent = event.data.content;
    }
  });

  return () => reportContent;
};

export const runCopilotSession = async (options: RunOptions) => {
  const {
    prompt,
    systemMessage,
    model = config.copilot.defaults.model,
    cliPath = resolveCopilotCliPath(),
    logDir = resolveCopilotLogDir(),
    timeoutMs = config.copilot.defaults.analysisTimeoutMs,
    attachments,
    workingDirectory,
  } = options;

  let client: CopilotClient | undefined;
  let session: Session | undefined;
  let finalReport = "";
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

    const getReport = registerSessionListeners(session, formatThinking, formatReport);

    status("🔎 Running bug analysis...");

    try {
      await session.sendAndWait({ prompt, attachments }, timeoutMs);
      finalReport = getReport();
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

  return finalReport;
};
