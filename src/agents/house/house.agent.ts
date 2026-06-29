/**
 * ============================================================================
 * HOUSE AGENT — AI-Powered Real Estate Document & Blueprint Analyzer
 * ============================================================================
 *
 * This module creates a LangGraph-based agent that acts as a dual expert:
 * a real estate lawyer AND a construction engineer. It analyzes house
 * purchase documents (contracts, appendices, specifications) and
 * construction blueprints (architectural plans, electrical diagrams).
 *
 * The agent can:
 *   - Search and read house purchase contracts (Hebrew PDFs)
 *   - Search construction diagrams for text labels and annotations
 *   - Render diagram pages as images for visual analysis
 *   - Measure distances and areas on blueprints using scale conversion
 *   - Explain real estate and construction terminology in simple Hebrew
 *
 * ARCHITECTURE (LangChain / LangGraph Concepts):
 * ------------------------------------------------
 * - **ChatOpenAI**: LangChain wrapper for an OpenAI-compatible chat model.
 *   Uses the generic ollamaModel configuration for flexible deployment.
 *
 * - **MemorySaver**: In-memory checkpointer for conversation state isolation.
 *
 * - **createAgent()**: Assembles a LangGraph ReAct agent with the model,
 *   tools, and system prompt. The agent loops between reasoning and tool
 *   execution until it has enough information for a final answer.
 *
 * TOOLS PROVIDED TO THIS AGENT:
 * - `list_house_documents` — Lists available contracts and diagrams.
 * - `read_house_document` — Reads PDF text content page by page.
 * - `search_house_contracts` — Keyword search in contract PDFs.
 * - `search_house_diagrams` — Keyword search in diagram PDFs.
 * - `render_diagram_page` — Renders a diagram page to JPEG for visual analysis.
 * - `set_diagram_scale` — Sets the drawing scale for measurements.
 * - `measure_on_diagram` — Calculates real-world distances/areas from points.
 * - `house_glossary` — Explains real estate and construction terms.
 * ============================================================================
 */

import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { houseSystemPrompt } from './house.prompt';
import { HouseAnswerSchema } from './schemas/house-answer.schema';
import { listHouseDocuments } from './tools/list-house-documents.tool';
import { readHouseDocument } from './tools/read-house-document.tool';
import { searchHouseContracts } from './tools/search-house-contracts.tool';
import { searchHouseDiagrams } from './tools/search-house-diagrams.tool';
import { renderDiagramPage } from './tools/render-diagram-page.tool';
import { setDiagramScale } from './tools/set-diagram-scale.tool';
import { measureOnDiagram } from './tools/measure-on-diagram.tool';
import { houseGlossary } from './tools/house-glossary.tool';

/**
 * Factory function that creates and returns a fully configured House agent.
 *
 * @param apiKey - API key for the LLM endpoint (OpenAI-compatible).
 * @returns A LangGraph CompiledStateGraph (agent) that can be streamed.
 */
export const createHouseAgent = (apiKey: string) => {
    const checkpointer = new MemorySaver();

    // Generic model configuration — replace baseURL and apiKey with your
    // own OpenAI-compatible endpoint (e.g., local Ollama, vLLM, etc.).
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

    const agent = createAgent({
        model: ollamaModel,
        checkpointer,
        systemPrompt: houseSystemPrompt,
        tools: [
            listHouseDocuments,
            readHouseDocument,
            searchHouseContracts,
            searchHouseDiagrams,
            renderDiagramPage,
            setDiagramScale,
            measureOnDiagram,
            houseGlossary,
        ],
    });

    return agent;
};
