/**
 * ============================================================================
 * RECIPE ITEM SCHEMA — Single Recipe Data Structure
 * ============================================================================
 *
 * Zod schema defining the structure of a single recipe, used both:
 *   1. As the database record format in `recipes-db.json`.
 *   2. As the `topPick` field in the Chef agent's structured response.
 *   3. As the input schema for the `save_recipe_to_database` tool.
 *
 * Every recipe includes name, explanation, ingredients, cooking times,
 * difficulty level, step-by-step instructions, chef tips, and variations.
 * ============================================================================
 */
import {z} from "zod";

// Schema for a single recipe (used in database and agent responses)
export const RecipeItemSchema = z.object({
  name: z.string().describe("Name of the recipe"),
  whyThisWorks: z
      .string()
      .describe("1-2 sentences explaining why this recipe works"),
  additionalIngredients: z
      .array(z.string())
      .describe("Non-pantry-staple ingredients needed. Empty array if none needed"),
  prepTime: z.string().describe("Preparation time, e.g., '10 min'"),
  cookTime: z.string().describe("Cooking time, e.g., '25 min'"),
  difficulty: z
      .enum(["Easy", "Medium", "Challenging"])
      .describe("Skill level required"),
  instructions: z
      .array(z.string())
      .describe("Step-by-step instructions"),
  chefTips: z
      .array(z.string())
      .min(1)
      .max(2)
      .describe("1-2 practical tips specific to this recipe"),
  variations: z
      .array(z.string())
      .min(1)
      .max(2)
      .describe("1-2 simple swaps or additions to experiment with"),
});