/**
 * ============================================================================
 * EXPORT APPLIANCE COMPARISON TOOL — Excel & PDF Report Generator
 * ============================================================================
 *
 * A LangChain tool that exports structured product comparison data into
 * downloadable Excel (.xlsx) and/or PDF files. This is the final step in
 * the Appliances agent's workflow — after searching, comparing, and
 * presenting products in chat, the user can request a formatted document
 * to save, print, or share with family members.
 *
 * EXPORT FORMATS:
 * ───────────────
 * 1. **Excel (.xlsx)** — Generated using the `exceljs` library.
 *    - Blue header row with white bold text
 *    - Price row, optional rating row
 *    - All spec keys merged from all products (N/A for missing specs)
 *    - Pros and cons as newline-separated lists
 *    - "★ מומלץ" flag for recommended products
 *    - 25-character column width for readability
 *
 * 2. **PDF** — Generated using the `pdfmake` library with DejaVuSans font
 *    (supports Hebrew/Unicode characters).
 *    - Title header with product comparison name
 *    - Auto-sized table with specs for all products
 *    - Pros/cons section with ✓/✗ markers
 *    - Requires DejaVuSans.ttf and DejaVuSans-Bold.ttf in the `assets/`
 *      directory (relative to this file's parent)
 *
 * FILE OUTPUT:
 * - Files are saved to `<project-root>/outputs/appliance-exports/`
 * - Filename format: `comparison-<ISO-timestamp>.xlsx` or `.pdf`
 * - The directory is auto-created if it doesn't exist
 * - The tool returns the absolute file paths so the Express handler can
 *   serve them as download links
 *
 * PRODUCT DATA SCHEMA:
 * Each product in the input array must match the `ProductSchema`:
 *   - `name` — Product model name
 *   - `brand` — Brand name
 *   - `price` — Price string (e.g., "₪3,500")
 *   - `specs` — Record of feature→value pairs (e.g., { "נפח": "9 ק\"ג" })
 *   - `pros` — Array of advantage strings
 *   - `cons` — Array of disadvantage strings
 *   - `rating` — Optional user rating string
 *   - `recommended` — Optional boolean flag for the top pick
 *
 * ARCHITECTURE NOTE:
 * This tool uses `import.meta.url` + `fileURLToPath` to resolve paths
 * relative to the source file (ESM-compatible). The `__dirname` equivalent
 * is computed at module load time.
 *
 * DEPENDENCIES:
 * - `exceljs` — Excel workbook generation
 * - `pdfmake` — PDF document generation (with custom font support)
 * - DejaVuSans font files in `../assets/` for PDF Hebrew rendering
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { LogColors, color256 } from '../../../utils/log-colors.util';
import ExcelJS from "exceljs";
import PdfPrinter from "pdfmake/src/printer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, "..", "assets");
const EXPORTS_DIR = path.join(__dirname, "..", "..", "..", "..", "outputs", "appliance-exports");

const TAG = `${color256(45)}[export_appliance_comparison]${LogColors.RESET}`;

/**
 * Ensure the exports output directory exists, creating it recursively
 * if needed. Called before every export operation.
 */
function ensureExportsDir() {
    if (!fs.existsSync(EXPORTS_DIR)) {
        fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    }
}

/**
 * Zod schema for individual product data in the comparison.
 * Validated at the tool boundary to ensure the LLM provides well-structured
 * product objects with all required fields.
 */
const ProductSchema = z.object({
    name: z.string(),
    brand: z.string(),
    price: z.string(),
    specs: z.record(z.string()),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
    rating: z.string().optional(),
    recommended: z.boolean().optional(),
});

/**
 * Generate an Excel (.xlsx) comparison workbook.
 *
 * @param products - Array of validated product objects.
 * @param title - Title for the worksheet (unused in Excel but kept for API consistency).
 * @returns Absolute file path to the saved .xlsx file.
 */
async function exportExcel(products: z.infer<typeof ProductSchema>[], title: string): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Comparison");

    // Collect all unique spec keys across all products
    const allSpecKeys = new Set<string>();
    products.forEach(p => Object.keys(p.specs).forEach(k => allSpecKeys.add(k)));

    // Header row: Feature column + one column per product
    const headerRow = ["Feature / מאפיין", ...products.map(p => `${p.brand} ${p.name}`)];
    ws.addRow(headerRow);
    const hr = ws.getRow(1);
    hr.font = { bold: true, size: 12 };
    hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
    hr.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };

    // Price row (always present)
    ws.addRow(["מחיר / Price", ...products.map(p => p.price)]);

    // Rating row (only if at least one product has a rating)
    if (products.some(p => p.rating)) ws.addRow(["דירוג / Rating", ...products.map(p => p.rating || "N/A")]);

    // Spec rows — one row per unique spec key
    for (const key of allSpecKeys) {
        ws.addRow([key, ...products.map(p => p.specs[key] || "N/A")]);
    }

    // Pros and cons section
    ws.addRow([]);
    ws.addRow(["יתרונות / Pros", ...products.map(p => p.pros.join("\n"))]);
    ws.addRow(["חסרונות / Cons", ...products.map(p => p.cons.join("\n"))]);

    // Recommendation flag
    if (products.some(p => p.recommended)) {
        ws.addRow([]);
        ws.addRow(["מומלץ / Recommended", ...products.map(p => p.recommended ? "★ מומלץ" : "")]);
    }

    // Auto-width columns
    ws.columns.forEach(col => { col.width = 25; });

    // Save to disk
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `comparison-${timestamp}.xlsx`;
    const filePath = path.join(EXPORTS_DIR, filename);
    await wb.xlsx.writeFile(filePath);
    return filePath;
}

