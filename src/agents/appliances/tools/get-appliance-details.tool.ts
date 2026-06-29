/**
 * ============================================================================
 * GET APPLIANCE DETAILS TOOL — Deep Product Information Retrieval
 * ============================================================================
 *
 * A LangChain tool that retrieves detailed information about a specific home
 * appliance — technical specifications, features, pricing, and user reviews.
 * This is the "zoom-in" tool, called after `search_appliances` identifies
 * candidate products that the user is interested in.
 *
 * TWO-PHASE RETRIEVAL STRATEGY:
 * ─────────────────────────────
 * 1. **URL extraction (preferred)**: If a `productUrl` is provided (typically
 *    from a previous `search_appliances` result), the tool uses Tavily's
 *    Extract API to fetch and parse the raw content of that product page.
 *    This yields the most detailed and accurate information — full spec
 *    sheets, exact pricing, user reviews, and stock availability.
 *
 * 2. **Web search fallback**: If no URL is provided, or if URL extraction
 *    fails (e.g., the page blocks bots), the tool falls back to a targeted
 *    web search for the product name plus Hebrew keywords for specs, price,
 *    and reviews. Results from multiple sources are combined into a single
 *    content block for the LLM to analyze.
 *
 * RETURN FORMAT:
 * The tool returns a JSON string with:
 *   - `found` (boolean) — whether detailed info was found
 *   - `source` — "url_extract" or "web_search"
 *   - `productName` — echo of the requested product
 *   - `content` — the extracted or combined content text
 *   - `answer` — Tavily's AI-synthesized answer (web search only)
 *   - `urls` — source URLs for attribution
 *
 * The LLM agent uses this content to populate the structured response
 * fields (specs, pros, cons, pricing) in the `AppliancesAnswerSchema`.
 *
 * DEPENDENCIES:
 * - `tavily-client.util.ts` — Tavily Search & Extract API wrapper.
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { tavilySearch, tavilyExtract } from './tavily-client.util';

const TAG = `${color256(202)}[get_appliance_details]${LogColors.RESET}`;

/**
 * LangChain tool: get_appliance_details
 *
 * Retrieves detailed specs, pricing, and reviews for a specific appliance.
 * Prefers URL extraction when a product page URL is available; falls back
 * to web search otherwise.
 */
export const getApplianceDetails = tool(
    async ({ productName, productUrl }) => {
        console.log(`${TAG} INPUT: product="${productName}", url="${productUrl || "(none)"}"`);

        // Phase 1: Try extracting content from a direct product URL
        if (productUrl) {
            const extractResult = await tavilyExtract([productUrl]);
            if (extractResult.results && extractResult.results.length > 0) {
                const content = extractResult.results[0].raw_content.slice(0, 3000);
                console.log(`${TAG} OUTPUT: extracted ${content.length} chars from URL`);
                return JSON.stringify({
                    found: true,
                    source: "url_extract",
                    productName,
                    url: productUrl,
                    content,
                });
            }
        }

        // Phase 2: Fall back to web search for the product name
        const searchResult = await tavilySearch(`${productName} מפרט טכני מחיר ביקורת ישראל`, {
            searchDepth: "advanced",
            maxResults: 5,
            includeAnswer: true,
        });

        if (!searchResult.results || searchResult.results.length === 0) {
            console.log(`${TAG} OUTPUT: not found`);
            return JSON.stringify({ found: false, message: `לא נמצא מידע מפורט על "${productName}".` });
        }

        // Combine content from multiple sources into a single block
        const combinedContent = searchResult.results
            .map(r => `## ${r.title}\n${r.content?.slice(0, 600) || ""}`)
            .join("\n\n");

        console.log(`${TAG} OUTPUT: found ${searchResult.results.length} sources`);
        return JSON.stringify({
            found: true,
            source: "web_search",
            productName,
            answer: searchResult.answer || null,
            sourcesCount: searchResult.results.length,
            content: combinedContent,
            urls: searchResult.results.map(r => r.url),
        });
    },
    {
        name: "get_appliance_details",
        description: "Get detailed information about a specific home appliance — specifications, features, price, and reviews. Can either extract content from a specific product URL or search the web for detailed info. Use this after search_appliances to get deep details about a specific product.",
        schema: z.object({
            productName: z.string().describe("The product name and model (e.g. 'LG F4WV708S1E מכונת כביסה')"),
            productUrl: z.string().optional().describe("Optional direct URL to the product page for detailed extraction"),
        }),
    }
);
