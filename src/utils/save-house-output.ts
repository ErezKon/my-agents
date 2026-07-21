import * as fs from 'fs';
import * as path from 'path';
import {LogColors} from './log-colors.util';
import {createOutputDir, saveRequestJson, saveResponseJson, normalizeNewlines} from './save-output-base';

const TAG = 'save-house-output';

/**
 * Extract markdown content from the last AI message in the agent response.
 */
function extractMarkdownContent(fullResponse: any): string | null {
    const messages = fullResponse?.model_request?.messages
        ?? fullResponse?.messages;

    if (!Array.isArray(messages)) return null;

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];

        // Live LangChain message object
        if (msg?.content && typeof msg.content === 'string' && msg._getType?.() === 'ai') {
            return msg.content;
        }

        // Serialized JSON form
        const kwargs = msg?.kwargs;
        if (kwargs?.type === 'ai' && kwargs.content) {
            return kwargs.content;
        }
    }

    return null;
}

export function saveHouseOutput(
    request: Record<string, any>,
    fullResponse: any
): string | null {
    try {
        const query = request.message || request.query || JSON.stringify(request);
        const outputDir = createOutputDir('house', query, TAG);

        saveRequestJson(outputDir, request, TAG);
        saveResponseJson(outputDir, fullResponse, TAG);

        const mdContent = extractMarkdownContent(fullResponse);
        if (mdContent) {
            const normalized = normalizeNewlines(mdContent);
            const mdPath = path.join(outputDir, 'response.md');
            fs.writeFileSync(mdPath, normalized + '\n', 'utf-8');
            console.log(`${LogColors.BRIGHT_BLUE}[${TAG}]${LogColors.RESET} Saved response.md (${normalized.length} chars)`);
        } else {
            console.log(`${LogColors.BRIGHT_BLUE}[${TAG}]${LogColors.RESET} No AI message content found, skipping response.md`);
        }

        return outputDir;
    } catch (err: any) {
        console.error(`${LogColors.BRIGHT_BLUE}[${TAG}]${LogColors.RESET} ERROR saving output:`, err.message);
        return null;
    }
}
