/**
 * ============================================================================
 * SEARCH HOUSE DIAGRAMS TOOL — Text Search in Construction Blueprints
 * ============================================================================
 *
 * A LangChain tool that searches through all PDF files in the
 * "construction diagrams/" directory for pages matching a given query.
 *
 * Construction diagrams often contain text annotations such as:
 * - Room names (סלון, מטבח, חדר שינה, מרפסת)
 * - Dimensions (3.50, 4.20 מ')
 * - Symbols and labels (ח"ר, מ"ר, נ.ק.)
 * - Title block information (scale, drawing number, revision)
 * - Notes and specifications
 *
 * SEARCH ALGORITHM:
 * Same keyword-matching approach as search_house_contracts, but operates
 * on the construction diagrams directory. Because diagram PDFs often have
 * less embedded text (especially scanned ones), this tool leverages the
 * OCR fallback in `parsePdf` to extract text from image-based pages.
 *
 * IMPORTANT LIMITATION:
 * Text search in diagrams only finds textual annotations and labels. It
 * cannot identify visual elements like walls, doors, windows, or pipes.
 * For visual analysis of diagram content, use `render_diagram_page` to
 * get a JPEG image that the LLM can analyze visually.
 *
 * Results include source filename, page number, excerpt, and relevance
 * score for the agent to decide which pages need visual rendering.
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
const DIAGRAMS_DIR = path.join(__dirname, "..", "sources", "construction diagrams");

/**
 * Searches all diagram PDFs for pages matching the given query keywords.
 */
async function searchDiagrams(query: string): Promise<string> {
    const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 1);

    if (!fs.existsSync(DIAGRAMS_DIR)) {
        return JSON.stringify({
            found: false,
            message: "Construction diagrams directory not found. No diagram documents available.",
        });
    }

    const pdfFiles = fs
        .readdirSync(DIAGRAMS_DIR)
        .filter(f => f.toLowerCase().endsWith(".pdf"));

    const results: { source: string; page: number; excerpt: string; score: number }[] = [];

    for (const file of pdfFiles) {
        const filePath = path.join(DIAGRAMS_DIR, file);
        const pages = await parsePdf(filePath);

        for (const pageData of pages) {
            const pageText = pageData.text.toLowerCase();
            const matchCount = keywords.filter(kw => pageText.includes(kw)).length;

            if (matchCount > 0) {
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
                        source: `construction diagrams/${file}`,
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
            message: `No matching text found in construction diagrams for query: "${query}". Note: diagrams may contain visual-only content — try render_diagram_page for visual analysis.`,
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
 * LangChain tool: search_house_diagrams
 *
 * Keyword search across all construction diagram PDFs for text annotations,
 * room names, dimensions, and labels matching the query.
 */
export const searchHouseDiagrams = tool(
    async ({ query }) => {
        console.log(`${color256(141)}[search_house_diagrams]${LogColors.RESET} INPUT: query="${query}"`);
        const result = await searchDiagrams(query);
        const parsed = JSON.parse(result);
        console.log(`${color256(141)}[search_house_diagrams]${LogColors.RESET} OUTPUT: found=${parsed.found}, count=${parsed.count ?? 0}`);
        return result;
    },
    {
        name: "search_house_diagrams",
        description:
            "Search through all construction diagram PDFs (תוכניות בנייה — architectural, electrical, structural) for text matching the query. Finds room names, dimensions, labels, and annotations. For visual analysis of diagram content (walls, doors, layout), use render_diagram_page instead.",
        schema: z.object({
            query: z.string().describe("Search query — keywords to look for in diagram annotations. Examples: 'סלון', 'מטבח', 'חדר שינה', 'מרפסת', 'חשמל', '1:50'"),
        }),
    }
);
