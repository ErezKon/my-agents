/**
 * ============================================================================
 * IMAGE RECOGNITION TOOLS — Vision-Based Ingredient & Food Identification
 * ============================================================================
 *
 * This module provides LangChain tools that use a vision-capable LLM
 * (pixtral-12b-2409) to analyze food images. Two capabilities are offered:
 *
 *   1. **Ingredients Recognition** — Given a photo of raw ingredients
 *      (e.g., vegetables on a counter), identifies and returns a list of
 *      ingredient names.
 *
 *   2. **Food Recognition** — Given a photo of a prepared dish (e.g., a
 *      plated meal), identifies the dish name and lists the ingredients
 *      needed to recreate it.
 *
 * TOOL VARIANTS:
 * Each capability has two variants:
 *
 *   a. **Closure-based (factory)**: `createIngredientsRecognitionTool()` and
 *      `createFoodRecognitionTool()`. These take the base64 image and apiKey
 *      at creation time and bake them into a closure. The resulting tool
 *      requires zero arguments when called by the LLM — the image is already
 *      captured. This is the preferred variant when the Express handler
 *      receives an image in the request body.
 *
 *   b. **Parameter-based (standalone)**: `convertImageToIngredients` and
 *      `convertImageToFoodDescription`. These require the LLM to pass the
 *      image and apiKey as arguments. Used as a fallback when no image is
 *      pre-loaded.
 *
 * HOW VISION WORKS:
 * The `invokeVisionModel()` helper sends the image as a base64 data URL
 * inside a `HumanMessage` with `type: "image_url"`. The vision model
 * processes the image and returns structured output (via `withStructuredOutput`)
 * matching the provided Zod schema (either ingredients list or food description).
 * ============================================================================
 */

import {HumanMessage, SystemMessage} from '@langchain/core/messages';
import {tool} from "@langchain/core/tools";
import {ChatOpenAI} from '@langchain/openai';
import {z} from "zod";
import {LogColors} from '../../../utils/log-colors.util';

/** System prompt for identifying raw ingredients in a photo. */
const INGREDIENTS_SYSTEM_PROMPT = `
    You are an image recognition LLM Helper.
    You are used to convert an image of food ingredients to a list of ingredients using image recognition LLM.
    Other Agents will use your output to create a recipe.
    
    Given an image of food ingredients, return a list of ingredients using image recognition LLM. 
    The image is base64 encoded.
    If the image is not of food ingredients, return an empty array.`;

/** System prompt for recognizing a prepared dish and listing its ingredients. */
const FOOD_DESCRIPTION_SYSTEM_PROMPT = `
    You are an image recognition LLM Helper.
    You are used to analyze an image of prepared food and recognize the food name and ingredients required to make the food.
    Other Agents will use your output to create a recipe.
    
    Given an image of food, return the food name and ingredients required to make the food using image recognition LLM. 
    The image is base64 encoded.
    If the image is not of food, return an empty ingredients array and no name.`;

/**
 * Generic helper that sends a base64 image to the vision LLM and returns
 * structured output matching the provided Zod schema.
 *
 * @param imageBase64 - The image data as a base64-encoded string.
 * @param apiKey - API key for the Dell GenAI endpoint.
 * @param systemPrompt - Instructions telling the vision model what to extract.
 * @param outputSchema - Zod schema constraining the LLM's output shape.
 * @returns The parsed structured output matching `outputSchema`.
 *
 * The image is sent as a data URL inside a HumanMessage with type "image_url".
 * This is the standard OpenAI vision API format, supported by pixtral-12b.
 */
