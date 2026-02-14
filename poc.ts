import { CopilotClient } from "@github/copilot-sdk";
import os from "os";
import path from "path";

/**
 * Poc code to test the Copilot SDK client connection and basic functionality.
 * This is not meant to be a full example of how to use the SDK, but rather a simple test to verify that we can connect to the Copilot CLI and send a prompt.
 * Check this repo for a more complete example of how to use the SDK:
 * https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md
 */

const model = "gpt-4.1";
const defaultCliPath = path.join(os.homedir(), ".local", "bin", "copilot");
const cliPath = process.env.COPILOT_PATH?.trim() || defaultCliPath;

async function main() {
  const client = new CopilotClient({
    cliPath,
    logLevel: "debug",
    cliArgs: ["--log-dir", "./copilot-logs"],
  });
  console.log("Starting Copilot client...");
  await client.start();

  // console.log("Listing available models...");
  // const models = await client.listModels();
  // console.log(models);

  console.log(`Creating Copilot session with model: ${model}...`);
  const session = await client.createSession({
    model,
  });

  try {
    console.log("Sending prompt to Copilot...");
    const response = await session.sendAndWait({
      prompt: "Hello, Copilot!",
    });
    console.log("Copilot Response:", response?.data.content);
  } catch (error) {
    console.error("Error during session interaction:", error);
    session.destroy().catch((destroyError) => {
      console.error("Error destroying session after failure:", destroyError);
    });
  } finally {
    client.stop().catch((stopError) => {
      console.error("Error stopping Copilot client:", stopError);
    });
  }
}

main();
