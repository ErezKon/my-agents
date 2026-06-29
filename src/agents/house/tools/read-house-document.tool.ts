/**
 * ============================================================================
 * READ HOUSE DOCUMENT TOOL — Page-by-Page PDF Text Reader
 * ============================================================================
 *
 * A LangChain tool that reads the text content of a specific PDF document
 * from the house sources, returning text for a given range of pages.
 *
 * This tool is used after the agent has identified which document and pages
 * are relevant (typically after a search). It uses the `parsePdf` utility
 * which handles both text-based PDFs (contracts) and scanned PDFs (diagrams)
 * with OCR fallback.
 *
 * INPUT:
 * - `filename` — Relative path within the sources directory, e.g.,
 *   "contracts/הסכם מכר.pdf" or "construction diagrams/תוכנית אדריכלית.pdf"
 * - `startPage` — 1-based start page number (default: 1)
 * - `endPage` — 1-based end page number (default: startPage + 4, max 5 pages)
 *
 * OUTPUT:
 * JSON with the extracted text per page, including page numbers for citation.
 *
 * LIMITS: Maximum 5 pages per call to avoid overwhelming the LLM context
 * window. The agent should make multiple calls for longer documents.
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { parsePdf, getPdfPageCount } from './parse-pdf.util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, "..", "sources");

/**
 * LangChain tool: read_house_document
 *
 * Reads and returns the text content of specific pages from a house PDF.
 */
export const readHouseDocument = tool(
    async ({ filename, startPage, endPage }) => {
        console.log(`${color256(39)}[read_house_document]${LogColors.RESET} INPUT: file="${filename}", pages=${startPage}-${endPage ?? "auto"}`);

        const filePath = path.join(SOURCES_DIR, filename);

        if (!fs.existsSync(filePath)) {
            console.log(`${color256(39)}[read_house_document]${LogColors.RESET} ERROR: file not found`);
            return JSON.stringify({
                success: false,
                error: `File not found: ${filename}. Use list_house_documents to see available files.`,
            });
        }

        const totalPages = await getPdfPageCount(filePath);
        const start = Math.max(1, startPage);
        const end = Math.min(endPage ?? start + 4, totalPages);
        const maxPages = 5;

        if (end - start + 1 > maxPages) {
            return JSON.stringify({
                success: false,
                error: `Too many pages requested. Maximum ${maxPages} pages per call. Request pages ${start}-${start + maxPages - 1} first.`,
            });
        }

        const pages = await parsePdf(filePath, start, end);

        console.log(`${color256(39)}[read_house_document]${LogColors.RESET} OUTPUT: ${pages.length} pages read from "${filename}"`);
        return JSON.stringify({
            success: true,
            filename,
            totalPages,
            requestedRange: { start, end },
            pages: pages.map(p => ({
                page: p.page,
                text: p.text || "(No text extracted from this page — it may be a scanned image. Use render_diagram_page for visual analysis.)",
            })),
        });
    },
    {
        name: "read_house_document",
        description:
            "Read the text content of a house document (contract or diagram PDF) page by page. Returns extracted text for the specified page range. Maximum 5 pages per call. Use list_house_documents first to see available files.",
        schema: z.object({
            filename: z.string().describe("Relative path to the PDF file, e.g., 'contracts/הסכם מכר.pdf' or 'construction diagrams/תוכנית אדריכלית.pdf'"),
            startPage: z.number().default(1).describe("Starting page number (1-based, default 1)"),
            endPage: z.number().optional().describe("Ending page number (1-based, default startPage+4). Max 5 pages per call."),
        }),
    }
);
