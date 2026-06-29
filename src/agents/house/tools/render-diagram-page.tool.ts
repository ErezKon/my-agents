/**
 * ============================================================================
 * RENDER DIAGRAM PAGE TOOL — PDF Page to JPEG Image Converter
 * ============================================================================
 *
 * A LangChain tool that renders a specific page from a construction diagram
 * PDF as a JPEG image encoded in base64. This allows the vision-capable LLM
 * to visually analyze architectural plans, electrical diagrams, and other
 * construction blueprints.
 *
 * WHY VISUAL RENDERING?
 * Construction diagrams are primarily visual — walls, doors, windows, pipes,
 * and electrical symbols are drawn as graphics, not text. Text search alone
 * (via search_house_diagrams) only finds labels and annotations. To actually
 * understand the layout, identify rooms, or locate specific elements, the
 * LLM needs to "see" the diagram as an image.
 *
 * RENDERING PIPELINE:
 * 1. Validates the file exists and page number is within range.
 * 2. Uses `pdftoppm` (from poppler-utils) to render the PDF page to PNG.
 * 3. Converts the PNG to JPEG at the specified quality (default 80%).
 * 4. Encodes the JPEG as base64 and returns it to the LLM.
 *
 * DPI CONTROL:
 * - Default: 150 DPI — good balance of detail and size.
 * - Maximum: 200 DPI — more detail but larger images.
 * - Higher DPI = more pixels = better for measuring distances, but larger
 *   context window usage.
 *
 * DEPENDENCIES:
 * - `poppler-utils`: System package providing `pdftoppm`. Install via:
 *   `sudo apt install poppler-utils` (Debian/Ubuntu)
 *   `brew install poppler` (macOS)
 *
 * NOTE: This tool requires poppler-utils to be installed on the system.
 * The `pdftoppm` command is used to render PDF pages to images.
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { getPdfPageCount } from './parse-pdf.util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, "..", "sources");

// Check if pdftoppm is available at startup
let pdftoppmAvailable = false;
try {
    execSync("pdftoppm -v", { stdio: "ignore" });
    pdftoppmAvailable = true;
} catch {
    try {
        execSync("which pdftoppm", { stdio: "ignore" });
        pdftoppmAvailable = true;
    } catch {
        console.log(`${color256(196)}[render_diagram_page]${LogColors.RESET} WARNING: pdftoppm not found. Install poppler-utils: sudo apt install poppler-utils`);
    }
}

/**
 * LangChain tool: render_diagram_page
 *
 * Renders a specific page from a diagram PDF as a base64-encoded JPEG image
 * for visual analysis by the LLM.
 */
export const renderDiagramPage = tool(
    async ({ filename, page, dpi, quality }) => {
        console.log(`${color256(171)}[render_diagram_page]${LogColors.RESET} INPUT: file="${filename}", page=${page}, dpi=${dpi}, quality=${quality}`);

        if (!pdftoppmAvailable) {
            return JSON.stringify({
                success: false,
                error: "pdftoppm is not installed. Cannot render PDF pages. Install poppler-utils: sudo apt install poppler-utils",
            });
        }

        const filePath = path.join(SOURCES_DIR, filename);

        if (!fs.existsSync(filePath)) {
            return JSON.stringify({
                success: false,
                error: `File not found: ${filename}. Use list_house_documents to see available files.`,
            });
        }

        const totalPages = await getPdfPageCount(filePath);
        if (page < 1 || page > totalPages) {
            return JSON.stringify({
                success: false,
                error: `Page ${page} is out of range. Document has ${totalPages} pages.`,
            });
        }

        const effectiveDpi = Math.min(dpi, 200);
        const tmpDir = os.tmpdir();
        const tmpBase = path.join(tmpDir, `house-render-${Date.now()}-p${page}`);

        try {
            // Render PDF page to PNG using pdftoppm
            execSync(
                `pdftoppm -f ${page} -l ${page} -png -r ${effectiveDpi} "${filePath}" "${tmpBase}"`,
                { stdio: "ignore", timeout: 30000 }
            );

            // Find the rendered file (pdftoppm appends page number)
            const renderedFiles = fs.readdirSync(tmpDir)
                .filter(f => f.startsWith(path.basename(tmpBase)) && f.endsWith(".png"));

            if (renderedFiles.length === 0) {
                return JSON.stringify({
                    success: false,
                    error: "Failed to render PDF page — no output image generated.",
                });
            }

            const pngPath = path.join(tmpDir, renderedFiles[0]);
            const pngBuffer = fs.readFileSync(pngPath);

            // Convert to base64 (using PNG directly for quality)
            const base64Image = pngBuffer.toString("base64");

            // Cleanup temp file
            try { fs.unlinkSync(pngPath); } catch { /* ignore */ }

            console.log(`${color256(171)}[render_diagram_page]${LogColors.RESET} OUTPUT: rendered page ${page} at ${effectiveDpi} DPI, size=${Math.round(pngBuffer.length / 1024)}KB`);

            return JSON.stringify({
                success: true,
                filename,
                page,
                totalPages,
                dpi: effectiveDpi,
                imageSizeKB: Math.round(pngBuffer.length / 1024),
                imageBase64: base64Image,
                mimeType: "image/png",
                note: "Use this image for visual analysis. To measure distances, identify the scale (e.g., 1:50) from the title block, then use set_diagram_scale and measure_on_diagram.",
            });
        } catch (err: any) {
            // Cleanup on error
            const renderedFiles = fs.readdirSync(tmpDir)
                .filter(f => f.startsWith(path.basename(tmpBase)));
            renderedFiles.forEach(f => { try { fs.unlinkSync(path.join(tmpDir, f)); } catch { /* ignore */ } });

            return JSON.stringify({
                success: false,
                error: `Failed to render page: ${err.message || err}`,
            });
        }
    },
    {
        name: "render_diagram_page",
        description:
            "Render a specific page from a construction diagram PDF as a JPEG image for visual analysis. Returns a base64-encoded image. Use this when you need to visually inspect a diagram — see room layouts, identify walls/doors/windows, read dimensions, or locate the scale. Maximum DPI is 200.",
        schema: z.object({
            filename: z.string().describe("Relative path to the diagram PDF, e.g., 'construction diagrams/תוכנית אדריכלית.pdf'"),
            page: z.number().describe("Page number to render (1-based)"),
            dpi: z.number().default(150).describe("Resolution in DPI (default 150, max 200). Higher = more detail but larger image."),
            quality: z.number().default(80).describe("JPEG quality (1-100, default 80)"),
        }),
    }
);
