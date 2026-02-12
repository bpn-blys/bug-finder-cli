const formatSnippet = (value: string, max = 160) => {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) {
    return "";
  }
  if (collapsed.length <= max) {
    return collapsed;
  }

  const trimmedLength = Math.max(0, max - 3);
  return `${collapsed.slice(0, trimmedLength)}...`;
};

const summarizeToolArgs = (toolName: string, args: unknown) => {
  if (args === null || args === undefined) {
    return "";
  }
  if (typeof args === "string") {
    return formatSnippet(args);
  }
  if (typeof args !== "object") {
    return formatSnippet(String(args));
  }

  const record = args as Record<string, unknown>;
  const pathValue = typeof record.path === "string" ? record.path : undefined;
  const filePathValue = typeof record.filePath === "string" ? record.filePath : undefined;
  const patternValue = typeof record.pattern === "string" ? record.pattern : undefined;
  const commandValue = typeof record.command === "string" ? record.command : undefined;
  const descriptionValue = typeof record.description === "string" ? record.description : undefined;
  const urlValue = typeof record.url === "string" ? record.url : undefined;
  const questionValue = typeof record.question === "string" ? record.question : undefined;
  const intentValue = typeof record.intent === "string" ? record.intent : undefined;
  const promptValue = typeof record.prompt === "string" ? record.prompt : undefined;
  const inputValue = typeof record.input === "string" ? record.input : undefined;
  const queryValue = typeof record.query === "string" ? record.query : undefined;

  if ((toolName === "rg" || toolName === "glob") && patternValue) {
    return pathValue ? `${patternValue} in ${pathValue}` : patternValue;
  }

  if (toolName === "bash") {
    const detail = descriptionValue ?? commandValue;
    return detail ? formatSnippet(detail) : "";
  }

  const detail =
    pathValue ??
    filePathValue ??
    urlValue ??
    patternValue ??
    descriptionValue ??
    commandValue ??
    queryValue ??
    questionValue ??
    intentValue ??
    promptValue ??
    inputValue;

  return detail ? formatSnippet(detail) : "";
};

export const formatToolUsage = (toolName: string, args: unknown) => {
  const detail = summarizeToolArgs(toolName, args);
  return detail ? `${toolName} → ${detail}` : toolName;
};
