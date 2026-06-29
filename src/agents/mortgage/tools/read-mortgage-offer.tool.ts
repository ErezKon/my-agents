/**
 * ============================================================================
 * READ MORTGAGE OFFER TOOL — Full-Text PDF Reader for Mortgage Documents
 * ============================================================================
 *
 * A LangChain tool that reads the full text content of a specific mortgage
 * offer PDF. Uses pdf-parse to extract text page by page, with built-in
 * pagination and truncation to stay within LLM token limits.
 *
 * Features:
 * - In-memory caching (parsed PDFs are cached for subsequent requests)
 * - Per-page truncation (max 8,000 chars per page)
 * - Total truncation (max 60,000 chars total)
 * - Automatic bank name detection from directory structure
 *
 * The agent calls this after list_mortgage_offers to read a specific
 * offer in full detail.
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

const TAG = `${color256(51)}[read_mortgage_offer]${LogColors.RESET}`;

const MAX_PAGE_CHARS = 8000;
const MAX_TOTAL_CHARS = 60000;

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

export const readMortgageOffer = tool(
    async ({ relativePath }) => {
        console.log(`${TAG} INPUT: relativePath="${relativePath}"`);

        const absPath = path.join(SOURCES_DIR, relativePath);
        if (!fs.existsSync(absPath)) {
            const errMsg = `File not found: ${relativePath}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({ error: errMsg });
        }

        const { pages } = await parsePdf(absPath);

        // Determine bank from first path segment
        const bank = relativePath.split(path.sep)[0] || "unknown";
        const filename = path.basename(relativePath);

        // Build page array with truncation
        let totalChars = 0;
        const outputPages: { page: number; text: string; truncated: boolean }[] = [];
        let stoppedEarly = false;

        for (let i = 0; i < pages.length; i++) {
            let text = pages[i];
            let truncated = false;

            if (text.length > MAX_PAGE_CHARS) {
                text = text.slice(0, MAX_PAGE_CHARS);
                truncated = true;
            }

            if (totalChars + text.length > MAX_TOTAL_CHARS) {
                stoppedEarly = true;
                break;
            }

            totalChars += text.length;
            outputPages.push({ page: i + 1, text, truncated });
        }

        const result = {
            bank,
            filename,
            relativePath,
            pageCount: pages.length,
            pagesReturned: outputPages.length,
            stoppedEarly,
            nextOffset: stoppedEarly ? outputPages.length + 1 : undefined,
            pages: outputPages,
        };

        console.log(`${TAG} OUTPUT: bank="${bank}", file="${filename}", pages=${pages.length}, returned=${outputPages.length}, stoppedEarly=${stoppedEarly}`);
        return JSON.stringify(result);
    },
    {
        name: "read_mortgage_offer",
        description:
            "Read the full text content of a specific mortgage offer PDF. Provide the relative path from the sources directory (e.g. 'Discount Bank/הצעת משכנתא בנק דיסקונט.pdf'). Returns page-by-page text content with bank name and metadata. Use this after list_mortgage_offers to read a specific offer in detail.",
        schema: z.object({
            relativePath: z
                .string()
                .describe("Relative path to the PDF file within the mortgage sources directory"),
        }),
    }
);
