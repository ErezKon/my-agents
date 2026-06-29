/**
 * ============================================================================
 * RECIPE RESPONSE SCHEMA — Structured Output for the Chef Agent
 * ============================================================================
 *
 * This Zod schema defines the shape of the Chef agent's final structured
 * response. It is passed as `responseFormat` to `createAgent()`, which
 * forces the LLM to produce JSON matching this exact shape.
 *
 * Fields:
 * - `initialReaction`: The chef's enthusiastic first reaction to the query.
 * - `producedRecipe`: Whether a recipe was successfully produced.
 * - `recipeIdeas`: Array of 0–3 possible recipe suggestions (name + reason).
 * - `topPick`: The full recipe for the chef's top recommendation,
 *   including ingredients, instructions, timing, difficulty, tips, etc.
 *   Uses `RecipeItemSchema` for the detailed recipe structure.
 * - `source`: Whether the recipe came from the local database or was
 *   freshly created by the LLM.
 * ============================================================================
 */
import {z} from "zod";
import {RecipeItemSchema} from './recipe-item.schema';

export const RecipeSchema = z.object({
  // Initial reaction
  initialReaction: z
      .string()
      .describe("Chef's enthusiastic 1-2 sentence reaction to the ingredients provided"),

  producedRecipe: z.boolean().optional().describe("Whether a recipe was produced"),

  // Recipe ideas
  recipeIdeas: z
      .array(z.object({
        name: z.string().describe("Recipe name"),
        whyItWorks: z.string().describe("Brief explanation of why this recipe works with the provided ingredients"),
        isTopPick: z.boolean().describe("Whether this is the recommended top pick"),
      }))
      .min(0)
      .max(3)
      .describe("1-3 recipe options ranked by how well they use the provided ingredients. if no recipe ideas are generated, this field should be an empty array"),

  // The detailed top pick recipe
  topPick: RecipeItemSchema
      .optional()
      .describe("The detailed top pick recipe. If no recipe ideas are generated, this field should be undefined"),

  // Source indicator
  source: z
      .enum(["database", "freshly_created"])
      .optional()
      .describe("Whether this recipe came from the database or was freshly created. If no recipe ideas are generated, this field should be undefined"),
});