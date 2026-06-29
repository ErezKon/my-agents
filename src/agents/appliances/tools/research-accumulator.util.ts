/**
 * ============================================================================
 * RESEARCH ACCUMULATOR UTILITY — Session-Scoped Search Result Cache
 * ============================================================================
 *
 * This utility provides a simple in-memory store for accumulating research
 * results across multiple tool calls within a single agent session.
 *
 * WHY THIS EXISTS:
 * ────────────────
 * The Appliances agent often makes several sequential web searches during a
 * single conversation turn (e.g., search → get details → find alternatives).
 * Each search returns valuable data, but the LLM's context window has limits.
 * The research accumulator lets tools store their results in a session-keyed
 * map so that later tools (or a future conversation turn) can access earlier
 * findings without re-searching.
 *
 * For example:
 *   1. `search_appliances` finds 5 washing machines → stored in accumulator
 *   2. `compare_appliances` can reference those results when building its
 *      comparison table, avoiding duplicate API calls
 *
 * DATA MODEL:
 * - **Key**: Session ID (typically the LangGraph `thread_id`)
 * - **Value**: Array of `ResearchEntry` objects, each with:
 *   - `query` — The original search query
 *   - `timestamp` — When the search was performed (epoch ms)
 *   - `results` — The raw result data (any shape, tool-dependent)
 *
 * LIFECYCLE:
 * - `addResearch(sessionId, query, results)` — Append a new entry
 * - `getResearch(sessionId)` — Retrieve all entries for a session
 * - `clearResearch(sessionId)` — Clean up after session ends
 *
 * NOTE: This is an in-memory store — data is lost on process restart.
 * For production use, consider replacing with Redis or a persistent cache.
 * ============================================================================
 */

interface ResearchEntry {
    query: string;
    timestamp: number;
    results: any[];
}

const researchStore: Map<string, ResearchEntry[]> = new Map();

/**
 * Add a research entry to the session's accumulator.
 *
 * @param sessionId - Unique session/thread identifier.
 * @param query - The search query that produced these results.
 * @param results - The raw search results to store.
 */
export function addResearch(sessionId: string, query: string, results: any[]): void {
    if (!researchStore.has(sessionId)) {
        researchStore.set(sessionId, []);
    }
    researchStore.get(sessionId)!.push({
        query,
        timestamp: Date.now(),
        results,
    });
}

/**
 * Retrieve all research entries for a given session.
 *
 * @param sessionId - Unique session/thread identifier.
 * @returns Array of `ResearchEntry` objects, or empty array if none.
 */
export function getResearch(sessionId: string): ResearchEntry[] {
    return researchStore.get(sessionId) || [];
}

/**
 * Clear all research data for a given session (cleanup).
 *
 * @param sessionId - Unique session/thread identifier.
 */
export function clearResearch(sessionId: string): void {
    researchStore.delete(sessionId);
}
