import { tool } from 'langchain';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(183)}[parse_attached_file]${LogColors.RESET}`;

// ─── Supported extensions ─────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.json', '.csv', '.xml', '.html', '.htm', '.yaml', '.yml']);
const PPTX_EXTENSIONS = new Set(['.pptx']);
const PDF_EXTENSIONS = new Set(['.pdf']);

// ─── PPTX parser ──────────────────────────────────────────────────────────────

interface PptxSlideContent {
    slideNumber: number;
    texts: string[];
}

async function parsePptx(filePath: string): Promise<{
    slideCount: number;
    slides: PptxSlideContent[];
    rawStructure?: any;
}> {
    // Dynamic import — only loaded when needed
    const { default: PptxParser } = await import('node-pptx-parser');
    const parser = new PptxParser(filePath);

    // Use full parse to get structure, fall back to extractText
    try {
        const parsed = await parser.parse();
        const slides: PptxSlideContent[] = [];

        if (parsed.slides && Array.isArray(parsed.slides)) {
            for (let i = 0; i < parsed.slides.length; i++) {
                const s = parsed.slides[i];
                const texts: string[] = [];
                // Extract text from parsed content
                if (s.parsed) {
                    extractTextsFromParsed(s.parsed, texts);
                }
                slides.push({ slideNumber: i + 1, texts });
            }
        }

        return { slideCount: slides.length, slides, rawStructure: parsed.presentation?.parsed };
    } catch {
        // Fallback to simple text extraction
        const textContent = await parser.extractText();
        const slides: PptxSlideContent[] = textContent.map((s: any) => ({
            slideNumber: s.id ?? 0,
            texts: Array.isArray(s.text) ? s.text : [String(s.text)],
        }));
        return { slideCount: slides.length, slides };
    }
}

/** Recursively pull text strings from the parsed pptx structure. */
function extractTextsFromParsed(obj: any, out: string[]): void {
    if (!obj) return;
    if (typeof obj === 'string') {
        const trimmed = obj.trim();
        if (trimmed) out.push(trimmed);
        return;
    }
    if (Array.isArray(obj)) {
        for (const item of obj) extractTextsFromParsed(item, out);
        return;
    }
    if (typeof obj === 'object') {
        // Look for common text keys
        for (const key of ['text', 'value', 'content', 'title', 'body', 'note', 'notes']) {
            if (obj[key] !== undefined) extractTextsFromParsed(obj[key], out);
        }
        // Recurse into children/items arrays
        for (const key of ['children', 'items', 'paragraphs', 'runs', 'elements']) {
            if (Array.isArray(obj[key])) extractTextsFromParsed(obj[key], out);
        }
    }
}

// ─── PDF parser ───────────────────────────────────────────────────────────────

async function parsePdf(filePath: string): Promise<{ pageCount: number; text: string }> {
    const mod = await import('pdf-parse');
    const pdfParse = (mod as any).default ?? mod;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return { pageCount: data.numpages, text: data.text };
}

// ─── Text file reader ─────────────────────────────────────────────────────────

function readTextFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8');
}

// ─── Tool ─────────────────────────────────────────────────────────────────────

export const createParseAttachedFileTool = () => tool(
    async ({ filePath, intent }) => {
        console.log(`${TAG} INPUT: filePath='${filePath}', intent='${intent ?? 'auto'}'`);

        // Resolve and validate
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) {
            const msg = `File not found: ${resolved}`;
            console.log(`${TAG} ERROR: ${msg}`);
            return JSON.stringify({ error: msg });
        }

        const ext = path.extname(resolved).toLowerCase();
        const fileName = path.basename(resolved);
        const stats = fs.statSync(resolved);
        const sizeMB = stats.size / (1024 * 1024);

        if (sizeMB > 50) {
            const msg = `File too large (${sizeMB.toFixed(1)} MB). Max supported: 50 MB.`;
            console.log(`${TAG} ERROR: ${msg}`);
            return JSON.stringify({ error: msg });
        }

        let result: any;

        if (PPTX_EXTENSIONS.has(ext)) {
            // ─ PowerPoint ─
            console.log(`${TAG} Parsing PPTX: ${fileName} (${sizeMB.toFixed(1)} MB)`);
            const pptxData = await parsePptx(resolved);

            const slideSummaries = pptxData.slides.map((s) => ({
                slide: s.slideNumber,
                content: s.texts.join('\n'),
            }));

            result = {
                fileType: 'pptx',
                fileName,
                slideCount: pptxData.slideCount,
                slides: slideSummaries,
                _note:
                    intent === 'inspiration'
                        ? 'Use this deck as INSPIRATION: adopt similar tone, structure, design patterns, and themes — but create original content.'
                        : intent === 'merge'
                            ? 'MERGE/INCORPORATE this deck\'s content into the new presentation. Treat it as research material and source content.'
                            : 'Analyze this existing deck. Use it as context for the presentation the user is building.',
            };
            console.log(`${TAG} OUTPUT: ${pptxData.slideCount} slides extracted from PPTX`);

        } else if (PDF_EXTENSIONS.has(ext)) {
            // ─ PDF ─
            console.log(`${TAG} Parsing PDF: ${fileName} (${sizeMB.toFixed(1)} MB)`);
            const pdfData = await parsePdf(resolved);

            // Truncate very large PDFs to avoid token explosion
            const maxChars = 80_000;
            const text = pdfData.text.length > maxChars
                ? pdfData.text.slice(0, maxChars) + `\n\n[... truncated at ${maxChars} chars — ${pdfData.pageCount} pages total ...]`
                : pdfData.text;

            result = {
                fileType: 'pdf',
                fileName,
                pageCount: pdfData.pageCount,
                text,
                _note: 'PDF content extracted. Use this as research material / reference for the presentation.',
            };
            console.log(`${TAG} OUTPUT: ${pdfData.pageCount} pages, ${pdfData.text.length} chars extracted from PDF`);

        } else if (TEXT_EXTENSIONS.has(ext)) {
            // ─ Plain text / markdown / etc. ─
            console.log(`${TAG} Reading text file: ${fileName} (${sizeMB.toFixed(1)} MB)`);
            let text = readTextFile(resolved);

            const maxChars = 80_000;
            if (text.length > maxChars) {
                text = text.slice(0, maxChars) + `\n\n[... truncated at ${maxChars} chars ...]`;
            }

            result = {
                fileType: ext.replace('.', ''),
                fileName,
                text,
                _note: 'Text file content. Use as research material / reference / inspiration for the presentation.',
            };
            console.log(`${TAG} OUTPUT: ${text.length} chars read from text file`);

        } else {
            const msg = `Unsupported file type: ${ext}. Supported: .pptx, .pdf, .txt, .md, .json, .csv, .xml, .yaml`;
            console.log(`${TAG} ERROR: ${msg}`);
            return JSON.stringify({ error: msg });
        }

        return JSON.stringify(result);
    },
    {
        name: 'parse_attached_file',
        description:
            'Parse an attached file to extract its content for use in building the presentation. ' +
            'Supports PowerPoint (.pptx), PDF (.pdf), and text files (.txt, .md, .json, .csv, .xml, .yaml). ' +
            'For .pptx files: extracts slide-by-slide text, structure, and notes — use to learn from an existing deck\'s ' +
            'design, tone, themes, jokes, and content. ' +
            'For .pdf and text files: extracts raw content as research material. ' +
            'Call this tool ONCE per attached file path provided by the user.',
        schema: z.object({
            filePath: z.string().describe('Absolute or relative path to the file to parse.'),
            intent: z
                .enum(['inspiration', 'merge', 'reference'])
                .optional()
                .describe(
                    'How the user wants this file used: ' +
                    '"inspiration" = adopt its design/tone/themes/jokes but create original content, ' +
                    '"merge" = incorporate its actual content into the new deck, ' +
                    '"reference" = use as background research. ' +
                    'Defaults to auto-detection from user context.'
                ),
        }),
    }
);