const invokeVisionModel = async <T extends z.ZodRawShape>(
    imageBase64: string,
    apiKey: string,
    systemPrompt: string,
    outputSchema: z.ZodObject<T>
) => {
    const model = new ChatOpenAI({
        model: "pixtral-12b-2409",
        temperature: 0.1,
        maxRetries: 3,
        timeout: 10000,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: "https://genai-api-dev.dell.com/v1"
        }
    });
    const structuredModel = model.withStructuredOutput(outputSchema);
    const result = await structuredModel.invoke([
        new SystemMessage({ content: systemPrompt }),
        new HumanMessage({
            content: [
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${imageBase64}`,
                    }
                }
            ]
        })
    ]);
    console.log(result);
    return result;
};

/** Zod schema for the ingredients recognition output — a simple string array. */
const ingredientsSchema = z.object({
    ingredients: z.array(z.string()).describe("List of food ingredients identified in the image")
});

/** Zod schema for the food recognition output — dish name + ingredient list. */
const foodDescriptionSchema = z.object({
    name: z.string().describe("The name of the food"),
    ingredients: z.array(z.string()).describe("List of food ingredients required to make the food")
});

/**
 * CLOSURE-BASED TOOL FACTORY: Creates an ingredients recognition tool with
 * the image pre-baked. The LLM calls this tool with zero arguments.
 * Used when the Express handler receives a base64 image in the request body.
 */
export const createIngredientsRecognitionTool = (imageBase64: string, apiKey: string) => tool(
    async () => {
        console.log(`${LogColors.CYAN}[convert_image_to_ingredients]${LogColors.RESET} INPUT: imageBase64 length=${imageBase64.length}`);
        const result = await invokeVisionModel(imageBase64, apiKey, INGREDIENTS_SYSTEM_PROMPT, ingredientsSchema);
        console.log(`${LogColors.CYAN}[convert_image_to_ingredients]${LogColors.RESET} OUTPUT: ${result.ingredients.join(", ")}`);
        return result.ingredients.join(", ");
    },
    {
        name: "convert_image_to_ingredients",
        description: "Analyzes the user's provided image of food ingredients and returns a list of identified ingredients. Call this tool when the user mentions they have an image of ingredients.",
        schema: z.object({}),
    }
);

/**
 * CLOSURE-BASED TOOL FACTORY: Creates a food recognition tool with
 * the image pre-baked. Identifies the dish and its ingredients.
 */
export const createFoodRecognitionTool = (imageBase64: string, apiKey: string) => tool(
    async () => {
        console.log(`${LogColors.MAGENTA}[convert_image_to_food]${LogColors.RESET} INPUT: imageBase64 length=${imageBase64.length}`);
        const result = await invokeVisionModel(imageBase64, apiKey, FOOD_DESCRIPTION_SYSTEM_PROMPT, foodDescriptionSchema);
        console.log(`${LogColors.MAGENTA}[convert_image_to_food]${LogColors.RESET} OUTPUT: ${result.ingredients.join(", ")}`);
        return result.ingredients.join(", ");
    },
    {
        name: "convert_image_to_ingredients",
        description: "Analyzes the user's provided image of food ingredients and returns a list of identified ingredients. Call this tool when the user mentions they have an image of ingredients.",
        schema: z.object({}),
    }
);

/**
 * STANDALONE TOOL (parameter-based): The LLM must pass the base64 image
 * and API key as arguments. Used as a fallback when no image is pre-loaded.
 */
export const convertImageToIngredients = tool(
    async ({ image, apiKey }) => {
        console.log(`${LogColors.CYAN}[convert_image_to_ingredients]${LogColors.RESET} INPUT: image length=${image.length}`);
        const result = await invokeVisionModel(image, apiKey, INGREDIENTS_SYSTEM_PROMPT, ingredientsSchema);
        console.log(`${LogColors.CYAN}[convert_image_to_ingredients]${LogColors.RESET} OUTPUT: ${result.ingredients.join(", ")}`);
        return result.ingredients.join(", ");
    },
    {
        name: "convert_image_to_ingredients",
        description: "Recieves an image of food ingredients and return a list of ingredients using image recognition LLM",
        schema: z.object({
            image: z.string().describe("The image of the food ingredients, The image is base64 encoded"),
            apiKey: z.string().describe("The API key for the image recognition LLM")
        }),
    } 
);

/**
 * STANDALONE TOOL (parameter-based): Food recognition variant that requires
 * the LLM to pass image and API key as arguments.
 */
export const convertImageToFoodDescription = tool(
    async ({ image, apiKey }) => {
        console.log(`${LogColors.MAGENTA}[convert_image_to_food_description]${LogColors.RESET} INPUT: image length=${image.length}`);
        const result = await invokeVisionModel(image, apiKey, FOOD_DESCRIPTION_SYSTEM_PROMPT, foodDescriptionSchema);
        console.log(`${LogColors.MAGENTA}[convert_image_to_food_description]${LogColors.RESET} OUTPUT: ${result.ingredients.join(", ")}`);
        return result.ingredients.join(", ");
    },
    {
        name: "convert_image_to_food_description",
        description: "Recieves an image of food and return the name of the food and a list of ingredients required to make the food using image recognition LLM",
        schema: z.object({
            image: z.string().describe("The image of the food, The image is base64 encoded"),
            apiKey: z.string().describe("The API key for the image recognition LLM")
        }),
    } 
);