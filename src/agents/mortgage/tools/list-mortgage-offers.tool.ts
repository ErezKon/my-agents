/**
 * ============================================================================
 * LIST MORTGAGE OFFERS TOOL — Discover Available Mortgage Offer PDFs
 * ============================================================================
 *
 * A LangChain tool that lists all available mortgage offer PDF files,
 * organized by bank. The sources directory contains subdirectories for
 * each bank (e.g., "Discount Bank/"), and each bank folder contains
 * one or more PDF files with the mortgage offer details.
 *
 * The agent calls this tool first to understand which banks and offers
 * are available before reading or searching specific documents.
 *
 * Returns: bank names, filenames, relative paths, and file sizes.
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

const TAG = `${color256(45)}[list_mortgage_offers]${LogColors.RESET}`;

function walkOffers(dir: string, bankName: string): { bank: string; filename: string; relativePath: string; sizeKB: number }[] {
    const results: { bank: string; filename: string; relativePath: string; sizeKB: number }[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkOffers(fullPath, bankName));
        } else if (entry.name.toLowerCase().endsWith(".pdf")) {
            const stats = fs.statSync(fullPath);
            results.push({
                bank: bankName,
                filename: entry.name,
                relativePath: path.relative(SOURCES_DIR, fullPath),
                sizeKB: Math.round(stats.size / 1024),
            });
        }
    }
    return results;
}

export const listMortgageOffers = tool(
    () => {
        console.log(`${TAG} Listing available mortgage offers...`);

        if (!fs.existsSync(SOURCES_DIR)) {
            console.log(`${TAG} ERROR: sources directory not found at ${SOURCES_DIR}`);
            return JSON.stringify({ count: 0, offers: [], error: "Sources directory not found" });
        }

        const bankDirs = fs.readdirSync(SOURCES_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory());

        const allOffers: { bank: string; filename: string; relativePath: string; sizeKB: number }[] = [];

        for (const bankDir of bankDirs) {
            const bankPath = path.join(SOURCES_DIR, bankDir.name);
            allOffers.push(...walkOffers(bankPath, bankDir.name));
        }

        console.log(`${TAG} OUTPUT: ${allOffers.length} offers found across ${bankDirs.length} banks`);
        return JSON.stringify({ count: allOffers.length, banks: bankDirs.map(d => d.name), offers: allOffers });
    },
    {
        name: "list_mortgage_offers",
        description:
            "List all available mortgage offer PDFs organized by bank. Returns bank names, filenames, relative paths, and file sizes. Use this first to understand which offers are available before reading or searching them.",
        schema: z.object({}),
    }
);
