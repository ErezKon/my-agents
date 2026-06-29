/**
 * ============================================================================
 * PARSE PDF UTILITY — PDF Text Extraction with OCR Fallback
 * ============================================================================
 *
 * Shared utility used by multiple house agent tools to extract text content
 * from PDF files. Supports both text-based PDFs (contracts) and scanned/
 * image-based PDFs (construction diagrams) through OCR fallback.
 *
 * ARCHITECTURE:
 * - **pdf-parse**: Primary extraction method. Uses pdfjs to extract embedded
 *   text from each page. Works well for digitally-created PDFs (contracts,
 *   specifications).
 * - **Tesseract OCR fallback**: When a page has very little embedded text
 *   (common in scanned diagrams), the utility can fall back to OCR using
 *   the `tesseract` CLI command. This is detected at startup by checking
 *   if `tesseract --version` succeeds.
 * - **In-memory cache**: Parsed PDF results are cached by filename in a Map
 *   to avoid re-parsing the same file multiple times within a session.
 *
 * EXPORTED FUNCTIONS:
 * - `getPdfPageCount(filePath)` — Returns the number of pages in a PDF.
 * - `parsePdf(filePath, startPage?, endPage?)` — Extracts text from a
 *   range of pages, returning an array of { page, text } objects.
 *
 * DEPENDENCIES:
 * - `pdf-parse`: npm package for PDF text extraction.
 * - `tesseract` (optional): System binary for OCR. Install via:
 *   `sudo apt install tesseract-ocr tesseract-ocr-heb` for Hebrew support.
 * - `child_process`: Used to spawn tesseract for OCR pages.
 * - `tmp`: Used to create temporary image files for OCR processing.
 *
 * This utility is consumed by:
 * - `read-house-document.tool.ts`
 * - `search-house-contracts.tool.ts`
 * - `search-house-diagrams.tool.ts`
 * ============================================================================
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import pdfParse from "pdf-parse";
import { LogColors, color256 } from '../../../utils/log-colors.util';

// In-memory cache: filepath -> { pages: { page: number; text: string }[] }
const pdfCache: Map<string, { pages: { page: number; text: string }[]; totalPages: number }> = new Map();

// Check if tesseract is available at startup
let tesseractAvailable = false;
try {
    execSync("tesseract --version", { stdio: "ignore" });
    tesseractAvailable = true;
    console.log(`${color256(214)}[parse-pdf]${LogColors.RESET} Tesseract OCR is available — will use for scanned pages`);
} catch {
    console.log(`${color256(214)}[parse-pdf]${LogColors.RESET} Tesseract OCR not found — scanned pages will have limited text`);
}

/**
 * Attempts OCR on a single PDF page using tesseract.
 * Creates a temporary image, runs tesseract, and returns the extracted text.
 *
 * @param filePath - Path to the PDF file.
 * @param pageNum - 1-based page number to OCR.
 * @returns Extracted text from OCR, or empty string on failure.
 */
async function ocrPage(filePath: string, pageNum: number): Promise<string> {
    if (!tesseractAvailable) return "";

    const tmpDir = os.tmpdir();
    const tmpBase = path.join(tmpDir, `house-ocr-${Date.now()}-p${pageNum}`);
    const tmpImage = `${tmpBase}.png`;
    const tmpText = `${tmpBase}`;

    try {
        // Use pdftoppm (from poppler-utils) to render page to image
        execSync(
            `pdftoppm -f ${pageNum} -l ${pageNum} -png -r 200 "${filePath}" "${tmpBase}"`,
            { stdio: "ignore", timeout: 15000 }
        );

        // pdftoppm creates files like tmpBase-01.png
        const renderedFile = fs.readdirSync(tmpDir)
            .filter(f => f.startsWith(path.basename(tmpBase)) && f.endsWith(".png"))
            .map(f => path.join(tmpDir, f))[0];

        if (!renderedFile) return "";

        // Run tesseract with Hebrew language support
        execSync(
            `tesseract "${renderedFile}" "${tmpText}" -l heb+eng --psm 6`,
            { stdio: "ignore", timeout: 30000 }
        );

        const ocrResult = fs.readFileSync(`${tmpText}.txt`, "utf-8");

        // Cleanup temp files
        try { fs.unlinkSync(renderedFile); } catch { /* ignore */ }
        try { fs.unlinkSync(`${tmpText}.txt`); } catch { /* ignore */ }

        return ocrResult.trim();
    } catch {
        // Cleanup on error
        try { fs.unlinkSync(tmpImage); } catch { /* ignore */ }
        try { fs.unlinkSync(`${tmpText}.txt`); } catch { /* ignore */ }
        return "";
    }
}

/**
 * Returns the total number of pages in a PDF file.
 *
 * @param filePath - Absolute path to the PDF file.
 * @returns Total page count.
 */
export async function getPdfPageCount(filePath: string): Promise<number> {
    const cached = pdfCache.get(filePath);
    if (cached) return cached.totalPages;

    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.numpages;
}

/**
 * Parses a PDF file and extracts text from a range of pages.
 * Uses embedded text extraction first; falls back to OCR for pages
 * with very little text (< 50 characters), which is common for
 * scanned construction diagrams.
 *
 * Results are cached in memory by file path.
 *
 * @param filePath - Absolute path to the PDF file.
 * @param startPage - 1-based start page (default: 1).
 * @param endPage - 1-based end page (default: last page).
 * @returns Array of { page, text } objects for the requested range.
 */
export async function parsePdf(
    filePath: string,
    startPage: number = 1,
    endPage?: number
): Promise<{ page: number; text: string }[]> {
    const cacheKey = filePath;

    if (!pdfCache.has(cacheKey)) {
        const dataBuffer = fs.readFileSync(filePath);
        const pages: { page: number; text: string }[] = [];
        let pageIndex = 0;

        const data = await pdfParse(dataBuffer, {
            pagerender: async (pageData: any) => {
                pageIndex++;
                const textContent = await pageData.getTextContent();
                const text = textContent.items.map((item: any) => item.str).join(" ");
                pages.push({ page: pageIndex, text: text.trim() });
                return text;
            },
        });

        // OCR fallback for pages with very little text (likely scanned)
        for (let i = 0; i < pages.length; i++) {
            if (pages[i].text.length < 50) {
                console.log(`${color256(214)}[parse-pdf]${LogColors.RESET} Page ${pages[i].page} has little text — attempting OCR...`);
                const ocrText = await ocrPage(filePath, pages[i].page);
                if (ocrText.length > pages[i].text.length) {
                    pages[i].text = ocrText;
                }
            }
        }

        pdfCache.set(cacheKey, { pages, totalPages: data.numpages });
    }

    const cached = pdfCache.get(cacheKey)!;
    const end = endPage ?? cached.totalPages;
    return cached.pages.filter(p => p.page >= startPage && p.page <= end);
}
