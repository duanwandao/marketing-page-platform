import { createServer } from "node:http";
import { OpenAICompatibleModelAdapter } from "./provider";
import { createAgentHttpHandler } from "./http";

const apiKey = process.env.AI_API_KEY;
const model = process.env.AI_MODEL;
const port = Number(process.env.PORT ?? 8787);
const configuredModel = apiKey && model
  ? new OpenAICompatibleModelAdapter({ apiKey, model, baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1" })
  : null;
if (!configuredModel) console.warn("[agent-server] AI_API_KEY and AI_MODEL are not configured; Copilot requests will return a configuration error.");
const handler = createAgentHttpHandler(configuredModel);
createServer(handler).listen(port, () => console.log(`agent-server listening on ${port}`));
