import {MemorySaver} from '@langchain/langgraph';
import {ChatOpenAI} from '@langchain/openai';
import {createAgent} from 'langchain';
import {chefSystemPrompt} from './chef.promt';
import {RecipeSchema} from './recipies-db/schemas/recipe.schema';
import {saveRecipeToDatabase} from './tools/save-recipe.tool';
import {searchRecipeDatabase} from './tools/search-recipe.tool';
import {convertImageToIngredients, createFoodRecognitionTool, createIngredientsRecognitionTool} from './tools/image-recognition.tool';

export const createChefAgent = (apiKey: string, imageBase64?: string) => {
    const checkpointer = new MemorySaver();

    // Instantiate the model
    const model = new ChatOpenAI({
        model: "gpt-oss-120b",
        temperature: 0.5,
        maxRetries: 3,
        timeout: 10000,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: "https://genai-api-dev.dell.com/v1"
        }
    });

    const convertImageToIngredientsTool = imageBase64
        ? createIngredientsRecognitionTool(imageBase64, apiKey)
        : convertImageToIngredients;

    const convertImageToFoodDescriptionTool = imageBase64
        ? createFoodRecognitionTool(imageBase64, apiKey)
        : convertImageToIngredients;

    const chat = createAgent({
        model,
        checkpointer,
        systemPrompt: chefSystemPrompt,
        responseFormat: RecipeSchema,
        tools: [searchRecipeDatabase, saveRecipeToDatabase, convertImageToIngredientsTool, convertImageToFoodDescriptionTool],
    });

    return chat;
}