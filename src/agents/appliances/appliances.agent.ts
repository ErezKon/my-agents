/**
 * ============================================================================
 * APPLIANCES AGENT — AI-Powered Home Appliance Advisor (Hebrew)
 * ============================================================================
 *
 * This module creates a LangGraph-based conversational agent that acts as a
 * professional home-appliance consultant with 15 years of experience. The
 * agent speaks Hebrew, knows all major brands and technologies, and can
 * search Israeli retail sites (Zap, KSP, Ivory, Bug) in real time to provide
 * up-to-date product recommendations, comparisons, and detailed specs.
 *
 * The agent covers the full appliance spectrum:
 *   - Washing machines, dryers, refrigerators, ovens, cooktops
 *   - Dishwashers, air conditioners, vacuum cleaners
 *   - Televisions, sound systems, and small kitchen appliances
 *
 * It can:
 *   - List appliance categories with brands and price ranges
 *   - Search Israeli e-commerce sites for products matching user needs
 *   - Retrieve detailed specs for a specific model
 *   - Find cheaper or feature-rich alternatives to a given product
 *   - Compare multiple products side-by-side
 *   - Explain technical jargon in simple Hebrew (glossary)
 *   - Export comparison tables to Excel or PDF
 *
 * ARCHITECTURE (LangChain / LangGraph Concepts):
 * ------------------------------------------------
 * - **ChatOpenAI**: LangChain wrapper for an OpenAI-compatible chat model.
 *   Points to a configurable Ollama (or any OpenAI-compatible) endpoint.
 *   `temperature=0.3` keeps recommendations data-driven and precise while
 *   still allowing natural conversational flow in Hebrew.
 *
 * - **MemorySaver**: A LangGraph checkpointer that stores conversation state
 *   in-memory. Each request gets a unique `thread_id` so conversations are
 *   isolated. Data is lost when the process restarts (suitable for stateless
 *   REST API usage where each session is short-lived).
 *
 * - **createAgent()**: A high-level LangChain helper (`from "langchain"`) that
 *   wires together a model, tools, system prompt, and optional structured
 *   output schema into a LangGraph `StateGraph`. Under the hood it creates a
 *   ReAct-style agent loop:
 *
 *     ┌──────────────────────────────────────────────────────────────┐
 *     │  User message → LLM decides → call tool? ──yes──> run tool │
 *     │                    │                         │              │
 *     │                    no                    feed result back   │
 *     │                    │                         │              │
 *     │                    ▼                         │              │
 *     │              Return final answer <───────────┘              │
 *     └──────────────────────────────────────────────────────────────┘
 *
 *   The agent can call tools multiple times in a loop (e.g., search →
 *   get details → compare → glossary) until it has enough information to
 *   produce a final structured answer.
 *
 * - **responseFormat (AppliancesAnswerSchema)**: A Zod schema that forces the
 *   LLM's final answer into a structured JSON shape — Hebrew answer text,
 *   product cards with pros/cons, comparison table, disclaimers, etc. This
 *   ensures the API always returns predictable, parseable JSON.
 *
 * TOOLS PROVIDED TO THIS AGENT:
 * - `list_appliance_categories` — Browse all supported categories with brands
 *   and typical Israeli price ranges.
 * - `search_appliances` — Web search across Israeli retail sites (Zap, KSP,
 *   Ivory, Bug) for products matching the user's query, budget, and brand
 *   preferences.
 * - `get_appliance_details` — Deep-dive into a specific product: full specs,
 *   reviews, and pricing via URL extraction or targeted web search.
 * - `find_appliance_alternatives` — Discover competing products when the user
 *   wants cheaper, different-brand, or feature-different options.
 * - `compare_appliances` — Side-by-side comparison of 2+ products with
 *   per-product search results and structured comparison data.
 * - `appliance_glossary` — Hebrew dictionary of technical appliance terms
 *   (inverter, induction, No Frost, OLED, etc.) with simple explanations.
 * - `export_appliance_comparison` — Generate Excel (.xlsx) or PDF files
 *   from structured comparison data for the user to download/share.
 * ============================================================================
 */

import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { appliancesSystemPrompt } from './appliances.prompt';
import { AppliancesAnswerSchema } from './schemas/appliances-answer.schema';
import { listApplianceCategories } from './tools/list-appliance-categories.tool';
import { searchAppliances } from './tools/search-appliances.tool';
import { getApplianceDetails } from './tools/get-appliance-details.tool';
import { findApplianceAlternatives } from './tools/find-appliance-alternatives.tool';
import { compareAppliances } from './tools/compare-appliances.tool';
import { applianceGlossary } from './tools/appliance-glossary.tool';
import { exportApplianceComparison } from './tools/export-appliance-comparison.tool';

/**
 * Factory function that creates and returns a fully configured Appliances agent.
 *
 * @param apiKey - API key for the OpenAI-compatible LLM endpoint.
 * @returns A LangGraph `CompiledStateGraph` (agent) that can be invoked with
 *   `.invoke()` or streamed with `.stream()` to observe each tool-call step.
 *
 * Why 7 tools?
 * Home-appliance queries span a wide range: browsing categories, targeted
 * product search, detailed spec lookup, alternatives discovery, multi-product
 * comparison, jargon explanation, and report export. Each tool handles one
 * concern, and the agent orchestrates them in sequence as needed.
 */
export const createAppliancesAgent = (apiKey: string) => {
    // MemorySaver is a LangGraph checkpointer that stores conversation state
    // (message history, tool call results) in memory. Each invocation uses a
    // unique thread_id to isolate conversations.
    const checkpointer = new MemorySaver();

    // Instantiate the LLM model. temperature=0.3 for precise, data-driven
    // appliance recommendations. 60-second timeout because web-search tools
    // (Tavily) can be slow when doing advanced depth searches.
    const ollamaModel = new ChatOpenAI({
        model: "gpt-oss-120b",
        temperature: 0.3,
        maxRetries: 3,
        timeout: 60000,
        apiKey: "ApiKey here",
        configuration: {
            baseURL: "enter your address here"
        }
    });

    // createAgent() assembles a LangGraph StateGraph with:
    //   - A ReAct agent loop (LLM → tool calls → LLM → ... → final answer)
    //   - The system prompt defining the appliance advisor's personality,
    //     scope (appliances only), workflow, and Hebrew-first language policy
    //   - responseFormat (AppliancesAnswerSchema) constraining the final output
    //     to structured JSON with products, comparison tables, and disclaimers
    //   - The list of 7 tools the LLM can invoke during its reasoning loop
    const agent = createAgent({
        model: ollamaModel,
        checkpointer,
        systemPrompt: appliancesSystemPrompt,
        responseFormat: AppliancesAnswerSchema,
        tools: [
            listApplianceCategories,
            searchAppliances,
            getApplianceDetails,
            findApplianceAlternatives,
            compareAppliances,
            applianceGlossary,
            exportApplianceComparison,
        ],
    });

    return agent;
};