/**
 * Generate a PDF comparison document with Hebrew font support.
 *
 * @param products - Array of validated product objects.
 * @param title - Title displayed at the top of the PDF.
 * @returns Absolute file path to the saved .pdf file.
 */
function exportPdf(products: z.infer<typeof ProductSchema>[], title: string): string {
    // Load DejaVuSans fonts for Hebrew/Unicode support
    const fonts = {
        DejaVuSans: {
            normal: path.join(ASSETS_DIR, "DejaVuSans.ttf"),
            bold: path.join(ASSETS_DIR, "DejaVuSans-Bold.ttf"),
            italics: path.join(ASSETS_DIR, "DejaVuSans.ttf"),
            bolditalics: path.join(ASSETS_DIR, "DejaVuSans-Bold.ttf"),
        },
    };

    const printer = new PdfPrinter(fonts);

    // Collect all unique spec keys
    const allSpecKeys = new Set<string>();
    products.forEach(p => Object.keys(p.specs).forEach(k => allSpecKeys.add(k)));

    // Build comparison table body
    const tableBody: any[][] = [];
    const headerRow = [{ text: "Feature", bold: true }, ...products.map(p => ({ text: `${p.brand} ${p.name}`, bold: true }))];
    tableBody.push(headerRow);
    tableBody.push(["Price", ...products.map(p => p.price)]);
    for (const key of allSpecKeys) {
        tableBody.push([key, ...products.map(p => p.specs[key] || "N/A")]);
    }

    // Build the PDF document definition
    const dd: any = {
        defaultStyle: { font: "DejaVuSans", fontSize: 9 },
        content: [
            { text: title, fontSize: 16, bold: true, margin: [0, 0, 0, 10] },
            { table: { headerRows: 1, widths: ["auto", ...products.map(() => "*")], body: tableBody }, layout: "lightHorizontalLines" },
            { text: "\nPros / Cons", fontSize: 12, bold: true, margin: [0, 10, 0, 5] },
            ...products.flatMap(p => [
                { text: `${p.brand} ${p.name}:`, bold: true, margin: [0, 5, 0, 2] },
                { ul: p.pros.map(pro => `✓ ${pro}`) },
                { ul: p.cons.map(con => `✗ ${con}`) },
            ]),
        ],
    };

    // Generate and save the PDF
    const pdfDoc = printer.createPdfKitDocument(dd);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `comparison-${timestamp}.pdf`;
    const filePath = path.join(EXPORTS_DIR, filename);
    pdfDoc.pipe(fs.createWriteStream(filePath));
    pdfDoc.end();
    return filePath;
}

/**
 * LangChain tool: export_appliance_comparison
 *
 * Exports structured product comparison data to Excel, PDF, or both formats.
 * Returns the absolute file path(s) of the generated document(s).
 */
export const exportApplianceComparison = tool(
    async ({ products, title, format }) => {
        const exportTitle = title || "Appliance Comparison";
        const exportFormat = format || "excel";
        console.log(`${TAG} INPUT: ${products.length} products, format=${exportFormat}, title="${exportTitle}"`);
        ensureExportsDir();

        try {
            let filePath: string;

            if (exportFormat === "excel" || exportFormat === "both") {
                filePath = await exportExcel(products, exportTitle);
                console.log(`${TAG} Excel saved: ${filePath}`);

                if (exportFormat === "both") {
                    const pdfPath = exportPdf(products, exportTitle);
                    console.log(`${TAG} PDF saved: ${pdfPath}`);
                    return JSON.stringify({ success: true, files: [filePath, pdfPath] });
                }

                return JSON.stringify({ success: true, files: [filePath] });
            }

            filePath = exportPdf(products, exportTitle);
            console.log(`${TAG} PDF saved: ${filePath}`);
            return JSON.stringify({ success: true, files: [filePath] });
        } catch (err: any) {
            console.log(`${TAG} ERROR: ${err.message}`);
            return JSON.stringify({ success: false, error: err.message });
        }
    },
    {
        name: "export_appliance_comparison",
        description: "Export a product comparison to Excel or PDF file. Takes structured product data and generates a formatted comparison document. Use this when the user wants to save or share a comparison.",
        schema: z.object({
            products: z.array(ProductSchema).describe("Products to compare"),
            title: z.string().optional().describe("Title for the comparison document"),
            format: z.enum(["excel", "pdf", "both"]).optional().describe("Export format (default: excel)"),
        }),
    }
);
