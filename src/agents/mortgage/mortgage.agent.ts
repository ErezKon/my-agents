/**
 * ============================================================================
 * MORTGAGE AGENT — AI-Powered Mortgage Advisor & Offer Analyzer
 * ============================================================================
 *
 * This module creates a LangGraph-based agent that acts as a senior mortgage
 * advisor with 20 years of experience in the Israeli mortgage market. It
 * analyzes mortgage offers from different banks, compares terms, calculates
 * payments, and provides optimization recommendations.
 *
 * The agent can:
 *   - List and read mortgage offer PDFs from multiple banks
 *   - Search across all offers for specific terms and conditions
 *   - Compare offers side by side across multiple aspects
 *   - Fetch current Bank of Israel rates, prime rate, and CPI
 *   - Calculate monthly payments and total costs for any mortgage mix
 *   - Explain mortgage terminology in simple Hebrew
 *
 * ARCHITECTURE (LangChain / LangGraph Concepts):
 * ------------------------------------------------
 * - **ChatOpenAI**: Uses the generic ollamaModel configuration for flexible
 *   deployment to any OpenAI-compatible endpoint.
 *
 * - **MemorySaver**: In-memory checkpointer for conversation state isolation.
 *   Each request gets a unique thread_id.
 *
 * - **createAgent()**: Assembles a LangGraph ReAct agent. The mortgage agent
 *   may call multiple tools per request (e.g., read an offer, fetch rates,
 *   calculate payments) before producing its final analysis.
 *
 * - **responseFormat (MortgageAnswerSchema)**: Structured output with answer,
 *   recommendations, citations, and open issues.
 *
 * TOOLS PROVIDED TO THIS AGENT:
 * - `list_mortgage_offers` — Lists available mortgage offer PDFs by bank.
 * - `read_mortgage_offer` — Reads full text of a specific offer PDF.
 * - `search_mortgage_offers` — Keyword search across all offer PDFs.
 * - `compare_mortgage_offers` — Side-by-side comparison across banks.
 * - `fetch_current_rates` — Fetches BOI rate, prime, and CPI from official sources.
 * - `mortgage_glossary` — Explains mortgage terms in simple Hebrew.
 * - `mortgage_calculator` — Calculates payments for any mortgage track mix.
 * ============================================================================
 */

import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { mortgageSystemPrompt } from './mortgage.prompt';
import { MortgageAnswerSchema } from './schemas/mortgage-answer.schema';
import { listMortgageOffers } from './tools/list-mortgage-offers.tool';
import { readMortgageOffer } from './tools/read-mortgage-offer.tool';
import { searchMortgageOffers } from './tools/search-mortgage-offers.tool';
import { compareMortgageOffers } from './tools/compare-mortgage-offers.tool';
import { fetchCurrentRates } from './tools/fetch-current-rates.tool';
import { mortgageGlossary } from './tools/mortgage-glossary.tool';
import { mortgageCalculator } from './tools/mortgage-calculator.tool';

/**
 * Factory function that creates and returns a fully configured Mortgage agent.
 *
 * @param apiKey - API key for the LLM endpoint (OpenAI-compatible).
 * @returns A LangGraph CompiledStateGraph (agent) that can be streamed.
 */
export const createMortgageAgent = (apiKey: string) => {
    // In-memory checkpointer — isolates each request's conversation state.
    const checkpointer = new MemorySaver();

    // Generic model configuration — replace baseURL and apiKey with your
    // own OpenAI-compatible endpoint (e.g., local Ollama, vLLM, etc.).
    // temperature=0.3 for precise, data-driven mortgage analysis.
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

    // Assemble the LangGraph agent with all mortgage tools, the system
    // prompt (defining the advisor's persona and response framework),
    // and the structured output schema ensuring consistent JSON responses.
    const agent = createAgent({
        model: ollamaModel,
        checkpointer,
        systemPrompt: mortgageSystemPrompt,
        responseFormat: MortgageAnswerSchema,
        tools: [
            listMortgageOffers,
            readMortgageOffer,
            searchMortgageOffers,
            compareMortgageOffers,
            fetchCurrentRates,
            mortgageGlossary,
            mortgageCalculator,
        ],
    });

    return agent;
};
