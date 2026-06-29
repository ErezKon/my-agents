/**
 * ============================================================================
 * FIND APPLIANCE ALTERNATIVES TOOL — Discover Competing Products
 * ============================================================================
 *
 * A LangChain tool that finds alternative products to a specific appliance.
 * This is called when the user says things like:
 *   - "Is there something cheaper?"
 *   - "What about a different brand?"
 *   - "I want more features for the same price"
 *   - "What are the alternatives to [product X]?"
 *
 * SEARCH STRATEGY:
 * ────────────────
 * The tool constructs a Hebrew search query combining:
 *   - The original product name (e.g., "LG F4WV708S1E")
 *   - The reason for seeking alternatives (e.g., "cheaper", "more features")
 *   - Budget constraint if provided (e.g., "עד 2500 שקל")
 *   - Year and recommendation keywords to bias toward recent reviews
 *
 * It uses Tavily's "advanced" search depth (deep research mode) to find
 * comparison articles, forum discussions, and retailer pages that discuss
 * competing products in the same category.
 *
 * RETURN FORMAT:
 * The tool returns a JSON string with:
 *   - `found` (boolean) — whether alternatives were found
 *   - `originalProduct` — the product the user wants to replace
 *   - `reason` — why the user wants alternatives
 *   - `count` — number of alternative sources found
 *   - `answer` — Tavily's AI-synthesized answer (if available)
 *   - `alternatives` — array of { title, url, content (truncated), score }
 *
 * The agent then parses these results and presents 2–4 concrete alternative
 * products with pros, cons, and price comparisons.
 *
 * WORKFLOW POSITION:
 * This tool is typically called AFTER `search_appliances` and/or
 * `get_appliance_details` — the user has already seen a product and wants
 * to explore other options. It may be followed by `compare_appliances`
 * if the user wants a side-by-side comparison.
 *
 * DEPENDENCIES:
 * - `tavily-client.util.ts` — Tavily Search API wrapper.
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { tavilySearch } from './tavily-client.util';

const TAG = `${color256(190)}[find_appliance_alternatives]${LogColors.RESET}`;

/**
 * LangChain tool: find_appliance_alternatives
 *
 * Searches for alternative products to a given appliance based on the user's
 * reason (cheaper, different brand, more features) and optional budget.
 */
export const findApplianceAlternatives = tool(
    async ({ productName, reason, budget }) => {
        console.log(`${TAG} INPUT: product="${productName}", reason="${reason || "(general)"}", budget="${budget || "(any)"}"`);

        // Build a Hebrew search query for alternatives
        let query = `אלטרנטיבות ל${productName}`;
        if (reason) query += ` ${reason}`;
        if (budget) query += ` עד ${budget} שקל`;
        query += " ישראל 2024 2025 המלצות";

        const result = await tavilySearch(query, {
            searchDepth: "advanced",
            maxResults: 6,
            includeAnswer: true,
        });

        if (!result.results || result.results.length === 0) {
            console.log(`${TAG} OUTPUT: no alternatives found`);
            return JSON.stringify({ found: false, message: `לא נמצאו אלטרנטיבות ל"${productName}".` });
        }

        console.log(`${TAG} OUTPUT: ${result.results.length} alternatives found`);
        return JSON.stringify({
            found: true,
            originalProduct: productName,
            reason: reason || "general",
            count: result.results.length,
            answer: result.answer || null,
            alternatives: result.results.map(r => ({ title: r.title, url: r.url, content: r.content?.slice(0, 400), score: r.score })),
        });
    },
    {
        name: "find_appliance_alternatives",
        description: "Find alternative products to a specific appliance. Useful when the user wants cheaper options, different brands, or products with specific features. Searches Israeli retail sites for competing products.",
        schema: z.object({
            productName: z.string().describe("The original product to find alternatives for"),
            reason: z.string().optional().describe("Why the user wants alternatives (e.g. 'cheaper', 'different brand', 'more features')"),
            budget: z.string().optional().describe("Maximum budget in NIS"),
        }),
    }
);
