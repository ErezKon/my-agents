/**
 * ============================================================================
 * MAIN APPLICATION ENTRY POINT — Express REST API Server
 * ============================================================================
 *
 * This is the central hub of the multi-agent system. It creates an Express
 * HTTP server that exposes REST API endpoints for each AI agent:
 *
 *   POST /api/chef/image    — Chef agent (with optional image analysis)
 *   POST /api/stocks        — Stocks agent (financial analysis)
 *   POST /api/mg4           — MG-4 car manual Q&A agent
 *   POST /api/ioniq6        — IONIQ 6 car manual Q&A agent
 *   POST /api/ask           — Router agent (auto-classifies and delegates)
 *   GET  /api-docs          — Swagger UI for interactive API documentation
 *
 * REQUEST FLOW:
 * ─────────────
 * 1. Client sends POST with `{ apiKey, message }` (and optionally `imageBase64`).
 * 2. The handler creates the appropriate LangGraph agent via its factory function.
 * 3. The agent is invoked/streamed with the user's message.
 * 4. The agent's ReAct loop runs: LLM → tool calls → LLM → ... → final answer.
 * 5. The response is saved to disk (outputs/) for debugging/auditing.
 * 6. The structured response is returned to the client as JSON.
 *
 * STREAMING vs INVOKE:
 * - Chef agent uses `.invoke()` — single call, waits for full response.
 * - Stocks, MG-4, IONIQ-6 use `.stream()` — iterates over each step of
 *   the agent loop, logging tool calls in real time. The final chunk
 *   contains the complete response.
 *
 * ROUTER ENDPOINT (/api/ask):
 * The router endpoint first classifies the question using the router agent,
 * then delegates to the appropriate specialist agent. This lets clients
 * send any question without knowing which agent handles it.
 * ============================================================================
 */

// Express — Node.js web framework for HTTP server and route handling.
import express from "express";

// LangChain imports (ChatOpenAI and HumanMessage are used for direct model calls
// in some endpoints, though most logic is encapsulated in agent modules).
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";

// Agent factory functions — each creates a configured LangGraph agent.
import {createChefAgent} from './agents/chef/chef.agent';
import {createStocksAgent} from './agents/stocks/stocks.agent';
import {createMG4Agent} from './agents/MG-4/mg4.agent';
import {createIONIQ6Agent} from './agents/IONIQ-6/ioniq6.agent';

// Output saving utilities — persist request/response to disk for debugging.
import {saveAgentOutput} from './utils/save-output';
import {saveMG4Output} from './utils/save-mg4-output';
import {saveIONIQ6Output} from './utils/save-ioniq6-output';

// Swagger UI setup for interactive API documentation at /api-docs.
import {setupSwagger} from './swagger';

// Router agent — classifies questions and routes to the right specialist.
import {classifyQuestion} from './agents/router/router.agent';

