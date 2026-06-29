/**
 * ============================================================================
 * IONIQ-6 AGENT — Hyundai IONIQ 6 Electric Car Manual Q&A Assistant
 * ============================================================================
 *
 * This module creates a LangGraph-based agent that answers questions about
 * the Hyundai IONIQ 6 electric vehicle by searching through official PDF
 * car manuals stored locally in the `sources/` directory.
 *
 * This agent is architecturally identical to the MG-4 agent (see mg4.agent.ts)
 * but operates on a different set of source manuals and uses a dedicated
 * system prompt tailored to the IONIQ 6.
 *
 * The agent can:
 *   - Search through the IONIQ 6 Hebrew-language PDF manual for relevant content
 *   - List all available manuals and their sizes
 *   - Generate practical tips for IONIQ 6 owners based on manual content
 *   - Provide answers with direct quotes and page citations
 *   - Support both Hebrew and English (responds in the user's language)
 *
 * AVAILABLE SOURCE MANUALS (Hebrew):
 *   - ספר-רכב-איוניק-6-2023.pdf — IONIQ 6 2023 vehicle manual
 *
 * TOOLS PROVIDED TO THIS AGENT:
 *   - `search_ioniq6_manuals` — Keyword search across IONIQ 6 PDF manuals.
 *   - `list_ioniq6_manuals`   — Lists available PDF files and their sizes.
 *   - `get_ioniq6_tips`       — Retrieves manual excerpts for tip generation.
 *
 * See mg4.agent.ts for a detailed explanation of the shared architecture
 * (ReAct loop, PDF caching, free-form markdown responses, etc.).
 * ============================================================================
 */

import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { ioniq6SystemPrompt } from './ioniq6.prompt';
import { searchManuals } from './tools/search-manuals.tool';
import { listManuals } from './tools/list-manuals.tool';
import { getTips } from './tools/get-tips.tool';

/**
 * Factory function that creates and returns a fully configured IONIQ 6 agent.
 *
 * @param apiKey - API key for the Dell GenAI endpoint (OpenAI-compatible).
 * @returns A LangGraph `CompiledStateGraph` (agent) that can be streamed.
 */
export const createIONIQ6Agent = (apiKey: string) => {
    // In-memory checkpointer — isolates each request's conversation state.
    const checkpointer = new MemorySaver();

    // Generic model configuration — replace baseURL and apiKey with your
    // own OpenAI-compatible endpoint (e.g., local Ollama, vLLM, etc.).
    // temperature=0.3 for factual, manual-grounded answers.
    // timeout=60000 (60s) for PDF parsing on first load.
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

    // Assemble the LangGraph agent with PDF-based tools and the IONIQ 6
    // system prompt. No responseFormat — returns free-form markdown answers.
    const agent = createAgent({
        model: ollamaModel,
        checkpointer,
        systemPrompt: ioniq6SystemPrompt,
        tools: [searchManuals, listManuals, getTips],
    });

    return agent;
};
