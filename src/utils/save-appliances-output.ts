import * as fs from 'fs';
import * as path from 'path';
import {LogColors} from './log-colors.util';
import {createOutputDir, saveRequestJson, saveResponseJson, normalizeNewlines} from './save-output-base';

const TAG = 'save-appliances-output';

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
 * If the AI content is a structured JSON response (from AppliancesAnswerSchema),
 * compose a rich markdown document from its fields. Otherwise return it as-is.
 */
function safeFilename(s: string): string {
    return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

function findModelImage(brand: string, model: string, outputDir: string): string | null {
    const imagesDir = path.join(outputDir, 'images');
    if (!fs.existsSync(imagesDir)) return null;
    const prefix = `${safeFilename(brand)}-${safeFilename(model)}`;
    const files = fs.readdirSync(imagesDir);
    const match = files.find(f => f.startsWith(prefix) && /\.(jpg|jpeg|png)$/i.test(f));
    return match ? `images/${match}` : null;
}

function toMarkdown(raw: string, outputDir?: string): string {
    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return raw;
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.answerHebrew) {
        return raw;
    }

    const lines: string[] = [];

    lines.push(parsed.answerHebrew);
    lines.push('');

    if (parsed.appliances?.length) {
        lines.push('---');
        lines.push('');
        lines.push('## טבלת מוצרים');
        lines.push('');
        lines.push('| # | מותג | דגם | תמונה | מידות (ג×ר×ע) / נפח | תכונות מרכזיות | אמינות | דירוג אנרגטי | מחיר (₪) | תמורה לכסף | יתרונות | חסרונות |');
        lines.push('|---|------|------|--------|----------------------|----------------|--------|-------------|----------|-----------|----------|-----------|');
        parsed.appliances.forEach((a: any, i: number) => {
            const features = Array.isArray(a.keyFeatures) ? a.keyFeatures.join(', ') : '';
            const price = typeof a.priceILS === 'number' ? a.priceILS.toLocaleString('en-US') : '–';
            const dimParts: string[] = [];
            if (a.heightCm != null || a.widthCm != null || a.depthCm != null) {
                dimParts.push(`${a.heightCm ?? '?'}×${a.widthCm ?? '?'}×${a.depthCm ?? '?'} ס\"ם`);
            }
            if (a.volumeLiters != null) dimParts.push(`${a.volumeLiters} ליטר`);
            const dims = dimParts.join(' / ') || '–';
            const pros = Array.isArray(a.pros) && a.pros.length ? a.pros.join(', ') : '–';
            const cons = Array.isArray(a.cons) && a.cons.length ? a.cons.join(', ') : '–';
            const imgPath = outputDir ? findModelImage(a.brand || '', a.model || '', outputDir) : null;
            const imgCell = imgPath ? `<img src=\"${imgPath}\" width=\"100\">` : '–';
            const modelCell = a.url ? `[${a.model || ''}](${a.url})` : (a.model || '');
            lines.push(
                `| ${i + 1} | **${a.brand || ''}** | ${modelCell} | ${imgCell} | ${dims} | ${features} | ${a.reliability || '–'} | ${a.energyRating || '–'} | ${price} | ${a.valueForMoney || '–'} | ${pros} | ${cons} |`
            );
        });
        lines.push('');
    }

    if (parsed.comparisons?.length) {
        lines.push('---');
        lines.push('');
        lines.push('## השוואות');
        lines.push('');
        for (const c of parsed.comparisons) {
            lines.push(`### ${c.category || ''}`);
            if (c.summary) lines.push(c.summary);
            if (c.recommendedModel) lines.push(`**דגם מומלץ:** ${c.recommendedModel}`);
            if (c.rationale) lines.push(`**נימוק:** ${c.rationale}`);
            lines.push('');
        }
    }

    if (parsed.recommendations?.length) {
        lines.push('---');
        lines.push('');
        lines.push('## המלצות');
        lines.push('');
        for (const r of parsed.recommendations) {
            lines.push(`- ${r}`);
        }
        lines.push('');
    }

    if (parsed.generatedFiles?.length) {
        lines.push('---');
        lines.push('');
        lines.push('## קבצים שנוצרו');
        lines.push('');
        for (const f of parsed.generatedFiles) {
            lines.push(`- **${f.category || ''}**: Excel: \`${f.excelPath || '–'}\` | PDF: \`${f.pdfPath || '–'}\``);
        }
        lines.push('');
    }

    if (parsed.sources?.length) {
        lines.push('---');
        lines.push('');
        lines.push('## מקורות');
        lines.push('');
        for (const s of parsed.sources) {
            lines.push(`- 🔗 [${s.title || s.url}](${s.url})`);
        }
        lines.push('');
    }

    if (parsed.summary && parsed.summary !== parsed.answerHebrew) {
        lines.push('---');
        lines.push('');
        lines.push('## סיכום');
        lines.push('');
        lines.push(parsed.summary);
        lines.push('');
    }

    return lines.join('\n');
}

/** No longer used — images are now inline in the table. Kept as no-op for safety. */
function appendImageGallery(md: string, _outputDir: string): string {
    return md;
}

export function saveAppliancesOutput(
    request: Record<string, any>,
    fullResponse: any,
    existingOutputDir?: string
): string | null {
    try {
        const query = request.message || request.query || JSON.stringify(request);
        const outputDir = existingOutputDir ?? createOutputDir('appliances', query, TAG);

        saveRequestJson(outputDir, request, TAG);
        saveResponseJson(outputDir, fullResponse, TAG);

        const rawContent = extractLastAiContent(fullResponse);
        if (rawContent) {
            let md = normalizeNewlines(toMarkdown(rawContent, outputDir));
            md = appendImageGallery(md, outputDir);
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
