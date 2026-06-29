/**
 * ============================================================================
 * TAVILY CLIENT UTILITY — Web Search & URL Extraction via Tavily API
 * ============================================================================
 *
 * This utility module wraps the Tavily REST API to provide two core
 * capabilities used by the Appliances agent's tools:
 *
 *   1. **tavilySearch()** — Performs a web search query and returns ranked
 *      results with titles, URLs, content snippets, and relevance scores.
 *      Optionally returns a synthesized "answer" paragraph from Tavily's
 *      AI-powered answer engine. Supports domain filtering (e.g., restrict
 *      to Israeli retail sites like zap.co.il, ksp.co.il).
 *
 *   2. **tavilyExtract()** — Given a list of URLs, fetches and extracts
 *      the raw text content from each page. Useful for deep-diving into a
 *      specific product page after discovering it via search.
 *
 * WHY TAVILY?
 * ───────────
 * The Appliances agent needs real-time product data (prices, specs, reviews)
 * from Israeli e-commerce sites. Tavily provides a clean search API that
 * returns structured results without the complexity of scraping. The
 * "advanced" search depth triggers Tavily's deep research mode, which
 * follows links and aggregates information — ideal for product comparison
 * queries.
 *
 * CONFIGURATION:
 * - `TAVILY_API_KEY` — Read from `process.env.TAVILY_API_KEY`. Falls back
 *   to a placeholder for development.
 * - `TAVILY_API_URL` — The Tavily REST API base URL.
 *
 * ERROR HANDLING:
 * Both functions catch all errors and return safe empty-result objects
 * instead of throwing. This is intentional — tool functions called by the
 * LLM agent must never crash the agent loop. Instead, the agent receives
 * an empty result and can decide to retry with different parameters or
 * inform the user.
 *
 * LOGGING:
 * Uses color256 ANSI codes for distinctive orange `[tavily-client]` log tags
 * so Tavily API calls are easily spotted in dense agent-loop console output.
 * ============================================================================
 */

import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(208)}[tavily-client]${LogColors.RESET}`;

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "tvly-dev-key-placeholder";
const TAVILY_API_URL = "https://api.tavily.com";

interface TavilySearchResult {
    title: string;
    url: string;
    content: string;
    score: number;
}

interface TavilySearchResponse {
    results: TavilySearchResult[];
    answer?: string;
}

interface TavilyExtractResponse {
    results: {
        url: string;
        raw_content: string;
    }[];
    failed_results: {
        url: string;
        error: string;
    }[];
}

/**
 * Perform a web search via the Tavily Search API.
 *
 * @param query - The search query string (Hebrew or English).
 * @param options - Optional search configuration:
 *   - `searchDepth`: "basic" (fast, shallow) or "advanced" (deep research).
 *   - `maxResults`: Maximum number of results to return (default 5).
 *   - `includeAnswer`: Whether to request Tavily's AI-synthesized answer.
 *   - `includeDomains`: Restrict results to specific domains (e.g., Israeli retail sites).
 * @returns A `TavilySearchResponse` with results array and optional answer.
 *   Returns `{ results: [] }` on any error.
 */
export async function tavilySearch(
    query: string,
    options: {
        searchDepth?: "basic" | "advanced";
        maxResults?: number;
        includeAnswer?: boolean;
        includeDomains?: string[];
    } = {}
): Promise<TavilySearchResponse> {
    const {
        searchDepth = "advanced",
        maxResults = 5,
        includeAnswer = true,
        includeDomains = [],
    } = options;

    console.log(`${TAG} Search: "${query}" (depth=${searchDepth}, max=${maxResults})`);

    try {
        const response = await fetch(`${TAVILY_API_URL}/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query,
                search_depth: searchDepth,
                max_results: maxResults,
                include_answer: includeAnswer,
                include_domains: includeDomains.length > 0 ? includeDomains : undefined,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.log(`${TAG} ERROR: HTTP ${response.status} — ${errText}`);
            return { results: [] };
        }

        const data = await response.json() as TavilySearchResponse;
        console.log(`${TAG} Found ${data.results?.length ?? 0} results`);
        return data;
    } catch (err: any) {
        console.log(`${TAG} ERROR: ${err.message}`);
        return { results: [] };
    }
}

/**
 * Extract raw text content from one or more URLs via the Tavily Extract API.
 *
 * @param urls - Array of URLs to extract content from.
 * @returns A `TavilyExtractResponse` with successful and failed results.
 *   On network/API error, all URLs are reported as failed.
 */
export async function tavilyExtract(urls: string[]): Promise<TavilyExtractResponse> {
    console.log(`${TAG} Extract: ${urls.length} URL(s)`);

    try {
        const response = await fetch(`${TAVILY_API_URL}/extract`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                urls,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.log(`${TAG} ERROR: HTTP ${response.status} — ${errText}`);
            return { results: [], failed_results: urls.map(u => ({ url: u, error: "HTTP error" })) };
        }

        const data = await response.json() as TavilyExtractResponse;
        console.log(`${TAG} Extracted ${data.results?.length ?? 0}, failed ${data.failed_results?.length ?? 0}`);
        return data;
    } catch (err: any) {
        console.log(`${TAG} ERROR: ${err.message}`);
        return { results: [], failed_results: urls.map(u => ({ url: u, error: err.message })) };
    }
}
