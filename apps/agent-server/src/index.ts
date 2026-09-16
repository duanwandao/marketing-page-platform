import { createServer } from "node:http";
import { OpenAICompatibleModelAdapter } from "./provider";
import { createAgentHttpHandler } from "./http";

const apiKey = process.env.AI_API_KEY;
const model = process.env.AI_MODEL;
if (!apiKey || !model) throw new Error("AI_API_KEY and AI_MODEL are required to start agent-server.");
const port = Number(process.env.PORT ?? 8787);
const handler = createAgentHttpHandler(new OpenAICompatibleModelAdapter({ apiKey, model, baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1" }));
createServer(handler).listen(port, () => console.log(`agent-server listening on ${port}`));
