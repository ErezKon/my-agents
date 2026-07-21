import * as fs from 'fs';
import * as path from 'path';
import {LogColors} from './log-colors.util';
import {createOutputDir, saveRequestJson, saveResponseJson, normalizeNewlines} from './save-output-base';

const TAG = 'save-slide-generator-output';

/**
 * Extract the raw content string from the last AI message in the agent response.
 */
function extractLastAiContent(fullResponse: any): string | null {
    const messages = fullResponse?.model_request?.messages
        ?? fullResponse?.messages;

    if (!Array.isArray(messages)) return null;

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];

        if (msg?.content && typeof msg.content === 'string' && msg._getType?.() === 'ai') {
            return msg.content;
        }

        const kwargs = msg?.kwargs;
        if (kwargs?.type === 'ai' && kwargs.content) {
            return kwargs.content;
        }
    }

    return null;
}

/**
 * Turn the structured SlideDeckSchema JSON into a readable markdown summary.
 * Falls back to the raw content if it isn't the expected structured shape.
 */
function toMarkdown(raw: string): string {
    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return raw;
    }

    if (!parsed || typeof parsed !== 'object' || (parsed.answer === undefined && parsed.slides === undefined)) {
        return raw;
    }

    const lines: string[] = [];

    lines.push(`# ${parsed.deckTitle || 'Presentation'}`);
    lines.push('');
    if (parsed.answer) {
        lines.push(parsed.answer);
        lines.push('');
    }

    if (parsed.needsClarification && parsed.clarifyingQuestions?.length) {
        lines.push('---');
        lines.push('');
        lines.push('## Clarifying Questions');
        lines.push('');
        for (const q of parsed.clarifyingQuestions) lines.push(`- ${q}`);
        lines.push('');
    }

    if (parsed.pptxPath) {
        lines.push('---');
        lines.push('');
        lines.push(`**PowerPoint file:** \`${parsed.pptxPath}\``);
        lines.push('');
    }

    if (parsed.htmlPath) {
        lines.push('---');
        lines.push('');
        lines.push(`**HTML (reveal.js) file:** \`${parsed.htmlPath}\``);
        lines.push('');
    }

    if (parsed.outputFormat) {
        lines.push(`**Output format:** ${parsed.outputFormat}`);
        lines.push('');
    }

    if (parsed.style) {
        lines.push(`**Style:** ${parsed.style}`);
        lines.push('');
    }

    if (parsed.slides?.length) {
        lines.push('---');
        lines.push('');
        lines.push('## Slides');
        lines.push('');
        parsed.slides.forEach((s: any, i: number) => {
            lines.push(`### ${i + 1}. ${s.title || '(untitled)'} _(${s.layout})_`);
            if (s.subtitle) lines.push(`*${s.subtitle}*`);
            if (Array.isArray(s.bullets) && s.bullets.length) {
                for (const b of s.bullets) {
                    const indent = (b.indent ?? 0) > 0 ? '  ' : '';
                    lines.push(`${indent}- ${b.text}`);
                }
            }
            if (s.quote) lines.push(`> ${s.quote}`);
            if (s.code) {
                lines.push('```' + (s.codeLanguage || ''));
                lines.push(s.code);
                lines.push('```');
            }
            if (s.imageUrl) lines.push(`![image](${s.imageUrl})`);
            if (s.speakerNotes) lines.push(`\n_Notes:_ ${s.speakerNotes}`);
            lines.push('');
        });
    }

    if (parsed.attachedFileSummaries?.length) {
        lines.push('---');
        lines.push('');
        lines.push('## Attached Files');
        lines.push('');
        for (const f of parsed.attachedFileSummaries) {
            lines.push(`- **${f.fileName}** _(${f.intent})_: ${f.keyTakeaways}`);
        }
        lines.push('');
    }

    if (parsed.codeInsights?.length) {
        lines.push('---');
        lines.push('');
        lines.push('## Code Insights');
        lines.push('');
        for (const c of parsed.codeInsights) {
            lines.push(`- **${c.topic}**: ${c.detail}`);
        }
        lines.push('');
    }

    if (parsed.suggestedAdditions?.length) {
        lines.push('---');
        lines.push('');
        lines.push('## Suggested Additions');
        lines.push('');
        for (const s of parsed.suggestedAdditions) lines.push(`- ${s}`);
        lines.push('');
    }

    if (parsed.sources?.length) {
        lines.push('---');
        lines.push('');
        lines.push('## Sources');
        lines.push('');
        for (const s of parsed.sources) {
            lines.push(`- [${s.title || s.url}](${s.url})`);
        }
        lines.push('');
    }

    if (parsed.summary) {
        lines.push('---');
        lines.push('');
        lines.push('## Summary');
        lines.push('');
        lines.push(parsed.summary);
        lines.push('');
    }

    return lines.join('\n');
}

export function saveSlideGeneratorOutput(
    request: Record<string, any>,
    fullResponse: any,
    existingOutputDir?: string
): string | null {
    try {
        const query = request.message || request.query || JSON.stringify(request);
        const outputDir = existingOutputDir ?? createOutputDir('slidegen', query, TAG);

        saveRequestJson(outputDir, request, TAG);
        saveResponseJson(outputDir, fullResponse, TAG);

        const rawContent = extractLastAiContent(fullResponse);
        if (rawContent) {
            const md = normalizeNewlines(toMarkdown(rawContent));
            const mdPath = path.join(outputDir, 'response.md');
            fs.writeFileSync(mdPath, md + '\n', 'utf-8');
            console.log(`${LogColors.BRIGHT_BLUE}[${TAG}]${LogColors.RESET} Saved response.md (${md.length} chars)`);
        } else {
            console.log(`${LogColors.BRIGHT_BLUE}[${TAG}]${LogColors.RESET} No AI message content found, skipping response.md`);
        }

        return outputDir;
    } catch (err: any) {
        console.error(`${LogColors.BRIGHT_BLUE}[${TAG}]${LogColors.RESET} ERROR saving output:`, err.message);
        return null;
    }
}
