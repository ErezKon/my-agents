import { tool } from "langchain";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { LogColors } from '../../../utils/log-colors.util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, "..", "sources");

export const listManuals = tool(
    () => {
        console.log(`${LogColors.BRIGHT_WHITE}[list_ioniq6_manuals]${LogColors.RESET} Listing available manuals...`);
        const files = fs
            .readdirSync(SOURCES_DIR)
            .filter((f) => f.toLowerCase().endsWith(".pdf"));

        const manuals = files.map((f) => {
            const stats = fs.statSync(path.join(SOURCES_DIR, f));
            return {
                filename: f,
                sizeKB: Math.round(stats.size / 1024),
            };
        });

        console.log(`${LogColors.BRIGHT_WHITE}[list_ioniq6_manuals]${LogColors.RESET} OUTPUT: ${manuals.length} manuals found`);
        return JSON.stringify({ count: manuals.length, manuals });
    },
    {
        name: "list_ioniq6_manuals",
        description:
            "List all available Hyundai IONIQ 6 car manuals in the sources folder. Returns filenames and sizes. Use this to understand which manuals are available before searching.",
        schema: z.object({}),
    }
);
