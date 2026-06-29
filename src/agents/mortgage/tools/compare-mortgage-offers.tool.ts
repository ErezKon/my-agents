/**
 * ============================================================================
 * COMPARE MORTGAGE OFFERS TOOL — Cross-Bank Side-by-Side Comparison
 * ============================================================================
 *
 * A LangChain tool that compares mortgage offers across all banks by specific
 * aspects (e.g., interest rates, fees, insurance, penalties). For each aspect,
 * it extracts the most relevant excerpts from each bank's offer PDFs.
 *
 * The agent uses this tool when the user asks to compare offers or wants a
 * side-by-side analysis. The tool returns raw excerpt data; the agent then
 * synthesizes a readable comparison from the returned content.
 *
 * Default comparison aspects: ריבית, עמלות, תקופה, ביטוח, פריים, מדד,
 * החזר חודשי, קנס פירעון.
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

const TAG = `${color256(39)}[compare_mortgage_offers]${LogColors.RESET}`;

const DEFAULT_ASPECTS = ["ריבית", "עמלות", "תקופה", "ביטוח", "פריים", "מדד", "החזר חודשי", "קנס פירעון"];

// In-memory cache: absolute path -> { pages: string[] }
const pdfCache: Map<string, string[]> = new Map();

async function parsePdfPages(filePath: string): Promise<string[]> {
    if (pdfCache.has(filePath)) {
        return pdfCache.get(filePath)!;
    }

    const dataBuffer = fs.readFileSync(filePath);
    const pages: string[] = [];

    await pdfParse(dataBuffer, {
        pagerender: async (pageData: any) => {
            const textContent = await pageData.getTextContent();
            const text = textContent.items.map((item: any) => item.str).join(" ");
            pages.push(text);
            return text;
        },
    });

    const filteredPages = pages.filter((t) => t.trim().length > 0);
    pdfCache.set(filePath, filteredPages);
    return filteredPages;
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

function searchPages(pages: string[], keywords: string[]): { page: number; excerpt: string; score: number }[] {
    const results: { page: number; excerpt: string; score: number }[] = [];

    for (let i = 0; i < pages.length; i++) {
        const pageText = pages[i].toLowerCase();
        const matchCount = keywords.filter((kw) => pageText.includes(kw)).length;

        if (matchCount > 0) {
            const lines = pages[i].split("\n").filter((l) => l.trim().length > 0);
            const scoredLines = lines.map((line) => ({
                line,
                lineScore: keywords.filter((kw) => line.toLowerCase().includes(kw)).length,
            }));

            scoredLines.sort((a, b) => b.lineScore - a.lineScore);
            const topLines = scoredLines
                .filter((l) => l.lineScore > 0)
                .slice(0, 5)
                .map((l) => l.line.trim());

            if (topLines.length > 0) {
                results.push({ page: i + 1, excerpt: topLines.join("\n"), score: matchCount });
            }
        }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 2);
}

export const compareMortgageOffers = tool(
    async ({ aspects }) => {
        const aspectList = aspects && aspects.length > 0 ? aspects : DEFAULT_ASPECTS;
        console.log(`${TAG} INPUT: aspects=[${aspectList.join(", ")}]`);

        const bankDirs = fs.readdirSync(SOURCES_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory());

        const allFiles: { bank: string; absPath: string; filename: string }[] = [];
        for (const bankDir of bankDirs) {
            allFiles.push(...collectPdfFiles(path.join(SOURCES_DIR, bankDir.name), bankDir.name));
        }

        // Parse all PDFs
        const bankPages: Map<string, { bank: string; filename: string; pages: string[] }[]> = new Map();
        for (const file of allFiles) {
            const pages = await parsePdfPages(file.absPath);
            if (!bankPages.has(file.bank)) {
                bankPages.set(file.bank, []);
            }
            bankPages.get(file.bank)!.push({ bank: file.bank, filename: file.filename, pages });
        }

        // For each aspect, search each bank's offers
        const comparison = aspectList.map(aspect => {
            const keywords = aspect.toLowerCase().split(/\s+/).filter(w => w.length > 1);
            const perBank: { bank: string; excerpts: { filename: string; page: number; text: string }[] }[] = [];

            for (const [bank, files] of bankPages.entries()) {
                const bankExcerpts: { filename: string; page: number; text: string }[] = [];
                for (const file of files) {
                    const hits = searchPages(file.pages, keywords);
                    for (const hit of hits) {
                        bankExcerpts.push({ filename: file.filename, page: hit.page, text: hit.excerpt });
                    }
                }
                perBank.push({ bank, excerpts: bankExcerpts });
            }

            return { aspect, perBank };
        });

        const result = { aspectCount: comparison.length, bankCount: bankDirs.length, aspects: comparison };

        console.log(`${TAG} OUTPUT: ${comparison.length} aspects compared across ${bankDirs.length} banks`);
        return JSON.stringify(result);
    },
    {
        name: "compare_mortgage_offers",
        description:
            "Compare mortgage offers across all banks by specific aspects. For each aspect (e.g. 'ריבית', 'עמלות', 'תקופה', 'ביטוח'), extracts the most relevant excerpts from each bank's offer. Use this when the user asks to compare offers or wants a side-by-side analysis. The agent should then synthesize the comparison from the returned excerpts.",
        schema: z.object({
            aspects: z
                .array(z.string())
                .optional()
                .describe("Aspects to compare (e.g. ['ריבית','עמלות','תקופה','ביטוח']). If omitted, uses default common mortgage comparison aspects."),
        }),
    }
);
