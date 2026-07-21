# My Agents — Multi-Agent AI REST API & Interactive CLI

A **multi-agent AI system** built with [LangChain](https://js.langchain.com/), [LangGraph](https://langchain-ai.github.io/langgraphjs/), and [Express.js](https://expressjs.com/). The project exposes a REST API where each endpoint is powered by a specialized AI agent with its own tools, personality, and domain expertise. It also provides an **interactive CLI** for conversational access to every agent.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Agents](#agents)
  - [General Chat (Basic Agent)](#general-chat-basic-agent)
  - [Chef Agent](#chef-agent)
  - [Stocks Agent](#stocks-agent)
  - [MG-4 Agent](#mg-4-agent)
  - [IONIQ-6 Agent](#ioniq-6-agent)
  - [Mortgage Agent](#mortgage-agent)
  - [House Agent](#house-agent)
  - [Appliances Agent](#appliances-agent)
  - [GitHub Agent](#github-agent)
  - [Confluence Agent](#confluence-agent)
  - [Slide Generator Agent](#slide-generator-agent)
- [Interactive CLI](#interactive-cli)
- [API Endpoints](#api-endpoints)
- [Prerequisites](#prerequisites)
- [Installation & Running](#installation--running)
- [Configuration](#configuration)
- [Output Files](#output-files)
- [Technology Stack](#technology-stack)

---

## Overview

This project implements **12+ AI agents**, each specializing in a different domain:

| Agent | Domain | Data Source |
|-------|--------|-------------|
| **General Chat** | General-purpose assistant | LLM knowledge |
| **Chef** | Cooking & recipes | Local JSON database + vision model |
| **Stocks** | Financial markets | Yahoo Finance API + TASE API |
| **MG-4** | MG-4 electric car | Local PDF car manuals |
| **IONIQ-6** | Hyundai IONIQ 6 | Local PDF car manuals |
| **Mortgage** | Israeli mortgage analysis | Local PDF mortgage offers + Bank of Israel rates |
| **House** | Real estate & construction | Local PDF contracts & blueprint diagrams |
| **Appliances** | Home appliance comparison | Web search (Zap, KSP, Ivory, Bug) |
| **GitHub** | Repository analysis | GitHub Enterprise & Public APIs + local clones |
| **Confluence** | Knowledge base Q&A | Confluence REST API (legacy & new) |
| **Slide Generator** | Presentation creation | Web research + GitHub + file parsing |

Each agent is accessible via REST API **and** the interactive CLI (`npm run cli`).

---

## Architecture

All agents follow the **ReAct (Reason + Act)** pattern using LangGraph:

```
User message → LLM reasons → needs tool? ──yes──> call tool
                   │                         │
                   no                    tool returns result
                   │                         │
                   ▼                         │
             Final answer  <────────────────┘
```

Key concepts:
- **`createAgent()`** — LangChain helper that wires model + tools + prompt + schema into a LangGraph `StateGraph`
- **`MemorySaver`** — In-memory checkpointer for conversation state isolation per thread
- **Tools** — LangChain `tool()` definitions with Zod input schemas
- **Structured Output** — Zod schemas forcing the LLM's final response into predictable JSON
- **OAuth2** — Automatic token management via `getAccessToken()` (client-credentials flow)

---

## Agents

### General Chat (Basic Agent)

**Endpoint**: `POST /api/chat`
General-purpose conversational AI. No domain-specific tools — pure LLM chat with optional streaming (SSE).

### Chef Agent

**Endpoint**: `POST /api/chef/image`
**Persona**: Chef Jacque — culinary expert with 25 years of experience.
**Tools** (4): recipe search, recipe save, image→ingredients, image→dish recognition
**Output**: `RecipeSchema` (structured JSON)

### Stocks Agent

**Endpoint**: `POST /api/stocks/chat`
**Persona**: Marcus Sterling — Wall Street analyst.
**Tools** (18): US & Israeli stock search, quotes, history, comparisons, technical indicators, dividends, news, indices, market movers, watchlist management, markdown export
**Output**: `StocksResponseSchema` (structured JSON)

### MG-4 Agent

**Endpoint**: `POST /api/mg4/ask`
Hebrew MG-4 electric vehicle manual Q&A with PDF search, manual listing, and tips.
**Tools** (3) | **Output**: Free-form markdown

### IONIQ-6 Agent

**Endpoint**: `POST /api/ioniq6/ask`
Same architecture as MG-4 but for the Hyundai IONIQ 6.
**Tools** (3) | **Output**: Free-form markdown

### Mortgage Agent

**Endpoint**: `POST /api/mortgage/ask`
Hebrew mortgage advisor analyzing bank offer PDFs, comparing rates, calculating payments.
**Tools** (7): list offers, read offer, search offers, compare offers, fetch BOI rates, glossary, calculator
**Output**: `MortgageAnswerSchema` (structured JSON)

### House Agent

**Endpoint**: `POST /api/house/ask`
Hebrew real-estate lawyer + construction engineer for contracts and blueprints.
**Tools** (8): list documents, read documents, search contracts, search diagrams, render diagram pages, set scale, measure distances, glossary
**Output**: Free-form markdown

### Appliances Agent

**Endpoint**: `POST /api/appliances/ask`
Hebrew home-appliance expert — searches Israeli retail sites, compares brands/models, generates Excel & PDF reports.
**Tools** (7): list categories, search appliances, get details, find alternatives, compare, glossary, export comparison
**Output**: `AppliancesAnswerSchema` (structured JSON)

Additional endpoints:
- `POST /api/appliances/merge` — Upload and merge multiple appliance output files
- `POST /api/appliances/merge-local` — Merge by local file paths

### GitHub Agent

**Endpoints**:
- `POST /api/github/analyze` — Repository structure analysis
- `POST /api/github/pr-impact` — PR impact assessment (affected endpoints, consumers, databases)
- `POST /api/github/ask` — Deep Q&A about any repo (clones locally)

**Tools**: repo info, tree, file read, code search, PR diff, repo summaries, local clone + search
**Output**: `AnalysisSchema` / `PrImpactSchema` / `RepoQASchema` (structured JSON)

### Confluence Agent

**Endpoint**: `POST /api/confluence/ask`
Searches and answers questions from configured Confluence instances.
**Tools** (8): search, get page content, list spaces, get children (×2 instances)
**Output**: `ConfluenceAnswerSchema` (structured JSON)

### Slide Generator Agent

**Endpoint**: `POST /api/slidegen/ask`
Deep-research presentation generator producing PowerPoint (.pptx) or reveal.js HTML.
**Tools** (12): web research, image/meme search, file parsing, GitHub repo tools, PPTX generation, reveal.js generation
**Output**: `SlideDeckSchema` (structured JSON) + generated files

---

## Interactive CLI

Launch the CLI to chat with any agent in a multi-turn conversational loop:

```bash
npm run cli
```

On launch you pick an agent from a numbered menu:

```
Available agents:

   1. General Chat     — General-purpose AI assistant (basic agent)
   2. Chef Jacque      — Culinary expert
   3. Stock Broker     — Financial analyst
   4. MG-4 Car Expert  — MG-4 manual Q&A
   5. IONIQ 6 Expert   — IONIQ 6 manual Q&A
   6. Mortgage Advisor  — Hebrew mortgage analysis
   7. House Agent      — Contracts & diagrams
   8. Appliances Advisor — Hebrew appliance comparisons
   9. Confluence Q&A   — Confluence knowledge base
  10. GitHub Analyzer   — Repository analysis
  11. GitHub Q&A       — Deep repo Q&A
  12. Slide Generator  — Presentations
```

**CLI commands** (available during any agent session):
| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/new` | Start a fresh session (clears conversation history) |
| `/switch` | Go back to the agent-selection menu |
| `/quit` | Exit the CLI |

---

## API Endpoints

| Method | Path | Agent | Request Body |
|--------|------|-------|--------------|
| `POST` | `/api/chat` | General Chat | `{ message, model, apiKey, stream?, temperature? }` |
| `POST` | `/api/chef/image` | Chef | `{ message, imageBase64? }` |
| `POST` | `/api/stocks/chat` | Stocks | `{ apiKey, message }` |
| `POST` | `/api/mg4/ask` | MG-4 | `{ message }` |
| `POST` | `/api/ioniq6/ask` | IONIQ-6 | `{ message }` |
| `POST` | `/api/mortgage/ask` | Mortgage | `{ message }` |
| `POST` | `/api/house/ask` | House | `{ message }` |
| `POST` | `/api/appliances/ask` | Appliances | `{ message }` |
| `POST` | `/api/appliances/merge` | Appliances Merge | `multipart: files[], category?` |
| `POST` | `/api/appliances/merge-local` | Appliances Merge | `{ paths[], category? }` |
| `POST` | `/api/github/analyze` | GitHub Analysis | `{ message }` |
| `POST` | `/api/github/pr-impact` | PR Impact | `{ owner, repo, prNumber, message? }` |
| `POST` | `/api/github/ask` | GitHub Q&A | `{ message }` |
| `POST` | `/api/confluence/ask` | Confluence | `{ message }` |
| `POST` | `/api/slidegen/ask` | Slide Generator | `{ message, threadId?, repoUrl?, attachedFiles? }` |
| `GET` | `/api-docs` | Swagger UI | — |

Most endpoints authenticate automatically via OAuth2 (`OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` in `.env`). The Stocks and Chat endpoints accept an `apiKey` directly in the request body.

---

## Prerequisites

- **Node.js** 20+
- **npm**
- **OAuth2 credentials** (`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`) in `.env`
- **Docker** & **Docker Compose** (optional)

---

## Installation & Running

```bash
# 1. Clone the repository
git clone <repository-url>
cd my-agents

# 2. Copy environment template and fill in your credentials
cp .env.example .env
# Edit .env with your OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, LLM_BASE_URL, etc.

# 3. Install dependencies
npm install

# 4a. Start the REST API server
npm start
# Server starts on http://localhost:3000
# Swagger UI at http://localhost:3000/api-docs

# 4b. OR launch the interactive CLI
npm run cli
```

### Docker

```bash
docker compose up --build
# Or manually:
docker build -t my-agents .
docker run -p 3000:3000 --env-file .env -v ./outputs:/app/outputs my-agents
```

---

## Configuration

### Environment Variables (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_BASE_URL` | Yes | OpenAI-compatible LLM base URL |
| `OAUTH_TOKEN_URL` | Yes | OAuth2 token endpoint |
| `OAUTH_CLIENT_ID` | Yes | OAuth2 client ID |
| `OAUTH_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `TAVILY_API_KEY` | For appliances | Tavily web search API key |
| `GITHUB_TOKEN` | For GitHub agents | GitHub Enterprise token |
| `PUBLIC_GITHUB_TOKEN` | Optional | Public github.com token |
| `LEGACY_CONFLUENCE_TOKEN` | For Confluence | Legacy Confluence PAT |
| `NEW_CONFLUENCE_TOKEN` | For Confluence | New Confluence PAT |
| `GIPHY_API_KEY` | Optional | Giphy API key for slide memes |

### LLM Model

All agents use the model specified by `LLM_MODEL` (default: `gpt-oss-120b`) via the endpoint specified by `LLM_BASE_URL`.

### Temperature Settings

| Agent | Temperature | Reasoning |
|-------|------------|-----------|
| Basic Chat | 0.5 | Balanced creativity |
| Chef | 0.5 | Creative recipe variation |
| Stocks | 0.3 | Precise financial analysis |
| MG-4 / IONIQ-6 | 0.3 | Factual manual-grounded answers |
| Mortgage / House / Appliances | 0.3 | Data-driven Hebrew responses |
| GitHub / Confluence | 0.0–0.3 | Precise code & doc analysis |
| Slide Generator | 0.4 | Creative yet structured slides |

---

## Output Files

Every API request saves data to timestamped folders under `outputs/`:

```
outputs/
└── stocks-compare-aapl-msft-2025-06-29T12-30-45-123Z/
    ├── request.json          # Original request
    ├── full-response.json    # Complete agent response
    ├── response.md           # Formatted markdown report
    └── agent.log             # Console output capture
```

---

## Technology Stack

| Technology | Purpose |
|-----------|---------|
| [TypeScript](https://www.typescriptlang.org/) | Type-safe codebase |
| [Express.js](https://expressjs.com/) | REST API server |
| [LangChain](https://js.langchain.com/) | Agent creation, tools, LLM interaction |
| [LangGraph](https://langchain-ai.github.io/langgraphjs/) | Stateful agent workflows |
| [Zod](https://zod.dev/) | Schema validation & structured output |
| [tsx](https://github.com/privatenumber/tsx) | TypeScript execution |
| [Swagger UI](https://swagger.io/tools/swagger-ui/) | Interactive API docs |
| [pdf-parse](https://www.npmjs.com/package/pdf-parse) | PDF text extraction |
| [ExcelJS](https://www.npmjs.com/package/exceljs) | Excel file generation |
| [pdfmake](https://www.npmjs.com/package/pdfmake) | PDF report generation |
| [pptxgenjs](https://www.npmjs.com/package/pptxgenjs) | PowerPoint generation |
| [multer](https://www.npmjs.com/package/multer) | File upload handling |
| [dotenv](https://www.npmjs.com/package/dotenv) | Environment variable loading |
| [Docker](https://www.docker.com/) | Containerization |

---

## How to Add a New Agent

1. **Create the agent directory**: `src/agents/my-agent/`
2. **Write the system prompt**: `my-agent.prompt.ts`
3. **Create tools**: `tools/my-tool.tool.ts` — Use LangChain's `tool()` with Zod schemas
4. **Create the agent factory**: `my-agent.agent.ts` — Use `createAgent()` with model, tools, prompt, optional `responseFormat`
5. **Add the API route**: In `src/index.ts`
6. **Update Swagger**: In `src/swagger.ts`
7. **Add to CLI**: Add an entry to the `AGENTS` array in `src/cli.ts`
8. **Create an output saver** (optional): In `src/utils/`

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
        model: 'gpt-oss-120b',
        temperature: 0.3,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: LLM_BASE_URL  // from config.ts
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
