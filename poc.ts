import { CopilotClient } from "@github/copilot-sdk";
import { config, resolveCopilotCliPath, resolveCopilotLogDir } from "./constants/config";

/**
 * Poc code to test the Copilot SDK client connection and basic functionality.
 * This is not meant to be a full example of how to use the SDK, but rather a simple test to verify that we can connect to the Copilot CLI and send a prompt.
 * Check this repo for a more complete example of how to use the SDK:
 * https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md
 */

const model = process.env[config.copilot.env.model] ?? config.copilot.defaults.model;
const cliPath = resolveCopilotCliPath();

async function main() {
  const client = new CopilotClient({
    cliPath,
    logLevel: "debug",
    cliArgs: ["--log-dir", resolveCopilotLogDir()],
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
