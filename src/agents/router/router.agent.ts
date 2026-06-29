/**
 * ============================================================================
 * ROUTER AGENT — Intelligent Question Classifier
 * ============================================================================
 *
 * This module implements a "router" (also called a "dispatcher" or "orchestrator")
 * that sits in front of all specialist agents. Instead of requiring the user to
 * pick the right endpoint, they can send any question to the unified `/api/ask`
 * endpoint and this router will:
 *
 *   1. Send the user's question to an LLM with a classification prompt.
 *   2. The LLM returns a structured JSON object indicating which specialist
 *      agent is best suited to handle the question (chef, stocks, mg4, ioniq6).
 *   3. The main Express handler in `index.ts` then delegates to the chosen agent.
 *
 * HOW IT WORKS (LangChain Concepts):
 * -----------------------------------
 * - **ChatOpenAI**: LangChain's wrapper around the OpenAI-compatible chat API.
 *   Here it points to a Dell internal GenAI endpoint via `baseURL`.
 *
 * - **withStructuredOutput(zodSchema)**: A LangChain method that constrains the
 *   LLM to always return JSON matching the given Zod schema. Internally it uses
 *   OpenAI's function-calling / tool-use mechanism so the output is guaranteed
 *   to parse into `{ agent: "chef"|"stocks"|…, reasoning: "…" }`.
 *
 * - **SystemMessage / HumanMessage**: LangChain message types that map directly
 *   to the OpenAI chat-completions `role: "system"` and `role: "user"` fields.
 *
 * NOTE: This router does NOT use LangGraph or tools — it is a single LLM call
 * with structured output. It is intentionally lightweight so classification is
 * fast (typically <2 seconds).
 * ============================================================================
 */

import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

/**
 * Zod schema that defines the shape of the LLM's classification response.
 *
 * - `agent`: One of the four specialist agents, or "unknown" if the question
 *   doesn't match any agent's domain.
 * - `reasoning`: A brief human-readable explanation of why the LLM chose
 *   that agent. Useful for debugging and for returning to the client.
 *
 * This schema is passed to `model.withStructuredOutput()` so the LLM is
 * forced to produce exactly this JSON shape (no free-form text).
 */
export const AgentNameSchema = z.object({
    agent: z.enum(['chef', 'stocks', 'mg4', 'ioniq6', 'unknown']).describe(
        'The agent best suited to answer the user question'
    ),
    reasoning: z.string().describe('Brief explanation of why this agent was chosen'),
});

/** TypeScript type derived from the Zod schema for use in function signatures. */
export type AgentClassification = z.infer<typeof AgentNameSchema>;

/**
 * System prompt that instructs the LLM on how to classify questions.
 *
 * Key design decisions:
 * - Each agent's domain is explicitly listed so the LLM knows what qualifies.
 * - Ambiguous cases (e.g., "car" without specifying which model) are routed
 *   to "unknown" so the server can return a helpful error message.
 * - The prompt asks for concise reasoning to keep latency low.
 */
const ROUTER_SYSTEM_PROMPT = `You are a routing assistant. Your ONLY job is to decide which specialist agent should handle the user's question.

Available agents:
1. **chef** — Handles anything related to food, cooking, recipes, ingredients, dishes, or food images. Choose this if the user asks about meals, recipes, how to cook something, or sends a food image.
2. **stocks** — Handles anything related to stock markets, share prices, financial data, market analysis, portfolios, dividends, indices, TASE (Tel Aviv Stock Exchange), and investment-related queries.
3. **mg4** — Handles questions specifically about the MG-4 electric car (MG4). This includes charging, features, specifications, troubleshooting, and anything from the MG-4 owner's manual.
4. **ioniq6** — Handles questions specifically about the Hyundai IONIQ 6 electric car. This includes charging, features, specifications, troubleshooting, and anything from the IONIQ 6 owner's manual.

Rules:
- If the question clearly matches one agent, choose it.
- If the question mentions a car but doesn't specify which one, choose "unknown".
- If the question doesn't match any agent, choose "unknown".
- Be concise in your reasoning (one sentence).`;

/**
 * Classifies a user question and returns which specialist agent should handle it.
 *
 * @param apiKey - API key for the Dell GenAI endpoint (OpenAI-compatible).
 * @param message - The raw user question text.
 * @returns An `AgentClassification` object with `agent` and `reasoning` fields.
 *
 * Flow:
 * 1. Instantiate a ChatOpenAI model with temperature=0 (deterministic classification).
 * 2. Wrap it with `.withStructuredOutput(AgentNameSchema)` so the LLM must return
 *    a JSON object matching our Zod schema.
 * 3. Invoke the model with the system prompt + user message.
 * 4. Return the parsed classification result.
 */
export const classifyQuestion = async (
    apiKey: string,
    message: string,
): Promise<AgentClassification> => {
    // Create a ChatOpenAI instance pointing to the Dell GenAI endpoint.
    // temperature=0 ensures consistent, deterministic classification results.
    const model = new ChatOpenAI({
        model: 'gpt-oss-120b',
        temperature: 0,
        maxRetries: 3,
        timeout: 15000,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: 'https://genai-api-dev.dell.com/v1',
        },
    });

    // withStructuredOutput() tells LangChain to use OpenAI's function-calling
    // mechanism under the hood. The LLM will always return valid JSON matching
    // our AgentNameSchema — no parsing or regex extraction needed.
    const structured = model.withStructuredOutput(AgentNameSchema);

    // Invoke the model with the classification prompt and the user's question.
    // The result is already typed as AgentClassification (no JSON.parse needed).
    const result = await structured.invoke([
        new SystemMessage(ROUTER_SYSTEM_PROMPT),
        new HumanMessage(message),
    ]);

    return result;
};
