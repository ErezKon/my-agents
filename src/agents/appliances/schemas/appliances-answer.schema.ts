/**
 * ============================================================================
 * APPLIANCES ANSWER SCHEMA — Structured Output for the Appliances Agent
 * ============================================================================
 *
 * This Zod schema defines the shape of the Appliances agent's final structured
 * response. It is passed as `responseFormat` to `createAgent()`, which forces
 * the LLM to produce JSON matching this exact shape after completing its
 * tool-calling reasoning loop.
 *
 * The schema is designed for a Hebrew-speaking appliance advisor, so most
 * text fields contain Hebrew content. Brand/product names use both Hebrew
 * and English as appropriate.
 *
 * MAJOR SECTIONS:
 * ───────────────
 * - `answerHebrew` — The full, human-readable answer in Hebrew. This is the
 *   primary field displayed to the user in a chat UI.
 * - `summary` — A concise 1–2 sentence Hebrew summary, useful for
 *   notification previews or quick-glance cards.
 * - `category` — The appliance category discussed (e.g., "מכונת כביסה"),
 *   used for routing, analytics, and UI categorization.
 * - `products` — Array of product cards, each with name, brand, price range,
 *   optional user rating, pros/cons in Hebrew, and a `isRecommended` flag
 *   indicating the agent's top pick.
 * - `comparisonTable` — Optional structured table rows for side-by-side
 *   product comparisons. Each row has a feature name and an array of values
 *   (one per product). The frontend can render this as an HTML/Markdown table.
 * - `openIssues` — Array of follow-up questions the agent wants to ask the
 *   user (e.g., "מה התקציב שלך?", "כמה ק״ג כביסה אתה צריך?"). Keeps the
 *   conversation going when more info is needed.
 * - `disclaimer` — Mandatory price/availability disclaimer in Hebrew,
 *   required by the system prompt's safety rules.
 *
 * Most fields are required to ensure consistent API responses, but
 * `comparisonTable` is optional since not every query involves a comparison.
 * ============================================================================
 */

import { z } from "zod";

export const AppliancesAnswerSchema = z.object({
    answerHebrew: z.string().describe("The full answer in Hebrew"),
    summary: z.string().describe("A brief Hebrew summary (1-2 sentences)"),
    category: z.string().describe("The appliance category discussed"),
    products: z.array(z.object({
        name: z.string().describe("Product name (Hebrew and English)"),
        brand: z.string().describe("Brand name"),
        priceRange: z.string().describe("Price or price range in NIS"),
        rating: z.string().optional().describe("User rating if available"),
        prosHebrew: z.array(z.string()).describe("Advantages in Hebrew"),
        consHebrew: z.array(z.string()).describe("Disadvantages in Hebrew"),
        isRecommended: z.boolean().describe("Whether this is the top pick"),
    })).describe("Products discussed or recommended"),
    comparisonTable: z.array(z.object({
        feature: z.string().describe("Feature name in Hebrew"),
        values: z.array(z.string()).describe("Value for each product"),
    })).optional().describe("Comparison table rows"),
    openIssues: z.array(z.string()).describe("Open questions in Hebrew"),
    disclaimer: z.string().describe("Price/availability disclaimer in Hebrew"),
});
