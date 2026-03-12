import * as fs from "fs";
import * as path from "path";
import {LogColors} from './log-colors.util';
import {createOutputDir, saveRequestJson, saveResponseJson, normalizeNewlines} from './save-output-base';

const TAG = "save-ioniq6-output";

/**
 * Extract markdown content from the last AI message in the agent response.
 * IONIQ-6 agent returns markdown directly in messages[last].kwargs.content
 * (not wrapped in a structuredResponse).
 */
function extractMarkdownContent(fullResponse: any): string | null {
    // The stream's last chunk is keyed by node name (e.g. "model_request")
    // and contains a messages array.
    const messages = fullResponse?.model_request?.messages
        ?? fullResponse?.messages;

    if (!Array.isArray(messages)) return null;

    // Walk backwards to find the last AI message with content.
    // Live LangChain objects have .content directly; serialized JSON uses .kwargs.content.
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];

        // Live LangChain message object
        if (msg?.content && typeof msg.content === "string" && msg._getType?.() === "ai") {
            return msg.content;
        }

        // Serialized JSON form
        const kwargs = msg?.kwargs;
        if (kwargs?.type === "ai" && kwargs.content) {
            return kwargs.content;
        }
    }

    return null;
}

export function saveIONIQ6Output(
    request: Record<string, any>,
    fullResponse: any
): string | null {
    try {
        const query = request.message || request.query || JSON.stringify(request);
        const outputDir = createOutputDir("ioniq6", query, TAG);

        saveRequestJson(outputDir, request, TAG);
        saveResponseJson(outputDir, fullResponse, TAG);

        // Extract markdown content and save as response.md
        const mdContent = extractMarkdownContent(fullResponse);
        if (mdContent) {
            const normalized = normalizeNewlines(mdContent);
            const mdPath = path.join(outputDir, "response.md");
            fs.writeFileSync(mdPath, normalized + "\n", "utf-8");
            console.log(`${LogColors.GREEN}[${TAG}]${LogColors.RESET} Saved response.md (${normalized.length} chars)`);
        } else {
            console.log(`${LogColors.GREEN}[${TAG}]${LogColors.RESET} No AI message content found, skipping response.md`);
        }

        return outputDir;
    } catch (err: any) {
        console.error(`${LogColors.GREEN}[${TAG}]${LogColors.RESET} ERROR saving output:`, err.message);
        return null;
    }
}
