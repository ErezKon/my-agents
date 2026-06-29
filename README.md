# My Agents — Multi-Agent AI REST API

A **multi-agent AI system** built with [LangChain](https://js.langchain.com/), [LangGraph](https://langchain-ai.github.io/langgraphjs/), and [Express.js](https://expressjs.com/). The project exposes a REST API where each endpoint is powered by a specialized AI agent with its own tools, personality, and domain expertise.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
  - [What is a LangChain Agent?](#what-is-a-langchain-agent)
  - [What is LangGraph?](#what-is-langgraph)
  - [The ReAct Agent Loop](#the-react-agent-loop)
  - [Tools](#tools)
  - [Structured Output](#structured-output)
  - [System Prompts](#system-prompts)
  - [Memory (MemorySaver)](#memory-memorysaver)
- [Project Structure](#project-structure)
- [Agents](#agents)
  - [Chef Agent](#chef-agent)
  - [Stocks Agent](#stocks-agent)
  - [MG-4 Agent](#mg-4-agent)
  - [IONIQ-6 Agent](#ioniq-6-agent)
  - [Router Agent](#router-agent)
- [API Endpoints](#api-endpoints)
- [Prerequisites](#prerequisites)
- [Installation & Running](#installation--running)
  - [Local Development](#local-development)
  - [Docker](#docker)
- [API Usage Examples](#api-usage-examples)
- [Configuration](#configuration)
- [Output Files](#output-files)
- [Technology Stack](#technology-stack)

---

## Overview

This project implements **five AI agents**, each specializing in a different domain:

| Agent | Domain | Data Source |
|-------|--------|-------------|
| **Chef** | Cooking & recipes | Local JSON database + vision model for food images |
| **Stocks** | Financial markets | Yahoo Finance API + TASE (Tel Aviv Stock Exchange) API |
| **MG-4** | MG-4 electric car | Local PDF car manuals |
| **IONIQ-6** | Hyundai IONIQ 6 | Local PDF car manuals |
| **Router** | Question classification | Routes questions to the correct specialist agent |

Each agent is accessible through its own REST API endpoint. There's also a unified `/api/ask` endpoint that automatically classifies questions and delegates to the appropriate agent.

---

## Architecture

### What is a LangChain Agent?

A **LangChain agent** is an LLM (Large Language Model) that can **decide which tools to call** and **what arguments to pass** based on the user's question. Unlike a simple chatbot that just generates text, an agent can:

1. Read the user's question.
2. Decide it needs real data (e.g., a stock price).
3. Call a tool (e.g., `get_stock_quote`) to fetch that data.
4. Read the tool's result.
5. Decide if it needs more data (call another tool) or can answer.
6. Produce a final, structured answer.

This project uses the **`createAgent()`** helper from the `langchain` package, which wires together a model, tools, system prompt, and optional structured output schema into a LangGraph `StateGraph`.

### What is LangGraph?

**LangGraph** is a framework built on top of LangChain for building **stateful, multi-step agent workflows** as directed graphs. Each node in the graph is a processing step (e.g., "call the LLM", "execute a tool"), and edges define the flow between steps.

In this project, LangGraph is used under the hood by `createAgent()` to implement the ReAct agent loop. It also provides:

- **`MemorySaver`**: A checkpointer that stores conversation state (see [Memory](#memory-memorysaver)).
- **State management**: Tracks the message history, tool call results, and the agent's current reasoning step.

### The ReAct Agent Loop

All agents in this project use the **ReAct (Reason + Act)** pattern:

```
┌─────────────────────────────────────────────────────────────┐
│  User message → LLM reasons → needs tool? ──yes──> call tool│
│                    │                          │              │
│                    no                    tool returns result  │
│                    │                          │              │
│                    ▼                          │              │
│              Final answer  <─────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

The loop continues until the LLM decides it has enough information to produce a final answer. A single user question might trigger 0, 1, or many tool calls depending on complexity.

**Example**: "Compare AAPL and MSFT performance in 2024" might trigger:
1. `search_stock("AAPL")` → resolves ticker
2. `search_stock("MSFT")` → resolves ticker
3. `compare_stocks({symbols: ["AAPL", "MSFT"], startDate: "01/01/2024", endDate: "31/12/2024"})` → fetches comparison data
4. Final answer with the comparison results

### Tools

**Tools** are functions that the LLM can call during its reasoning loop. Each tool is defined using LangChain's `tool()` function with three components:

1. **Handler function**: The async function that performs the actual work (API call, file read, database query, etc.).
2. **Name**: A unique identifier the LLM uses to reference the tool (e.g., `"search_stock"`).
3. **Description**: A natural language description that tells the LLM **when** and **why** to use the tool. The LLM reads this to decide which tool to call.
4. **Schema**: A [Zod](https://zod.dev/) schema that defines the tool's input parameters. The LLM uses this to know what arguments to pass.

```typescript
// Example: A simple tool definition
export const myTool = tool(
    async ({ symbol }) => {                    // 1. Handler function
        const data = await fetchData(symbol);
        return JSON.stringify(data);
    },
    {
        name: "my_tool",                        // 2. Name
        description: "Fetches data for a stock symbol",  // 3. Description
        schema: z.object({                      // 4. Zod input schema
            symbol: z.string().describe("Stock ticker symbol"),
        }),
    }
);
```

**Important**: Tools return **strings** (usually JSON). The LLM receives this string and uses it in its next reasoning step.

### Structured Output

Some agents use **structured output** to constrain the LLM's final response to a specific JSON shape. This is done using Zod schemas and LangChain's `withStructuredOutput()` method or the `responseFormat` parameter in `createAgent()`.

**How it works**:
1. You define a Zod schema describing the desired output shape.
2. LangChain uses OpenAI's function-calling mechanism under the hood to force the LLM to produce JSON matching the schema.
3. The result is already parsed and typed — no manual JSON parsing needed.

**Agents using structured output**:
- **Chef agent** → `RecipeSchema` (recipe ideas, top pick, instructions)
- **Stocks agent** → `StocksResponseSchema` (comprehensive financial data)
- **Router agent** → `AgentNameSchema` (classification result)

**Agents with free-form output**:
- **MG-4 agent** → Returns markdown text (no schema)
- **IONIQ-6 agent** → Returns markdown text (no schema)

### System Prompts

Each agent has a **system prompt** that defines its:
- **Persona**: Name, personality, expertise level
- **Scope**: What topics the agent handles (and what it should reject)
- **Response framework**: Step-by-step instructions on how to handle different query types
- **Quality guidelines**: Rules for accuracy, citations, formatting
- **Edge cases**: How to handle ambiguous or out-of-scope questions

System prompts are stored in separate `.prompt.ts` files (e.g., `chef.promt.ts`, `stocks.prompt.ts`).

### Memory (MemorySaver)

Each agent uses LangGraph's **`MemorySaver`** as a checkpointer to store conversation state:

```typescript
const checkpointer = new MemorySaver();
```

- **What it stores**: Message history, tool call results, the agent's reasoning state.
- **Thread isolation**: Each API request gets a unique `thread_id` (e.g., `"chef-1719654321000"`) so conversations don't mix.
- **In-memory only**: Data is lost when the process restarts. This is appropriate for a stateless REST API where each request is independent.
- **For persistent memory**: Replace `MemorySaver` with a database-backed checkpointer (e.g., `PostgresSaver` from `@langchain/langgraph-checkpoint-postgres`).

---

## Project Structure

```
my-agents/
├── src/
│   ├── index.ts                          # Main Express server & API routes
│   ├── swagger.ts                        # Swagger/OpenAPI documentation setup
│   │
│   ├── agents/
│   │   ├── chef/                         # Chef Agent
│   │   │   ├── chef.agent.ts             # Agent factory (creates the LangGraph agent)
│   │   │   ├── chef.promt.ts             # System prompt (persona & behavior rules)
│   │   │   ├── tools/
│   │   │   │   ├── image-recognition.tool.ts  # Vision tools (ingredient & food recognition)
│   │   │   │   ├── search-recipe.tool.ts      # Search local recipe database
│   │   │   │   └── save-recipe.tool.ts        # Save recipe to local database
│   │   │   └── recipies-db/
│   │   │       ├── db-utils.ts           # Database read/write helpers
│   │   │       ├── recipes-db.json       # Local recipe database (JSON file)
│   │   │       └── schemas/
│   │   │           ├── recipe.schema.ts       # Response schema (structured output)
│   │   │           └── recipe-item.schema.ts  # Single recipe data structure
│   │   │
│   │   ├── stocks/                       # Stocks Agent
│   │   │   ├── stocks.agent.ts           # Agent factory (18 tools!)
│   │   │   ├── stocks.prompt.ts          # System prompt (Marcus Sterling persona)
│   │   │   ├── schemas/
│   │   │   │   └── stocks-response.schema.ts  # Comprehensive response schema
│   │   │   ├── tools/
│   │   │   │   ├── search-stock.tool.ts       # Search US stocks (Yahoo Finance)
│   │   │   │   ├── get-stock-quote.tool.ts    # Current stock quote
│   │   │   │   ├── get-stock-history.tool.ts  # Historical price data
│   │   │   │   ├── get-stock-yearly-perf.tool.ts    # Single-year performance
│   │   │   │   ├── get-stock-multi-year-perf.tool.ts # Multi-year breakdown
│   │   │   │   ├── compare-stocks.tool.ts     # Side-by-side comparison
│   │   │   │   ├── get-technical-indicators.tool.ts  # SMA, EMA, RSI, MACD
│   │   │   │   ├── get-dividend-history.tool.ts      # Dividend payments
│   │   │   │   ├── get-stock-news.tool.ts     # Recent news headlines
│   │   │   │   ├── get-index-quote.tool.ts    # Market indices (S&P 500, etc.)
│   │   │   │   ├── get-market-movers.tool.ts  # Top gainers/losers
│   │   │   │   ├── search-tase.tool.ts        # Search Israeli stocks (TASE)
│   │   │   │   ├── get-tase-quote.tool.ts     # Current TASE quote
│   │   │   │   ├── get-tase-history.tool.ts   # TASE historical data
│   │   │   │   ├── get-tase-yearly-perf.tool.ts     # TASE yearly performance
│   │   │   │   ├── manage-watchlist.tool.ts   # Persistent watchlist CRUD
│   │   │   │   ├── export-markdown.tool.ts    # Export response as .md file
│   │   │   │   └── get-capabilities.tool.ts   # Self-describing capabilities
│   │   │   └── json response samples/    # Example responses for capabilities tool
│   │   │
│   │   ├── MG-4/                         # MG-4 Car Manual Agent
│   │   │   ├── mg4.agent.ts              # Agent factory
│   │   │   ├── mg4.prompt.ts             # System prompt
│   │   │   ├── tools/
│   │   │   │   ├── search-manuals.tool.ts     # Keyword search in PDF manuals
│   │   │   │   ├── list-manuals.tool.ts       # List available PDF files
│   │   │   │   └── get-tips.tool.ts           # Generate tips from manual content
│   │   │   └── sources/                  # PDF car manuals (Hebrew)
│   │   │       ├── ספר נהג.pdf
│   │   │       ├── נספח לספר נהג.pdf
│   │   │       └── מדריך מקוצר.pdf
│   │   │
│   │   ├── IONIQ-6/                      # IONIQ 6 Car Manual Agent
│   │   │   ├── ioniq6.agent.ts           # Agent factory
│   │   │   ├── ioniq6.prompt.ts          # System prompt
│   │   │   ├── tools/                    # Same tool structure as MG-4
│   │   │   │   ├── search-manuals.tool.ts
│   │   │   │   ├── list-manuals.tool.ts
│   │   │   │   └── get-tips.tool.ts
│   │   │   └── sources/                  # PDF car manuals (Hebrew)
│   │   │       └── ספר-רכב-איוניק-6-2023.pdf
│   │   │
│   │   └── router/                       # Router Agent (question classifier)
│   │       └── router.agent.ts           # Classification logic
│   │
│   └── utils/
│       ├── log-colors.util.ts            # ANSI color codes for console logs
│       ├── save-output-base.ts           # Shared output saving helpers
│       ├── save-output.ts               # Chef & Stocks output saver
│       ├── save-mg4-output.ts           # MG-4 output saver
│       └── save-ioniq6-output.ts        # IONIQ-6 output saver
│
├── outputs/                              # Saved request/response files (gitignored)
├── package.json                          # Dependencies & scripts
├── tsconfig.json                         # TypeScript configuration
├── Dockerfile                            # Docker image definition
├── docker-compose.yml                    # Docker Compose orchestration
├── .gitignore
└── .dockerignore
```

---

## Agents

### Chef Agent

**File**: `src/agents/chef/chef.agent.ts`
**Persona**: Chef Jacque — a warm, creative culinary expert with 25 years of experience.
**Endpoint**: `POST /api/chef/image`

**Capabilities**:
- Identify ingredients from a photo (uses `pixtral-12b-2409` vision model)
- Recognize prepared dishes and reverse-engineer recipes from photos
- Search a local JSON recipe database for matching recipes
- Create new recipes and save them to the database
- Provide step-by-step instructions with chef tips and variations

**Tools** (4):
| Tool | Description |
|------|-------------|
| `search_recipe_database` | Searches local JSON DB by ingredients or recipe name |
| `save_recipe_to_database` | Persists new recipes to the JSON file |
| `convert_image_to_ingredients` | Vision model identifies raw ingredients in a photo |
| `convert_image_to_food_description` | Vision model recognizes a dish and lists its ingredients |

**Structured Output**: `RecipeSchema` — Returns recipe ideas, a top pick with full instructions, and a source indicator (database vs. freshly created).

### Stocks Agent

**File**: `src/agents/stocks/stocks.agent.ts`
**Persona**: Marcus Sterling — a seasoned Wall Street analyst with 25 years of experience.
**Endpoint**: `POST /api/stocks`

**Capabilities**:
- Look up stock prices, quotes, and key metrics (both US and Israeli markets)
- Fetch historical price data for any date range
- Compare multiple stocks side-by-side
- Compute technical indicators (SMA, EMA, RSI, MACD)
- Track yearly and multi-year performance
- Fetch dividend payment history
- Show market indices (S&P 500, NASDAQ, Dow Jones, TA-35, TA-125)
- Display top gainers, losers, and most actively traded stocks
- Fetch recent news headlines for any stock
- Manage persistent watchlists (create, add, remove, list, get quotes)
- Export formatted markdown reports
- Describe its own capabilities

**Tools** (18):
| Tool | Data Source | Description |
|------|-----------|-------------|
| `search_stock` | Yahoo Finance | Resolve company name → ticker symbol |
| `get_stock_quote` | Yahoo Finance | Current price, change, market cap, P/E, etc. |
| `get_stock_history` | Yahoo Finance | Historical OHLCV data for a date range |
| `get_stock_yearly_perf` | Yahoo Finance | Year-open vs year-close performance |
| `get_stock_multi_year_perf` | Yahoo Finance | Year-by-year breakdown over multiple years |
| `compare_stocks` | Yahoo Finance | Side-by-side comparison with % change, volatility |
| `get_technical_indicators` | Yahoo Finance | SMA(20), SMA(50), EMA(12/26), RSI(14), MACD |
| `get_dividend_history` | Yahoo Finance | Dividend payments with annual summaries |
| `get_stock_news` | Yahoo Finance | Recent news headlines and links |
| `get_index_quote` | Yahoo Finance | S&P 500, NASDAQ, Dow Jones, TA-35, TA-125 |
| `get_market_movers` | Yahoo Finance | Top gainers, losers, most active |
| `search_tase` | TASE API | Search Israeli securities by name or ID |
| `get_tase_quote` | TASE API | Current Israeli stock quote |
| `get_tase_history` | TASE API | Historical Israeli stock data |
| `get_tase_yearly_perf` | TASE API | Israeli stock yearly performance |
| `manage_watchlist` | Local filesystem | CRUD operations on persistent JSON watchlists |
| `export_markdown` | Local filesystem | Generate formatted .md report from response |
| `get_capabilities` | Local filesystem | List all agent capabilities with examples |

**Structured Output**: `StocksResponseSchema` — Comprehensive schema with summary, market, stock data, comparisons, indices, movers, news, technical indicators, dividends, watchlist, insights, and disclaimer.

### MG-4 Agent

**File**: `src/agents/MG-4/mg4.agent.ts`
**Persona**: MG-4 car expert assistant.
**Endpoint**: `POST /api/mg4`

**Capabilities**:
- Search across multiple Hebrew-language PDF car manuals
- Answer questions about MG-4 features, charging, safety, specifications
- Generate practical tips for car owners
- Provide answers with direct quotes and page citations
- Respond in the user's language (Hebrew or English)

**Tools** (3):
| Tool | Description |
|------|-------------|
| `search_mg4_manuals` | Keyword search across all PDF manuals with relevance scoring |
| `list_mg4_manuals` | List available PDF files and their sizes |
| `get_mg4_tips` | Retrieve excerpts for tip generation, optionally by topic |

**Output Format**: Free-form markdown with citations (no structured JSON schema).

**Source Manuals** (Hebrew):
- `ספר נהג.pdf` — Driver's manual
- `נספח לספר נהג.pdf` — Supplement to driver's manual
- `מדריך מקוצר.pdf` — Quick reference guide

### IONIQ-6 Agent

**File**: `src/agents/IONIQ-6/ioniq6.agent.ts`
**Persona**: Hyundai IONIQ 6 car expert assistant.
**Endpoint**: `POST /api/ioniq6`

Architecturally identical to the MG-4 agent but operates on IONIQ 6 manuals.

**Tools** (3): `search_ioniq6_manuals`, `list_ioniq6_manuals`, `get_ioniq6_tips`

**Source Manuals**: `ספר-רכב-איוניק-6-2023.pdf`

### Router Agent

**File**: `src/agents/router/router.agent.ts`
**Endpoint**: `POST /api/ask`

The router is **not** a full LangGraph agent — it's a single LLM call with structured output. It classifies the user's question into one of the specialist agents:

```json
{
  "agent": "chef" | "stocks" | "mg4" | "ioniq6" | "unknown",
  "reasoning": "Brief explanation of why this agent was chosen"
}
```

If the classification is `"unknown"`, the server returns an error asking the user to be more specific.

**How it works**:
1. Receives the user's question.
2. Sends it to the LLM with a classification prompt listing all available agents.
3. The LLM returns a structured `AgentClassification` object (via `withStructuredOutput()`).
4. The Express handler in `index.ts` delegates to the chosen agent.

---

## API Endpoints

| Method | Path | Description | Request Body |
|--------|------|-------------|--------------|
| `POST` | `/api/chef/image` | Chef agent | `{ apiKey, message, imageBase64? }` |
| `POST` | `/api/stocks` | Stocks agent | `{ apiKey, message }` |
| `POST` | `/api/mg4` | MG-4 agent | `{ apiKey, message }` |
| `POST` | `/api/ioniq6` | IONIQ 6 agent | `{ apiKey, message }` |
| `POST` | `/api/ask` | Router (auto-classify) | `{ apiKey, message }` |
| `GET` | `/api-docs` | Swagger UI | — |
| `GET` | `/` | Redirects to `/api-docs` | — |

All POST endpoints require:
- **`apiKey`** (string): API key for the Dell GenAI endpoint.
- **`message`** (string): The user's question or request.

The Chef endpoint additionally accepts:
- **`imageBase64`** (string, optional): Base64-encoded image of food or ingredients.

---

## Prerequisites

- **Node.js** 20+ (the Dockerfile uses `node:20-slim`)
- **npm** (comes with Node.js)
- **Docker** & **Docker Compose** (optional, for containerized deployment)
- **API Key** for the Dell GenAI endpoint (`https://genai-api-dev.dell.com/v1`)

---

## Installation & Running

### Local Development

```bash
# 1. Clone the repository
git clone <repository-url>
cd my-agents

# 2. Install dependencies
npm install

# 3. Start the development server
npm start
```

The server starts on **http://localhost:3000**. Visit http://localhost:3000/api-docs for the Swagger UI.

### Docker

```bash
# Build and run with Docker Compose
docker compose up --build

# Or build and run manually
docker build -t my-agents .
docker run -p 3000:3000 -v ./outputs:/app/outputs my-agents
```

**Docker details**:
- Base image: `node:20-slim`
- Exposed port: `3000`
- Environment variable `NODE_TLS_REJECT_UNAUTHORIZED=0` is set (for internal TLS certificates)
- The `outputs/` directory is mounted as a volume so saved files persist across container restarts

---

## API Usage Examples

### Chef Agent — Text Query

```bash
curl -X POST http://localhost:3000/api/chef/image \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "YOUR_API_KEY",
    "message": "I have chicken breast, garlic, lemon, and olive oil. What can I make?"
  }'
```

### Chef Agent — Image Analysis

```bash
curl -X POST http://localhost:3000/api/chef/image \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "YOUR_API_KEY",
    "message": "What can I cook with these ingredients?",
    "imageBase64": "/9j/4AAQ..."
  }'
```

### Stocks Agent — Stock Quote

```bash
curl -X POST http://localhost:3000/api/stocks \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "YOUR_API_KEY",
    "message": "What is the current price of Apple stock?"
  }'
```

### Stocks Agent — Comparison

```bash
curl -X POST http://localhost:3000/api/stocks \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "YOUR_API_KEY",
    "message": "Compare AAPL, MSFT, and GOOGL performance over the last year"
  }'
```

### Stocks Agent — Israeli Market (TASE)

```bash
curl -X POST http://localhost:3000/api/stocks \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "YOUR_API_KEY",
    "message": "What is the current price of Bank Leumi on the Tel Aviv Stock Exchange?"
  }'
```

### MG-4 Agent — Car Manual Query

```bash
curl -X POST http://localhost:3000/api/mg4 \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "YOUR_API_KEY",
    "message": "How do I activate the regenerative braking on the MG-4?"
  }'
```

### IONIQ-6 Agent

```bash
curl -X POST http://localhost:3000/api/ioniq6 \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "YOUR_API_KEY",
    "message": "What are the charging options for the IONIQ 6?"
  }'
```

### Router Agent — Auto-Classification

```bash
# The router automatically detects this is a cooking question
# and delegates to the Chef agent
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "YOUR_API_KEY",
    "message": "How do I make pasta carbonara?"
  }'
```

---

## Configuration

### LLM Model

All agents use the **`gpt-oss-120b`** model via the Dell GenAI endpoint:
```
Base URL: https://genai-api-dev.dell.com/v1
```

To use a different model or endpoint, modify the `ChatOpenAI` configuration in each agent file. The MG-4 and IONIQ-6 agents include a commented-out `ollamaModel` placeholder for switching to a self-hosted LLM.

### Temperature Settings

| Agent | Temperature | Reasoning |
|-------|------------|-----------|
| Chef | 0.5 | Creative variation in recipe suggestions |
| Stocks | 0.3 | Precise, data-driven financial analysis |
| MG-4 | 0.3 | Factual, manual-grounded answers |
| IONIQ-6 | 0.3 | Factual, manual-grounded answers |
| Router | 0.0 | Deterministic, consistent classification |

### Vision Model

The Chef agent's image recognition tools use the **`pixtral-12b-2409`** vision model for analyzing food photos.

### Timeouts

| Agent | Timeout | Reason |
|-------|---------|--------|
| Chef | 10s | Single tool calls, fast responses |
| Stocks | 30s | Multiple external API calls |
| MG-4 | 60s | PDF parsing can be slow on first load |
| IONIQ-6 | 60s | PDF parsing can be slow on first load |
| Router | 15s | Single LLM call, quick classification |

---

## Output Files

Every API request saves its data to the `outputs/` directory in a timestamped folder:

```
outputs/
└── stocks-compare-aapl-msft-2025-06-29T12-30-45-123Z/
    ├── request.json          # Original request payload
    ├── full-response.json    # Complete agent response
    ├── response-markdown.md  # Extracted markdown answer (if applicable)
    └── response.md           # Formatted report (stocks agent only)
```

This is useful for:
- **Debugging**: Inspect exactly what the agent returned.
- **Auditing**: Keep a record of all queries and responses.
- **Development**: Use saved responses as test fixtures.

The `outputs/` directory is gitignored but persists in Docker via a volume mount.

---

## Technology Stack

| Technology | Purpose |
|-----------|---------|
| [TypeScript](https://www.typescriptlang.org/) | Type-safe JavaScript for the entire codebase |
| [Express.js](https://expressjs.com/) | HTTP server and REST API routing |
| [LangChain](https://js.langchain.com/) | LLM interaction, tool definitions, agent creation |
| [LangGraph](https://langchain-ai.github.io/langgraphjs/) | Stateful agent workflows, memory management |
| [Zod](https://zod.dev/) | Runtime schema validation and structured output |
| [tsx](https://github.com/privatenumber/tsx) | TypeScript execution without compilation step |
| [Swagger UI](https://swagger.io/tools/swagger-ui/) | Interactive API documentation |
| [pdf-parse](https://www.npmjs.com/package/pdf-parse) | PDF text extraction for car manual agents |
| [Docker](https://www.docker.com/) | Containerization for deployment |

### Key Dependencies (from `package.json`)

```json
{
  "@langchain/core": "^0.3.45",       // Core LangChain abstractions
  "@langchain/langgraph": "^0.2.66",  // LangGraph for agent workflows
  "@langchain/openai": "^0.5.6",      // OpenAI-compatible model wrapper
  "langchain": "^0.3.22",             // High-level helpers (createAgent)
  "express": "^4.21.2",               // Web framework
  "swagger-ui-express": "^5.0.1",     // Swagger UI middleware
  "pdf-parse": "^1.1.1",              // PDF text extraction
  "zod": "^3.24.3"                    // Schema validation
}
```

---

## How to Add a New Agent

1. **Create the agent directory**: `src/agents/my-agent/`
2. **Write the system prompt**: `my-agent.prompt.ts` — Define persona, scope, rules.
3. **Create tools**: `tools/my-tool.tool.ts` — Use LangChain's `tool()` function with a Zod schema.
4. **Create the agent factory**: `my-agent.agent.ts` — Use `createAgent()` with model, tools, prompt, and optional `responseFormat`.
5. **Add the API route**: In `src/index.ts`, add a new `app.post("/api/my-agent", ...)` handler.
6. **Update Swagger**: Add the endpoint documentation in `src/swagger.ts`.
7. **Create an output saver** (optional): In `src/utils/save-my-agent-output.ts`.

**Minimal example**:

```typescript
// src/agents/my-agent/my-agent.agent.ts
import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { myPrompt } from './my-agent.prompt';
import { myTool } from './tools/my-tool.tool';

export const createMyAgent = (apiKey: string) => {
    const checkpointer = new MemorySaver();

    const model = new ChatOpenAI({
        model: "gpt-oss-120b",
        temperature: 0.3,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: "https://genai-api-dev.dell.com/v1"
        }
    });

    return createAgent({
        model,
        checkpointer,
        systemPrompt: myPrompt,
        tools: [myTool],
    });
};
```
