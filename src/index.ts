// 1. Import Express — the most popular Node.js web framework.
//    It lets you create an HTTP server and define "routes" (URL endpoints)
//    that handle incoming requests and send back responses.
import express from "express";

// 2. Import LangChain classes (same as before).
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import {createChefAgent} from './agents/chef/chef.agent';
import {createStocksAgent} from './agents/stocks/stocks.agent';
import {createMG4Agent} from './agents/MG-4/mg4.agent';
import {createIONIQ6Agent} from './agents/IONIQ-6/ioniq6.agent';
import {saveAgentOutput} from './utils/save-output';
import {saveMG4Output} from './utils/save-mg4-output';
import {saveIONIQ6Output} from './utils/save-ioniq6-output';
import {setupSwagger} from './swagger';
import {LogColors} from './utils/log-colors.util';

// 3. Create the Express application instance.
const app = express();

const apiKey = "OGU0OWU2ZDktOTA2Ny00NjQzLTg4MTQtZWJmNjQ2OGIyMmVl";

// 4. Tell Express to parse JSON request bodies.
//    Without this, req.body would be undefined when clients send JSON.
app.use(express.json({ limit: "50mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// 5. Set up Swagger UI at /api-docs (also serves as the root entry point).
setupSwagger(app);

// 6. Define the port the server will listen on.
const PORT = 3000;

app.post("/api/chef/image", async (req, res) => {
  const { apiKey, message, imageBase64 } = req.body;

  console.log(`${LogColors.YELLOW}[chef-agent]${LogColors.RESET} Received request:`, message?.slice(0, 100));
  const chef = createChefAgent(apiKey, imageBase64);

  console.log(`${LogColors.YELLOW}[chef-agent]${LogColors.RESET} Starting chef agent...`);
  const ret = await chef.invoke({
    messages: [{role: "user", content: message}]
  }, { configurable: { thread_id: `chef-${Date.now()}` } });

  console.log(`${LogColors.YELLOW}[chef-agent]${LogColors.RESET} Completed`);
  saveAgentOutput("chef", { message, imageBase64: imageBase64 ? "[base64 image]" : undefined }, ret);
  res.json({
    content: ret,
    model: "gpt-oss-120b",
  });
});

app.post("/api/stocks/chat", async (req, res) => {
  const { apiKey, message } = req.body;

  console.log(`${LogColors.BRIGHT_YELLOW}[stocks-agent]${LogColors.RESET} Received request:`, message?.slice(0, 100));

  if (!apiKey || !message) {
    res.status(400).json({
      error: "Missing required parameters: apiKey and message are required",
    });
    return;
  }

  try {
    const stocks = createStocksAgent(apiKey);

    console.log(`${LogColors.BRIGHT_YELLOW}[stocks-agent]${LogColors.RESET} Starting stocks agent...`);
    const stream = await stocks.stream({
      messages: [{role: "user", content: message}]
    }, { configurable: { thread_id: `stocks-${Date.now()}` }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.BRIGHT_YELLOW}[stocks-agent]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(", ")}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.BRIGHT_YELLOW}[stocks-agent]${LogColors.RESET} Completed in ${stepCount} steps`);
    saveAgentOutput("stocks", { message }, lastState);

    res.json({
      content: lastState,
      model: "gpt-oss-120b",
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[stocks-agent] Error:${LogColors.RESET}`, error);
    res.status(500).json({
      error: "Failed to get response from stocks agent",
      details: error.message,
    });
  }
});

app.post("/api/mg4/ask", async (req, res) => {
  const { message } = req.body;

  console.log(`${LogColors.MAGENTA}[mg4-agent]${LogColors.RESET} Received question:`, message?.slice(0, 100));

  if (!message) {
    res.status(400).json({
      error: "Missing required parameters: apiKey and message are required",
    });
    return;
  }

  try {
    const mg4 = createMG4Agent(apiKey);

    console.log(`${LogColors.MAGENTA}[mg4-agent]${LogColors.RESET} Starting MG-4 agent...`);
    const stream = await mg4.stream({
      messages: [{role: "user", content: message}]
    }, { configurable: { thread_id: `mg4-${Date.now()}` }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.MAGENTA}[mg4-agent]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(", ")}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.MAGENTA}[mg4-agent]${LogColors.RESET} Completed in ${stepCount} steps`);
    saveMG4Output({ message }, lastState);

    res.json({
      content: lastState,
      model: "gpt-oss-120b",
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[mg4-agent] Error:${LogColors.RESET}`, error);
    res.status(500).json({
      error: "Failed to get response from MG-4 agent",
      details: error.message,
    });
  }
});

app.post("/api/ioniq6/ask", async (req, res) => {
  const { message } = req.body;

  console.log(`${LogColors.GREEN}[ioniq6-agent]${LogColors.RESET} Received question:`, message?.slice(0, 100));

  if (!message) {
    res.status(400).json({
      error: "Missing required parameter: message is required",
    });
    return;
  }

  try {
    const ioniq6 = createIONIQ6Agent(apiKey);

    console.log(`${LogColors.GREEN}[ioniq6-agent]${LogColors.RESET} Starting IONIQ 6 agent...`);
    const stream = await ioniq6.stream({
      messages: [{role: "user", content: message}]
    }, { configurable: { thread_id: `ioniq6-${Date.now()}` }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.GREEN}[ioniq6-agent]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(", ")}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.GREEN}[ioniq6-agent]${LogColors.RESET} Completed in ${stepCount} steps`);
    saveIONIQ6Output({ message }, lastState);

    res.json({
      content: lastState,
      model: "gpt-oss-120b",
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[ioniq6-agent] Error:${LogColors.RESET}`, error);
    res.status(500).json({
      error: "Failed to get response from IONIQ 6 agent",
      details: error.message,
    });
  }
});

// 12. Start the server.
//     app.listen() tells Express to begin accepting HTTP connections on the given port.
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
});
