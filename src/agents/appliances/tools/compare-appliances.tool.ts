/**
 * ============================================================================
 * COMPARE APPLIANCES TOOL — Side-by-Side Product Comparison
 * ============================================================================
 *
 * A LangChain tool that compares two or more home appliances side by side.
 * This is the most data-intensive tool in the Appliances agent — it performs
 * multiple web searches (one general comparison + one per product) to gather
 * enough information for a meaningful multi-dimensional comparison.
 *
 * COMPARISON APPROACH:
 * ────────────────────
 * 1. **General comparison search**: Searches for a direct head-to-head
 *    comparison query (e.g., "Samsung WW90T vs LG F4WV comparison specs
 *    price review Israel 2024"). This often finds dedicated comparison
 *    articles on tech review sites.
 *
 * 2. **Per-product searches**: For each product, performs an individual
 *    search for its specs, price, and reviews. This ensures the agent has
 *    data even if no direct comparison article exists.
 *
 * 3. **Aspect framework**: The tool accepts an optional `aspects` array
 *    specifying which dimensions to compare (e.g., price, energy rating,
 *    noise level). If not provided, defaults to 6 common aspects:
 *    מחיר, ביצועים, צריכת אנרגיה, רעש, גודל, אחריות
 *
 * RETURN FORMAT:
 * The tool returns a JSON string with:
 *   - `products` — list of compared product names
 *   - `aspects` — comparison dimensions
 *   - `comparisonAnswer` — Tavily's synthesized comparison answer
 *   - `comparisonSources` — sources from the general comparison search
 *   - `perProduct` — array of per-product search results
 *
 * The LLM agent uses this data to build the `comparisonTable` field in
 * the `AppliancesAnswerSchema` structured response.
 *
 * PERFORMANCE NOTE:
 * This tool makes N+1 web searches (1 comparison + N per product), where
 * N is the number of products. For 3 products, that's 4 API calls. The
 * per-product searches use "basic" depth (faster) while the comparison
 * search uses "advanced" depth (deeper) to balance speed and quality.
 *
 * DEPENDENCIES:
 * - `tavily-client.util.ts` — Tavily Search API wrapper.
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { tavilySearch } from './tavily-client.util';

const TAG = `${color256(226)}[compare_appliances]${LogColors.RESET}`;

/**
 * LangChain tool: compare_appliances
 *
 * Compares 2+ appliances by performing a general comparison search plus
 * individual per-product searches. Returns structured data the agent
 * can use to build a comparison table.
 */
export const compareAppliances = tool(
    async ({ products, aspects }) => {
        console.log(`${TAG} INPUT: products=[${products.join(", ")}], aspects=[${aspects?.join(", ") || "(default)"}]`);

        // Default comparison dimensions if none specified
        const defaultAspects = ["מחיר", "ביצועים", "צריכת אנרגיה", "רעש", "גודל", "אחריות"];
        const compareAspects = aspects && aspects.length > 0 ? aspects : defaultAspects;

        // Phase 1: General head-to-head comparison search (advanced depth)
        const comparisonQuery = `השוואה ${products.join(" מול ")} מפרט מחיר ביקורת ישראל 2024 2025`;
        const result = await tavilySearch(comparisonQuery, {
            searchDepth: "advanced",
            maxResults: 8,
            includeAnswer: true,
        });

        // Phase 2: Per-product individual searches (basic depth for speed)
        const perProduct: { product: string; searchResults: any[] }[] = [];
        for (const product of products) {
            const productResult = await tavilySearch(`${product} מפרט מחיר ביקורת ישראל`, {
                searchDepth: "basic",
                maxResults: 3,
                includeAnswer: false,
            });
            perProduct.push({
                product,
                searchResults: (productResult.results || []).map(r => ({ title: r.title, url: r.url, content: r.content?.slice(0, 400) })),
            });
        }

        console.log(`${TAG} OUTPUT: comparison with ${perProduct.length} products`);
        return JSON.stringify({
            found: true,
            products,
            aspects: compareAspects,
            comparisonAnswer: result.answer || null,
            comparisonSources: (result.results || []).map(r => ({ title: r.title, url: r.url, content: r.content?.slice(0, 400) })),
            perProduct,
        });
    },
    {
        name: "compare_appliances",
        description: "Compare two or more home appliances side by side. Searches for comparison data, specifications, and reviews for each product. Returns structured data that the agent can use to build a comparison table.",
        schema: z.object({
            products: z.array(z.string()).min(2).describe("List of product names/models to compare (minimum 2)"),
            aspects: z.array(z.string()).optional().describe("Specific aspects to compare (e.g. ['מחיר', 'צריכת אנרגיה', 'רעש']). Defaults to common comparison criteria."),
        }),
    }
);
