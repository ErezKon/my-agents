/**
 * ============================================================================
 * SEARCH APPLIANCES TOOL — Web Search for Home Appliances on Israeli Sites
 * ============================================================================
 *
 * A LangChain tool that searches the internet for home appliances matching
 * the user's query, budget, category, and brand preferences. This is the
 * primary discovery tool — the agent calls it whenever the user asks about
 * a product type or wants recommendations.
 *
 * SEARCH STRATEGY:
 * ────────────────
 * 1. **Query construction**: The tool builds a rich Hebrew search query by
 *    combining the user's free-text query with optional filters:
 *    - Category (e.g., "מכונת כביסה")
 *    - Budget constraint (e.g., "עד 3000 שקל")
 *    - Brand preferences (joined with "OR" for broad matching)
 *    - Year suffix ("2024 2025") to bias toward recent results
 *
 * 2. **Primary search**: Uses Tavily's "advanced" search depth with domain
 *    filtering restricted to major Israeli retail sites:
 *    - zap.co.il (price comparison)
 *    - ksp.co.il (electronics retailer)
 *    - ivory.co.il (electronics retailer)
 *    - bug.co.il (electronics retailer)
 *    - wisebuy.co.il (comparison site)
 *    - magazina.co.il (appliance specialist)
 *
 * 3. **Fallback search**: If the domain-restricted search returns no results
 *    (e.g., for niche products), a broader English fallback search is
 *    performed without domain restrictions.
 *
 * RETURN FORMAT:
 * The tool returns a JSON string with:
 *   - `found` (boolean) — whether any results were found
 *   - `source` — "web_search" or "web_search_fallback"
 *   - `count` — number of results
 *   - `answer` — Tavily's AI-synthesized answer (if available)
 *   - `results` — array of { title, url, content (truncated), score }
 *
 * The agent reads this JSON and uses it to present product options to the
 * user, or to feed specific product URLs into `get_appliance_details` for
 * deeper investigation.
 *
 * DEPENDENCIES:
 * - `tavily-client.util.ts` — Handles the actual Tavily API calls.
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { tavilySearch } from './tavily-client.util';

const TAG = `${color256(214)}[search_appliances]${LogColors.RESET}`;

/**
 * LangChain tool: search_appliances
 *
 * Searches Israeli retail sites for home appliances matching the user's
 * query, category, budget, and brand preferences. Returns product listings
 * with titles, URLs, and content snippets.
 */
export const searchAppliances = tool(
    async ({ query, category, budget, brands }) => {
        console.log(`${TAG} INPUT: query="${query}", category="${category || "(any)"}", budget="${budget || "(any)"}", brands=[${brands?.join(", ") || "(any)"}]`);

        // Build a rich search query combining all user-provided filters
        let searchQuery = query;
        if (category) searchQuery += ` ${category}`;
        if (budget) searchQuery += ` עד ${budget} שקל`;
        if (brands && brands.length > 0) searchQuery += ` ${brands.join(" OR ")}`;
        searchQuery += " ישראל מחיר ביקורת 2024 2025";

        // Primary search: domain-restricted to Israeli retail sites
        const tavilyResult = await tavilySearch(searchQuery, {
            searchDepth: "advanced",
            maxResults: 8,
            includeAnswer: true,
            includeDomains: ["zap.co.il", "ksp.co.il", "ivory.co.il", "bug.co.il", "wisebuy.co.il", "magazina.co.il"],
        });

        // Fallback: if no results from Israeli sites, try a broader search
        if (!tavilyResult.results || tavilyResult.results.length === 0) {
            const fallback = await tavilySearch(query + " home appliance review price Israel", {
                searchDepth: "basic",
                maxResults: 5,
                includeAnswer: true,
            });

            if (!fallback.results || fallback.results.length === 0) {
                console.log(`${TAG} OUTPUT: no results found`);
                return JSON.stringify({ found: false, message: "לא נמצאו תוצאות. נסה לחפש עם מילות מפתח אחרות." });
            }

            console.log(`${TAG} OUTPUT: ${fallback.results.length} fallback results`);
            return JSON.stringify({
                found: true,
                source: "web_search_fallback",
                count: fallback.results.length,
                answer: fallback.answer || null,
                results: fallback.results.map(r => ({ title: r.title, url: r.url, content: r.content?.slice(0, 500), score: r.score })),
            });
        }

        console.log(`${TAG} OUTPUT: ${tavilyResult.results.length} results`);
        return JSON.stringify({
            found: true,
            source: "web_search",
            count: tavilyResult.results.length,
            answer: tavilyResult.answer || null,
            results: tavilyResult.results.map(r => ({ title: r.title, url: r.url, content: r.content?.slice(0, 500), score: r.score })),
        });
    },
    {
        name: "search_appliances",
        description: "Search the internet for home appliances matching the query. Searches Israeli retail sites (Zap, KSP, Ivory, Bug) for products, prices, and reviews. Returns relevant product listings with titles, URLs, and content snippets.",
        schema: z.object({
            query: z.string().describe("Search query — product type, brand, model, or feature (Hebrew or English)"),
            category: z.string().optional().describe("Appliance category in Hebrew (e.g. 'מכונת כביסה', 'מקרר')"),
            budget: z.string().optional().describe("Maximum budget in NIS (e.g. '3000')"),
            brands: z.array(z.string()).optional().describe("Preferred brands to focus on"),
        }),
    }
);
