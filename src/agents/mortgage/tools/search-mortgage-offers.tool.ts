/**
 * ============================================================================
 * SEARCH MORTGAGE OFFERS TOOL — Cross-Bank Keyword Search
 * ============================================================================
 *
 * A LangChain tool that searches through all mortgage offer PDFs for content
 * matching a given query. Optionally filters by bank name. Uses keyword
 * matching with relevance scoring to find the most relevant excerpts.
 *
 * Search strategy:
 * - Splits query into individual keywords
 * - Scores each page by how many keywords match
 * - Returns the top 10 most relevant pages with excerpts
 *
 * Useful for finding specific terms (e.g., "ריבית פריים", "עמלת פירעון"),
 * rates, conditions, or clauses across all bank offers simultaneously.
 * ============================================================================
 */
import { tool } from "langchain";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import pdfParse from "pdf-parse";
import { LogColors, color256 } from '../../../utils/log-colors.util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, "..", "sources");

const TAG = `${color256(87)}[search_mortgage_offers]${LogColors.RESET}`;

// In-memory cache: absolute path -> { pages: string[] }
const pdfCache: Map<string, { pages: string[]; fullText: string }> = new Map();

async function parsePdf(filePath: string): Promise<{ pages: string[]; fullText: string }> {
    if (pdfCache.has(filePath)) {
        return pdfCache.get(filePath)!;
    }

    const dataBuffer = fs.readFileSync(filePath);
    const pages: string[] = [];

    const data = await pdfParse(dataBuffer, {
        pagerender: async (pageData: any) => {
            const textContent = await pageData.getTextContent();
            const text = textContent.items.map((item: any) => item.str).join(" ");
            pages.push(text);
            return text;
        },
    });

    const filteredPages = pages.filter((t) => t.trim().length > 0);
    const result = { pages: filteredPages, fullText: data.text };
    pdfCache.set(filePath, result);
    return result;
}

function collectPdfFiles(dir: string, bankName: string): { bank: string; absPath: string; filename: string }[] {
    const results: { bank: string; absPath: string; filename: string }[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectPdfFiles(fullPath, bankName));
        } else if (entry.name.toLowerCase().endsWith(".pdf")) {
            results.push({ bank: bankName, absPath: fullPath, filename: entry.name });
        }
    }
    return results;
}

async function searchAllOffers(query: string, bankFilter?: string): Promise<string> {
    const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1);

    const bankDirs = fs.readdirSync(SOURCES_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .filter(d => !bankFilter || d.name === bankFilter);

    const allFiles: { bank: string; absPath: string; filename: string }[] = [];
    for (const bankDir of bankDirs) {
        allFiles.push(...collectPdfFiles(path.join(SOURCES_DIR, bankDir.name), bankDir.name));
    }

    const results: { bank: string; filename: string; page: number; excerpt: string; score: number }[] = [];

    for (const file of allFiles) {
        const { pages } = await parsePdf(file.absPath);

        for (let i = 0; i < pages.length; i++) {
            const pageText = pages[i].toLowerCase();
            const matchCount = keywords.filter((kw) => pageText.includes(kw)).length;

            if (matchCount > 0) {
                const lines = pages[i].split("\n").filter((l) => l.trim().length > 0);
                const scoredLines = lines.map((line) => {
                    const lineLower = line.toLowerCase();
                    const lineScore = keywords.filter((kw) => lineLower.includes(kw)).length;
                    return { line, lineScore };
                });

                scoredLines.sort((a, b) => b.lineScore - a.lineScore);
                const topLines = scoredLines
                    .filter((l) => l.lineScore > 0)
                    .slice(0, 15)
                    .map((l) => l.line.trim());

                if (topLines.length > 0) {
                    results.push({
                        bank: file.bank,
                        filename: file.filename,
                        page: i + 1,
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
            message: "לא נמצא תוכן תואם בהצעות המשכנתא עבור חיפוש זה.",
        });
    }

    return JSON.stringify({
        found: true,
        count: topResults.length,
        results: topResults.map((r) => ({
            bank: r.bank,
            filename: r.filename,
            page: r.page,
            excerpt: r.excerpt,
        })),
    });
}

export const searchMortgageOffers = tool(
    async ({ query, bank }) => {
        console.log(`${TAG} INPUT: query="${query}", bank="${bank || "(all)"}"`);
        const result = await searchAllOffers(query, bank || undefined);
        const parsed = JSON.parse(result);
        console.log(`${TAG} OUTPUT: found=${parsed.found}, count=${parsed.count ?? 0}`);
        return result;
    },
    {
        name: "search_mortgage_offers",
        description:
            "Search through all mortgage offer PDFs for content matching the given query. Optionally filter by bank name. Returns relevant excerpts with bank, filename, and page number. Use this to find specific terms, rates, conditions, or clauses across all offers.",
        schema: z.object({
            query: z
                .string()
                .describe("The search query — keywords or phrases to look for in the mortgage offers. Can be in Hebrew."),
            bank: z
                .string()
                .optional()
                .describe("Optional bank name to filter search to a specific bank's offers only"),
        }),
    }
);
