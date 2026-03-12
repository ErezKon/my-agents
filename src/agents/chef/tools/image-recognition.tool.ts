import {HumanMessage, SystemMessage} from '@langchain/core/messages';
import {tool} from "@langchain/core/tools";
import {ChatOpenAI} from '@langchain/openai';
import {z} from "zod";
import {LogColors} from '../../../utils/log-colors.util';

const INGREDIENTS_SYSTEM_PROMPT = `
    You are an image recognition LLM Helper.
    You are used to convert an image of food ingredients to a list of ingredients using image recognition LLM.
    Other Agents will use your output to create a recipe.
    
    Given an image of food ingredients, return a list of ingredients using image recognition LLM. 
    The image is base64 encoded.
    If the image is not of food ingredients, return an empty array.`;

const FOOD_DESCRIPTION_SYSTEM_PROMPT = `
    You are an image recognition LLM Helper.
    You are used to analyze an image of prepared food and recognize the food name and ingredients required to make the food.
    Other Agents will use your output to create a recipe.
    
    Given an image of food, return the food name and ingredients required to make the food using image recognition LLM. 
    The image is base64 encoded.
    If the image is not of food, return an empty ingredients array and no name.`;

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

const ingredientsSchema = z.object({
    ingredients: z.array(z.string()).describe("List of food ingredients identified in the image")
});

const foodDescriptionSchema = z.object({
    name: z.string().describe("The name of the food"),
    ingredients: z.array(z.string()).describe("List of food ingredients required to make the food")
});

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