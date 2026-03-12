import { tool } from "langchain";
import { z } from "zod";
import { LogColors } from '../../../utils/log-colors.util';
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import pdfParse from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, "..", "sources");

// In-memory cache: filename -> pages
const pdfCache: Map<string, string[]> = new Map();

async function parsePdfPages(filePath: string): Promise<string[]> {
    const fileName = path.basename(filePath);
    if (pdfCache.has(fileName)) {
        return pdfCache.get(fileName)!;
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
    pdfCache.set(fileName, filteredPages);
    return filteredPages;
}

async function getTipsFromManuals(topic?: string): Promise<string> {
    const pdfFiles = fs
        .readdirSync(SOURCES_DIR)
        .filter((f) => f.toLowerCase().endsWith(".pdf"));

    const allExcerpts: { source: string; page: number; text: string }[] = [];

    for (const file of pdfFiles) {
        const filePath = path.join(SOURCES_DIR, file);
        const pages = await parsePdfPages(filePath);

        for (let i = 0; i < pages.length; i++) {
            const pageText = pages[i];
            if (pageText.trim().length < 50) continue;

            if (topic) {
                const keywords = topic.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
                const lower = pageText.toLowerCase();
                const matchCount = keywords.filter((kw) => lower.includes(kw)).length;
                if (matchCount > 0) {
                    allExcerpts.push({ source: file, page: i + 1, text: pageText.slice(0, 1500) });
                }
            } else {
                // No topic — pick diverse pages (every ~10th page for variety)
                if (i % 10 === 0) {
                    allExcerpts.push({ source: file, page: i + 1, text: pageText.slice(0, 1500) });
                }
            }
        }
    }

    // Shuffle and pick a subset for tip generation
    const shuffled = allExcerpts.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 8);

    if (selected.length === 0) {
        return JSON.stringify({
            found: false,
            message: topic
                ? `No content found in the IONIQ 6 manuals related to "${topic}" for generating tips.`
                : "No content found in the IONIQ 6 manuals for generating tips.",
        });
    }

    return JSON.stringify({
        found: true,
        count: selected.length,
        instruction: "Based on the following excerpts from the Hyundai IONIQ 6 car manuals, generate helpful and practical tips for the car owner. Focus on features, abilities, useful shortcuts, safety advice, and things that are good to know.",
        excerpts: selected.map((e) => ({
            source: e.source,
            page: e.page,
            content: e.text,
        })),
    });
}

export const getTips = tool(
    async ({ topic }) => {
        console.log(`${LogColors.RED}[get_ioniq6_tips]${LogColors.RESET} INPUT: topic="${topic || "(general)"}"`);
        const result = await getTipsFromManuals(topic || undefined);
        const parsed = JSON.parse(result);
        console.log(
            `${LogColors.RED}[get_ioniq6_tips]${LogColors.RESET} OUTPUT: found=${parsed.found}, count=${parsed.count ?? 0}`
        );
        return result;
    },
    {
        name: "get_ioniq6_tips",
        description:
            "Retrieve excerpts from the Hyundai IONIQ 6 car manuals to generate helpful tips for the car owner. Optionally provide a topic (e.g. 'charging', 'safety', 'driving modes', 'winter') to get tips about a specific area. If no topic is given, returns a diverse selection of tips from across the manuals. The agent should then formulate clear, practical tips based on the returned content.",
        schema: z.object({
            topic: z
                .string()
                .optional()
                .describe(
                    "Optional topic to focus tips on — e.g. 'charging', 'safety', 'driving modes', 'winter driving', 'maintenance'. Leave empty for general tips."
                ),
        }),
    }
);
