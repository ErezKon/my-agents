import {z} from "zod";
import {LogColors} from '../../../utils/log-colors.util';
import {tool} from "@langchain/core/tools";
import {readDatabase, writeDatabase} from '../recipies-db/db-utils';
import {RecipeItemSchema} from '../recipies-db/schemas/recipe-item.schema';

export const saveRecipeToDatabase = tool(
    ({ recipe }) => {
      console.log(`${LogColors.RED}[save_recipe_to_database]${LogColors.RESET} INPUT: recipe="${recipe.name}"`);
      const db = readDatabase();

      // Check if a recipe with the same name already exists
      const exists = db.recipes.some(r =>
          r.name.toLowerCase() === recipe.name.toLowerCase()
      );

      if (exists) {
        console.log(`${LogColors.RED}[save_recipe_to_database]${LogColors.RESET} OUTPUT: already exists`);
        return JSON.stringify({
          success: false,
          message: `Recipe "${recipe.name}" already exists in the database.`
        });
      }

      // Add the new recipe
      db.recipes.push(recipe);
      writeDatabase(db);

      console.log(`${LogColors.RED}[save_recipe_to_database]${LogColors.RESET} OUTPUT: saved, totalRecipes=${db.recipes.length}`);
      return JSON.stringify({
        success: true,
        message: `Recipe "${recipe.name}" has been saved to the database for future use!`,
        totalRecipes: db.recipes.length
      });
    },
    {
      name: "save_recipe_to_database",
      description: "Save a newly created recipe to the database so it can be found in future searches. Use this after creating a new recipe that wasn't in the database.",
      schema: z.object({
        recipe: RecipeItemSchema.describe("The complete recipe to save"),
      }),
    }
);