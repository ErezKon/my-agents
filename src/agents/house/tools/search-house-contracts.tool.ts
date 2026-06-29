/**
 * ============================================================================
 * SEARCH HOUSE CONTRACTS TOOL — Keyword Search in Purchase Agreements
 * ============================================================================
 *
 * A LangChain tool that searches through all PDF files in the contracts/
 * directory for pages matching a given keyword query. Designed for Hebrew
 * purchase agreements, appendices, and specifications.
 *
 * SEARCH ALGORITHM:
 * 1. Splits the query into individual keywords (whitespace-delimited).
 * 2. Iterates through all PDF pages in the contracts directory.
 * 3. Counts how many keywords appear on each page (case-insensitive).
 * 4. For matching pages, extracts the most relevant lines as excerpts.
 * 5. Sorts results by relevance score (keyword match count) descending.
 * 6. Returns the top 10 most relevant results.
 *
 * Each result includes the source filename, page number, excerpt, and
 * relevance score — giving the agent enough context to decide which pages
 * to read in full using `read_house_document`.
 *
 * This tool searches ONLY contracts (legal documents), not diagrams.
 * For diagram text search, use `search_house_diagrams`.
 *
 * HEBREW SUPPORT:
 * The search is Unicode-aware and works with Hebrew characters.
 * Keywords are matched case-insensitively (relevant for mixed Hebrew/English).
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { parsePdf } from './parse-pdf.util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = path.join(__dirname, "..", "sources", "contracts");

/**
 * Searches all contract PDFs for pages matching the given query keywords.
 */
async function searchContracts(query: string): Promise<string> {
    const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 1);

    if (!fs.existsSync(CONTRACTS_DIR)) {
        return JSON.stringify({
            found: false,
            message: "Contracts directory not found. No contract documents available.",
        });
    }

    const pdfFiles = fs
        .readdirSync(CONTRACTS_DIR)
        .filter(f => f.toLowerCase().endsWith(".pdf"));

    const results: { source: string; page: number; excerpt: string; score: number }[] = [];

    for (const file of pdfFiles) {
        const filePath = path.join(CONTRACTS_DIR, file);
        const pages = await parsePdf(filePath);

        for (const pageData of pages) {
            const pageText = pageData.text.toLowerCase();
            const matchCount = keywords.filter(kw => pageText.includes(kw)).length;

            if (matchCount > 0) {
                // Extract the most relevant lines as excerpt
                const lines = pageData.text.split(/\n/).filter(l => l.trim().length > 0);
                const scoredLines = lines.map(line => {
                    const lineLower = line.toLowerCase();
                    const lineScore = keywords.filter(kw => lineLower.includes(kw)).length;
                    return { line, lineScore };
                });

                scoredLines.sort((a, b) => b.lineScore - a.lineScore);
                const topLines = scoredLines
                    .filter(l => l.lineScore > 0)
                    .slice(0, 10)
                    .map(l => l.line.trim());

                if (topLines.length > 0) {
                    results.push({
                        source: `contracts/${file}`,
                        page: pageData.page,
                        excerpt: topLines.join("\n"),
                        score: matchCount,
                    });
                }
            }
        }
    }

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, 10);

    if (topResults.length === 0) {
        return JSON.stringify({
            found: false,
            message: `No matching content found in contract documents for query: "${query}"`,
        });
    }

    return JSON.stringify({
        found: true,
        count: topResults.length,
        results: topResults.map(r => ({
            source: r.source,
            page: r.page,
            excerpt: r.excerpt,
        })),
    });
}

/**
 * LangChain tool: search_house_contracts
 *
 * Keyword search across all contract PDFs in the sources/contracts/ directory.
 */
export const searchHouseContracts = tool(
    async ({ query }) => {
        console.log(`${color256(220)}[search_house_contracts]${LogColors.RESET} INPUT: query="${query}"`);
        const result = await searchContracts(query);
        const parsed = JSON.parse(result);
        console.log(`${color256(220)}[search_house_contracts]${LogColors.RESET} OUTPUT: found=${parsed.found}, count=${parsed.count ?? 0}`);
        return result;
    },
    {
        name: "search_house_contracts",
        description:
            "Search through all house purchase contract PDFs (הסכם מכר, נספחים, מפרט) for content matching the query. Returns relevant excerpts with source filename and page number. Searches ONLY contracts — for construction diagrams use search_house_diagrams.",
        schema: z.object({
            query: z.string().describe("Search query — keywords or phrases to look for in the contracts. Can be in Hebrew or English."),
        }),
    }
);
