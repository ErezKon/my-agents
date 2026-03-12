import { tool } from "langchain";
import { z } from "zod";
import { LogColors } from '../../../utils/log-colors.util';
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import pdfParse from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, "..", "sources");

// In-memory cache: filename -> { pages: string[] }
const pdfCache: Map<string, { pages: string[]; fullText: string }> = new Map();

async function parsePdf(filePath: string): Promise<{ pages: string[]; fullText: string }> {
    const fileName = path.basename(filePath);
    if (pdfCache.has(fileName)) {
        return pdfCache.get(fileName)!;
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
    const fullText = data.text;
    const result = { pages: filteredPages, fullText };
    pdfCache.set(fileName, result);
    return result;
}

async function searchAllManuals(query: string): Promise<string> {
    const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1);

    const pdfFiles = fs
        .readdirSync(SOURCES_DIR)
        .filter((f) => f.toLowerCase().endsWith(".pdf"));

    const results: { source: string; page: number; excerpt: string; score: number }[] = [];

    for (const file of pdfFiles) {
        const filePath = path.join(SOURCES_DIR, file);
        const { pages } = await parsePdf(filePath);

        for (let i = 0; i < pages.length; i++) {
            const pageText = pages[i].toLowerCase();
            const matchCount = keywords.filter((kw) => pageText.includes(kw)).length;

            if (matchCount > 0) {
                // Find the best matching segment within the page
                const lines = pages[i].split("\n").filter((l) => l.trim().length > 0);
                const scoredLines = lines.map((line) => {
                    const lineLower = line.toLowerCase();
                    const lineScore = keywords.filter((kw) => lineLower.includes(kw)).length;
                    return { line, lineScore };
                });

                // Get the top matching lines as excerpt (up to 15 lines of context)
                scoredLines.sort((a, b) => b.lineScore - a.lineScore);
                const topLines = scoredLines
                    .filter((l) => l.lineScore > 0)
                    .slice(0, 15)
                    .map((l) => l.line.trim());

                if (topLines.length > 0) {
                    results.push({
                        source: file,
                        page: i + 1,
                        excerpt: topLines.join("\n"),
                        score: matchCount,
                    });
                }
            }
        }
    }

    // Sort by relevance score descending, return top results
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, 10);

    if (topResults.length === 0) {
        return JSON.stringify({
            found: false,
            message: "No matching content found in the MG-4 manuals for this query.",
        });
    }

    return JSON.stringify({
        found: true,
        count: topResults.length,
        results: topResults.map((r) => ({
            source: r.source,
            page: r.page,
            excerpt: r.excerpt,
        })),
    });
}

export const searchManuals = tool(
    async ({ query }) => {
        console.log(`${LogColors.CYAN}[search_mg4_manuals]${LogColors.RESET} INPUT: query="${query}"`);
        const result = await searchAllManuals(query);
        const parsed = JSON.parse(result);
        console.log(
            `${LogColors.CYAN}[search_mg4_manuals]${LogColors.RESET} OUTPUT: found=${parsed.found}, count=${parsed.count ?? 0}`
        );
        return result;
    },
    {
        name: "search_mg4_manuals",
        description:
            "Search through all MG-4 car manuals (PDF documents) for content matching the given query. Returns relevant excerpts with source file name and page number. Use this tool to find information about the MG-4 car — features, maintenance, controls, specifications, safety, etc.",
        schema: z.object({
            query: z
                .string()
                .describe(
                    "The search query — keywords or phrases to look for in the car manuals. Can be in Hebrew or English."
                ),
        }),
    }
);
