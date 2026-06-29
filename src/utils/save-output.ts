/**
 * ============================================================================
 * SAVE OUTPUT — Generic Agent Output Saver (Chef & Stocks)
 * ============================================================================
 *
 * Saves request/response data to disk for the Chef and Stocks agents.
 * Creates a timestamped folder under `outputs/` with:
 *   - `request.json` — The original request payload.
 *   - `full-response.json` — The complete agent response object.
 *   - `response-markdown.md` — Extracted from `structuredResponse.answer`.
 *   - `response.md` — (Stocks only) Formatted markdown report built from
 *     the structured response data using `buildMarkdown()`.
 *
 * The function inspects the response structure to determine what type of
 * agent produced it and extracts the appropriate content for each file.
 * ============================================================================
 */
import * as fs from "fs";
import * as path from "path";
import {buildMarkdown} from '../agents/stocks/tools/export-markdown.tool';
import {LogColors} from './log-colors.util';
import {createOutputDir, saveRequestJson, saveResponseJson, normalizeNewlines} from './save-output-base';

const TAG = "save-output";

function extractMarkdownAnswer(obj: any): string | null {
    console.log(obj);
    if (!obj || typeof obj !== "object") return null;

    // Direct path: structuredResponse.answer
    if (obj.structuredResponse?.answer) return obj.structuredResponse.answer;

    // Search one level deep in case the response is wrapped (e.g. chunk keys)
    for (const value of Object.values(obj)) {
        if (value && typeof value === "object") {
            const nested = value as any;
            if (nested.structuredResponse?.answer) return nested.structuredResponse.answer;
        }
    }

    return null;
}

function extractStructuredResponse(obj: any): any | null {
    if (!obj || typeof obj !== "object") return null;

    if (obj.structuredResponse) return obj.structuredResponse;

    for (const value of Object.values(obj)) {
        if (value && typeof value === "object") {
            const nested = value as any;
            if (nested.structuredResponse) return nested.structuredResponse;
        }
    }

    return null;
}

export function saveAgentOutput(
    agentName: string,
    request: Record<string, any>,
    fullResponse: any
): string | null {
    try {
        const query = request.message || request.query || JSON.stringify(request);
        const outputDir = createOutputDir(agentName, query, TAG);

        saveRequestJson(outputDir, request, TAG);
        saveResponseJson(outputDir, fullResponse, TAG);

        // Extract structuredResponse.answer and save as markdown
        const mdAnswer = extractMarkdownAnswer(fullResponse);
        if (mdAnswer) {
            const mdContent = normalizeNewlines(mdAnswer);
            const mdPath = path.join(outputDir, "response-markdown.md");
            fs.writeFileSync(mdPath, mdContent + "\n", "utf-8");
            console.log(`${TAG} Saved response-markdown.md (${mdContent.length} chars)`);
        } else {
            console.log(`${TAG} No structuredResponse.answer found, skipping response-markdown.md`);
        }

        // For stocks agent: export structuredResponse as formatted markdown
        const structuredResponse = extractStructuredResponse(fullResponse);
        if (structuredResponse && structuredResponse.summary && structuredResponse.stockData) {
            const stocksMd = buildMarkdown(structuredResponse);
            const stocksMdPath = path.join(outputDir, "response.md");
            fs.writeFileSync(stocksMdPath, stocksMd, "utf-8");
            console.log(`${TAG} Saved response.md (${stocksMd.length} chars)`);
        }

        return outputDir;
    } catch (err: any) {
        console.error(`${TAG} ERROR saving output:`, err.message);
        return null;
    }
}
