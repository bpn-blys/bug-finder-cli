type StreamName = "stdout" | "stderr";

let lastStream: StreamName | null = null;
let endedWithNewline = true;

const updateState = (streamName: StreamName, value: string) => {
  if (value.length === 0) {
    return;
  }
  lastStream = streamName;
  endedWithNewline = value.endsWith("\n");
};

export const ensureLineBreak = (streamName: StreamName) => {
  if (endedWithNewline) {
    return;
  }
  const stream = streamName === "stdout" ? process.stdout : process.stderr;
  stream.write("\n");
  lastStream = streamName;
  endedWithNewline = true;
};

export const writeStdout = (value: string) => {
  process.stdout.write(value);
  updateState("stdout", value);
};

export const writeStderr = (value: string) => {
  process.stderr.write(value);
  updateState("stderr", value);
};

export const writeStdoutLine = (value: string) => {
  ensureLineBreak("stdout");
  writeStdout(`${value}\n`);
};

export const writeStderrLine = (value: string) => {
  ensureLineBreak("stdout");
  ensureLineBreak("stderr");
  writeStderr(`${value}\n`);
};
