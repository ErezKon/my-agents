/**
 * ============================================================================
 * CHEF AGENT — AI-Powered Culinary Assistant with Vision Capabilities
 * ============================================================================
 *
 * This module creates a LangGraph-based conversational agent that acts as
 * "Chef Jacque" — a culinary expert who can:
 *   - Identify ingredients from a photo (base64 image → ingredient list)
 *   - Recognize prepared dishes from photos and reverse-engineer recipes
 *   - Search a local JSON recipe database for matching recipes
 *   - Create new recipes and save them to the database
 *   - Provide step-by-step cooking instructions with chef tips
 *
 * ARCHITECTURE (LangChain / LangGraph Concepts):
 * ------------------------------------------------
 * - **ChatOpenAI**: LangChain wrapper for an OpenAI-compatible chat model.
 *   Points to a Dell internal GenAI endpoint. temperature=0.5 gives the
 *   chef a bit of creative variation in its responses.
 *
 * - **MemorySaver**: A LangGraph checkpointer that stores conversation state
 *   in-memory. Each request gets a unique `thread_id` so conversations are
 *   isolated. Data is lost when the process restarts (suitable for stateless
 *   REST API usage).
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
 *   The agent can call tools multiple times in a loop until it decides it
 *   has enough information to produce a final answer.
 *
 * - **responseFormat (RecipeSchema)**: A Zod schema that forces the LLM's
 *   final answer into a structured JSON shape (recipe ideas, top pick,
 *   chef tips, etc.). This ensures the API always returns predictable JSON.
 *
 * - **Tools**: LangChain `tool()` definitions that the LLM can choose to call.
 *   Each tool has a name, description, and Zod input schema. The LLM reads
 *   the descriptions to decide which tool to invoke and what arguments to pass.
 *
 * TOOLS PROVIDED TO THIS AGENT:
 * - `search_recipe_database` — Searches the local JSON recipe DB by ingredients
 *   or recipe name before creating a new recipe from scratch.
 * - `save_recipe_to_database` — Persists a newly created recipe to the JSON DB.
 * - `convert_image_to_ingredients` — Uses a vision model (pixtral-12b) to
 *   identify raw ingredients in a photo.
 * - `convert_image_to_food_description` — Uses a vision model to recognize a
 *   prepared dish and list its likely ingredients.
 *
 * IMAGE HANDLING:
 * When the caller provides a base64-encoded image, the tool factories
 * (`createIngredientsRecognitionTool`, `createFoodRecognitionTool`) create
 * closure-based tools with the image pre-baked. This way the LLM calls the
 * tool with zero arguments — the image is already captured in the closure.
 * When no image is provided, a fallback tool is used that requires the LLM
 * to pass image data as a parameter (used for direct tool invocations).
 * ============================================================================
 */

import {MemorySaver} from '@langchain/langgraph';
import {ChatOpenAI} from '@langchain/openai';
import {createAgent} from 'langchain';
import {chefSystemPrompt} from './chef.promt';
import {RecipeSchema} from './recipies-db/schemas/recipe.schema';
import {saveRecipeToDatabase} from './tools/save-recipe.tool';
import {searchRecipeDatabase} from './tools/search-recipe.tool';
import {convertImageToIngredients, createFoodRecognitionTool, createIngredientsRecognitionTool} from './tools/image-recognition.tool';

/**
 * Factory function that creates and returns a fully configured Chef agent.
 *
 * @param apiKey - API key for the Dell GenAI endpoint (OpenAI-compatible).
 * @param imageBase64 - Optional base64-encoded image string. When provided,
 *   the image recognition tools are pre-loaded with this image so the LLM
 *   can call them without passing the image data as an argument.
 * @returns A LangGraph `CompiledStateGraph` (agent) that can be invoked with
 *   `.invoke()` or streamed with `.stream()`.
 */
export const createChefAgent = (apiKey: string, imageBase64?: string) => {
    // MemorySaver is a LangGraph checkpointer that stores conversation state
    // (message history, tool call results) in memory. Each invocation uses a
    // unique thread_id to isolate conversations.
    const checkpointer = new MemorySaver();

    // Generic model configuration — replace baseURL and apiKey with your
    // own OpenAI-compatible endpoint (e.g., local Ollama, vLLM, etc.).
    // temperature=0.5 gives the chef some creative variation while still
    // keeping responses grounded and coherent.
    const ollamaModel = new ChatOpenAI({
        model: "gpt-oss-120b",
        temperature: 0.5,
        maxRetries: 3,
        timeout: 10000,
        apiKey: "ApiKey here",
        configuration: {
            baseURL: "enter your address here"
        }
    });

    // If an image was provided by the caller, create closure-based tools that
    // have the image pre-baked (no arguments needed when the LLM calls them).
    // Otherwise, fall back to the generic tool that requires image + apiKey args.
    const convertImageToIngredientsTool = imageBase64
        ? createIngredientsRecognitionTool(imageBase64, apiKey)
        : convertImageToIngredients;

    const convertImageToFoodDescriptionTool = imageBase64
        ? createFoodRecognitionTool(imageBase64, apiKey)
        : convertImageToIngredients;

    // createAgent() assembles a LangGraph StateGraph with:
    //   - A ReAct agent loop (LLM → tool calls → LLM → ... → final answer)
    //   - The system prompt defining Chef Jacque's personality and behavior
    //   - responseFormat (RecipeSchema) constraining the final output to structured JSON
    //   - The list of tools the LLM can invoke during its reasoning loop
    const chat = createAgent({
        model: ollamaModel,
        checkpointer,
        systemPrompt: chefSystemPrompt,
        responseFormat: RecipeSchema,
        tools: [searchRecipeDatabase, saveRecipeToDatabase, convertImageToIngredientsTool, convertImageToFoodDescriptionTool],
    });

    return chat;
}