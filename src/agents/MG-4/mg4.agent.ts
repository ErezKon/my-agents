/**
 * ============================================================================
 * MG-4 AGENT — Electric Car Manual Q&A Assistant
 * ============================================================================
 *
 * This module creates a LangGraph-based agent that answers questions about
 * the MG-4 electric vehicle by searching through official PDF car manuals
 * stored locally in the `sources/` directory.
 *
 * The agent can:
 *   - Search across multiple Hebrew-language PDF manuals for relevant content
 *   - List all available manuals and their sizes
 *   - Generate practical tips for car owners based on manual content
 *   - Provide answers with direct quotes and page citations
 *   - Respond in the same language the user uses (Hebrew or English)
 *
 * ARCHITECTURE:
 * Same LangGraph ReAct pattern as the other agents (see chef.agent.ts for
 * a detailed explanation). Key differences:
 *
 * - **No responseFormat**: Unlike the Chef and Stocks agents, the MG-4 agent
 *   returns free-form markdown text (not structured JSON). This is because
 *   car manual answers are narrative and don't fit a rigid schema.
 *   The markdown content is extracted from the last AI message in the
 *   conversation by `saveMG4Output()` in the utils.
 *
 * - **timeout=60000**: 60-second timeout because PDF parsing can be slow,
 *   especially on first load when manuals are not yet cached in memory.
 *
 * - **PDF-based tools**: Instead of external APIs, all three tools read from
 *   local PDF files using the `pdf-parse` library. Pages are cached in memory
 *   after first parse for subsequent requests.
 *
 * AVAILABLE SOURCE MANUALS (Hebrew):
 *   - ספר נהג.pdf         — Driver's manual (main reference)
 *   - נספח לספר נהג.pdf    — Supplement to the driver's manual
 *   - מדריך מקוצר.pdf      — Quick reference guide
 *
 * TOOLS PROVIDED TO THIS AGENT:
 *   - `search_mg4_manuals` — Keyword search across all PDF manuals,
 *     returns relevant excerpts with source file and page number.
 *   - `list_mg4_manuals`   — Lists available PDF files and their sizes.
 *   - `get_mg4_tips`       — Retrieves manual excerpts for tip generation,
 *     optionally filtered by topic (e.g., "charging", "safety").
 * ============================================================================
 */

import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { mg4SystemPrompt } from './mg4.prompt';
import { searchManuals } from './tools/search-manuals.tool';
import { listManuals } from './tools/list-manuals.tool';
import { getTips } from './tools/get-tips.tool';

/**
 * Factory function that creates and returns a fully configured MG-4 agent.
 *
 * @param apiKey - API key for the Dell GenAI endpoint (OpenAI-compatible).
 * @returns A LangGraph `CompiledStateGraph` (agent) that can be streamed
 *   with `.stream()` to observe each tool-call step.
 */
export const createMG4Agent = (apiKey: string) => {
    // In-memory checkpointer — isolates each request's conversation state.
    const checkpointer = new MemorySaver();

    // Generic model configuration — replace baseURL and apiKey with your
    // own OpenAI-compatible endpoint (e.g., local Ollama, vLLM, etc.).
    // temperature=0.3 keeps answers factual and grounded in manual content.
    // timeout=60000 (60s) accounts for slow PDF parsing on first load.
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

    // Assemble the LangGraph agent with PDF-based tools and the MG-4
    // system prompt (defines scope, citation format, language handling).
    // No responseFormat — the agent returns free-form markdown answers.
    const agent = createAgent({
        model: ollamaModel,
        checkpointer,
        systemPrompt: mg4SystemPrompt,
        tools: [searchManuals, listManuals, getTips],
    });

    return agent;
};