// Console logging colors for readable server output.
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
    const result = saveMG4Output({ message }, lastState);

    res.json({
      content: lastState,
      model: "gpt-oss-120b",
      markdown: result?.markdown ?? null,
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
    const result = saveIONIQ6Output({ message }, lastState);

    res.json({
      content: lastState,
      model: "gpt-oss-120b",
      markdown: result?.markdown ?? null,
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[ioniq6-agent] Error:${LogColors.RESET}`, error);
    res.status(500).json({
      error: "Failed to get response from IONIQ 6 agent",
      details: error.message,
    });
  }
});

app.post("/api/ask", async (req, res) => {
  const { message, imageBase64 } = req.body;

  console.log(`${LogColors.CYAN}[router]${LogColors.RESET} Received question:`, message?.slice(0, 100));

  if (!message) {
    res.status(400).json({
      error: "Missing required parameter: message is required",
    });
    return;
  }

  try {
    // Step 1: Classify the question
    console.log(`${LogColors.CYAN}[router]${LogColors.RESET} Classifying question...`);
    const classification = await classifyQuestion(apiKey, message);
    console.log(`${LogColors.CYAN}[router]${LogColors.RESET} Routed to: ${classification.agent} (${classification.reasoning})`);

    if (classification.agent === 'unknown') {
      res.status(400).json({
        error: "Could not determine which agent to use. Please be more specific or mention the topic (e.g. MG-4, IONIQ 6, stocks, cooking).",
        reasoning: classification.reasoning,
      });
      return;
    }

    // Step 2: Delegate to the chosen agent
    let result: any;

    switch (classification.agent) {
      case 'chef': {
        const chef = createChefAgent(apiKey, imageBase64);
        console.log(`${LogColors.CYAN}[router]${LogColors.RESET} Delegating to chef agent...`);
        result = await chef.invoke({
          messages: [{ role: "user", content: message }]
        }, { configurable: { thread_id: `router-chef-${Date.now()}` } });
        saveAgentOutput("chef", { message, imageBase64: imageBase64 ? "[base64 image]" : undefined }, result);
        res.json({ routedTo: "chef", content: result, model: "gpt-oss-120b" });
        break;
      }
      case 'stocks': {
        const stocks = createStocksAgent(apiKey);
        console.log(`${LogColors.CYAN}[router]${LogColors.RESET} Delegating to stocks agent...`);
        const stockStream = await stocks.stream({
          messages: [{ role: "user", content: message }]
        }, { configurable: { thread_id: `router-stocks-${Date.now()}` }, recursionLimit: 100 });
        let lastState: any = null;
        let stepCount = 0;
        for await (const chunk of stockStream) {
          stepCount++;
          const nodeNames = Object.keys(chunk);
          console.log(`${LogColors.CYAN}[router→stocks]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(", ")}]`);
          lastState = chunk;
        }
        saveAgentOutput("stocks", { message }, lastState);
        res.json({ routedTo: "stocks", content: lastState, model: "gpt-oss-120b" });
        break;
      }
      case 'mg4': {
        const mg4 = createMG4Agent(apiKey);
        console.log(`${LogColors.CYAN}[router]${LogColors.RESET} Delegating to MG-4 agent...`);
        const mg4Stream = await mg4.stream({
          messages: [{ role: "user", content: message }]
        }, { configurable: { thread_id: `router-mg4-${Date.now()}` }, recursionLimit: 100 });
        let mg4Last: any = null;
        let mg4Steps = 0;
        for await (const chunk of mg4Stream) {
          mg4Steps++;
          const nodeNames = Object.keys(chunk);
          console.log(`${LogColors.CYAN}[router→mg4]${LogColors.RESET} Step ${mg4Steps}: nodes=[${nodeNames.join(", ")}]`);
          mg4Last = chunk;
        }
        const mg4Result = saveMG4Output({ message }, mg4Last);
        res.json({ routedTo: "mg4", content: mg4Last, model: "gpt-oss-120b", markdown: mg4Result?.markdown ?? null });
        break;
      }
      case 'ioniq6': {
        const ioniq6 = createIONIQ6Agent(apiKey);
        console.log(`${LogColors.CYAN}[router]${LogColors.RESET} Delegating to IONIQ 6 agent...`);
        const ioniq6Stream = await ioniq6.stream({
          messages: [{ role: "user", content: message }]
        }, { configurable: { thread_id: `router-ioniq6-${Date.now()}` }, recursionLimit: 100 });
        let ioniq6Last: any = null;
        let ioniq6Steps = 0;
        for await (const chunk of ioniq6Stream) {
          ioniq6Steps++;
          const nodeNames = Object.keys(chunk);
          console.log(`${LogColors.CYAN}[router→ioniq6]${LogColors.RESET} Step ${ioniq6Steps}: nodes=[${nodeNames.join(", ")}]`);
          ioniq6Last = chunk;
        }
        const ioniq6Result = saveIONIQ6Output({ message }, ioniq6Last);
        res.json({ routedTo: "ioniq6", content: ioniq6Last, model: "gpt-oss-120b", markdown: ioniq6Result?.markdown ?? null });
        break;
      }
    }

    console.log(`${LogColors.CYAN}[router]${LogColors.RESET} Completed — served by ${classification.agent}`);
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[router] Error:${LogColors.RESET}`, error);
    res.status(500).json({
      error: "Failed to process your question",
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
