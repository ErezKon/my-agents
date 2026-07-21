import * as fs from 'fs';
import * as path from 'path';
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { TavilyResult } from './tavily-client.util';

const TAG = `${color256(214)}[research-accumulator]${LogColors.RESET}`;
const RESEARCH_FILENAME = 'research-data.json';

/** Max characters to keep from each result's content in the truncated version returned to the LLM. */
const TRUNCATED_CONTENT_LENGTH = 200;
/** Max number of results to keep in the truncated version returned to the LLM. */
const TRUNCATED_MAX_RESULTS = 6;

export interface ResearchEntry {
    toolName: string;
    timestamp: string;
    params: Record<string, any>;
    answer?: string;
    results: TavilyResult[];
}

/**
 * Append full research data to the research file on disk, and return a
 * truncated version suitable for the LLM conversation context.
 *
 * Full results (with complete content) go to `{outputDir}/research-data.json`.
 * The LLM only sees a compact summary: the answer + trimmed snippets.
 */
export function accumulateResearch(
    outputDir: string,
    toolName: string,
    params: Record<string, any>,
    answer: string | undefined,
    results: TavilyResult[],
): { truncatedAnswer: string | undefined; truncatedResults: TavilyResult[] } {
    // --- 1. Save full data to file (append) ---
    const filePath = path.join(outputDir, RESEARCH_FILENAME);
    let existing: ResearchEntry[] = [];
    try {
        if (fs.existsSync(filePath)) {
            existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch { /* start fresh */ }

    const entry: ResearchEntry = {
        toolName,
        timestamp: new Date().toISOString(),
        params,
        answer,
        results,
    };
    existing.push(entry);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');

    const totalEntries = existing.length;
    const totalResults = existing.reduce((sum, e) => sum + e.results.length, 0);
    console.log(`${TAG} Saved to ${RESEARCH_FILENAME} (${totalEntries} entries, ${totalResults} total results)`);

    // --- 2. Return truncated version for the LLM context ---
    const truncatedResults = results.slice(0, TRUNCATED_MAX_RESULTS).map(r => ({
        title: r.title,
        url: r.url,
        content: r.content.length > TRUNCATED_CONTENT_LENGTH
            ? r.content.slice(0, TRUNCATED_CONTENT_LENGTH) + '…'
            : r.content,
        score: r.score,
    }));

    return { truncatedAnswer: answer, truncatedResults };
}
