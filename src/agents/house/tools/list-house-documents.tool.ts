/**
 * ============================================================================
 * LIST HOUSE DOCUMENTS TOOL — Enumerate Available Contracts & Diagrams
 * ============================================================================
 *
 * A LangChain tool that lists all available house-related PDF documents,
 * organized into two categories:
 * - **contracts/**: Purchase agreements, appendices, specifications
 * - **construction diagrams/**: Architectural plans, electrical diagrams,
 *   structural blueprints, tenant modification plans
 *
 * The House agent calls this tool first to understand what documents are
 * available before searching or reading specific files. The tool scans
 * the `sources/` directory (relative to this file) for PDF files in both
 * subdirectories and returns their filenames, sizes, and categories.
 *
 * DIRECTORY STRUCTURE EXPECTED:
 * ```
 * sources/
 * ├── contracts/
 * │   ├── הסכם מכר.pdf
 * │   ├── נספח מפרט.pdf
 * │   └── ...
 * └── construction diagrams/
 *     ├── תוכנית אדריכלית.pdf
 *     ├── תוכנית חשמל.pdf
 *     └── ...
 * ```
 *
 * The tool returns a JSON object with document counts and details for each
 * category, enabling the agent to make informed decisions about which
 * documents to search or read.
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { LogColors, color256 } from '../../../utils/log-colors.util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, "..", "sources");
const CONTRACTS_DIR = path.join(SOURCES_DIR, "contracts");
const DIAGRAMS_DIR = path.join(SOURCES_DIR, "construction diagrams");

/**
 * LangChain tool: list_house_documents
 *
 * Scans the contracts and construction diagrams directories and returns
 * a categorized listing of all available PDF files.
 */
export const listHouseDocuments = tool(
    () => {
        console.log(`${color256(208)}[list_house_documents]${LogColors.RESET} Listing available documents...`);

        const listPdfs = (dir: string, category: string) => {
            if (!fs.existsSync(dir)) return [];
            return fs.readdirSync(dir)
                .filter(f => f.toLowerCase().endsWith(".pdf"))
                .map(f => {
                    const stats = fs.statSync(path.join(dir, f));
                    return {
                        filename: f,
                        category,
                        path: `${category}/${f}`,
                        sizeKB: Math.round(stats.size / 1024),
                    };
                });
        };

        const contracts = listPdfs(CONTRACTS_DIR, "contracts");
        const diagrams = listPdfs(DIAGRAMS_DIR, "construction diagrams");
        const all = [...contracts, ...diagrams];

        console.log(`${color256(208)}[list_house_documents]${LogColors.RESET} OUTPUT: ${contracts.length} contracts, ${diagrams.length} diagrams`);
        return JSON.stringify({
            totalDocuments: all.length,
            contracts: { count: contracts.length, files: contracts },
            diagrams: { count: diagrams.length, files: diagrams },
        });
    },
    {
        name: "list_house_documents",
        description:
            "List all available house documents — purchase contracts and construction diagrams. Returns filenames, categories (contracts / construction diagrams), and file sizes. Use this first to understand which documents are available.",
        schema: z.object({}),
    }
);
