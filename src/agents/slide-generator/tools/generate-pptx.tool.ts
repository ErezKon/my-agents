import { tool } from 'langchain';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import PptxGenJS from 'pptxgenjs';
import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(220)}[generate_pptx]${LogColors.RESET}`;

// ─── Theme palettes ──────────────────────────────────────────────────────────

interface Theme {
    bg: string;
    accent: string;
    accentLight: string;
    title: string;
    body: string;
    titleFont: string;
    bodyFont: string;
}

const THEMES: Record<'professional' | 'fun', Theme> = {
    professional: {
        bg: 'FFFFFF',
        accent: '1F3864',
        accentLight: 'D9E1F2',
        title: '1F3864',
        body: '333333',
        titleFont: 'Calibri Light',
        bodyFont: 'Calibri',
    },
    fun: {
        bg: 'FFF9F0',
        accent: 'E8590C',
        accentLight: 'FFE8CC',
        title: 'D9480F',
        body: '2B2B2B',
        titleFont: 'Comic Sans MS',
        bodyFont: 'Trebuchet MS',
    },
};

// ─── Image download helper ──────────────────────────────────────────────────

const IMAGE_TYPES: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
};

let imageCounter = 0;

/** Download an image URL to the output dir. Returns a local path or null. */
async function downloadImage(url: string, outputDir: string): Promise<string | null> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SlideBot/1.0)' },
            signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) return null;

        const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const ext = IMAGE_TYPES[ct];
        if (!ext) return null;

        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        if (buffer.length < 1_500) return null; // skip tiny/broken images

        const imagesDir = path.join(outputDir, 'images');
        fs.mkdirSync(imagesDir, { recursive: true });
        const localPath = path.join(imagesDir, `slide-img-${++imageCounter}${ext}`);
        fs.writeFileSync(localPath, buffer);
        console.log(`${TAG} downloaded image → ${path.basename(localPath)} (${(buffer.length / 1024).toFixed(0)} KB)`);
        return localPath;
    } catch (err: any) {
        console.log(`${TAG} image download failed for ${url}: ${err.message}`);
        return null;
    }
}

// ─── Tool schema ──────────────────────────────────────────────────────────────

const BulletInput = z.object({
    text: z.string(),
    indent: z.number().optional(),
});

const SlideInput = z.object({
    layout: z.enum(['title', 'section', 'bullets', 'image', 'bullets-image', 'quote', 'code', 'closing']),
    title: z.string(),
    subtitle: z.string().optional(),
    bullets: z.array(BulletInput).optional(),
    code: z.string().optional(),
    codeLanguage: z.string().optional(),
    quote: z.string().optional(),
    imageUrl: z.string().optional(),
    speakerNotes: z.string().optional(),
});

// ─── Rendering helpers ─────────────────────────────────────────────────────────

const W = 13.333; // 16:9 inches
const H = 7.5;

function addFooter(slide: PptxGenJS.Slide, theme: Theme, deckTitle: string) {
    slide.addShape('rect', { x: 0, y: H - 0.35, w: W, h: 0.35, fill: { color: theme.accentLight }, line: { color: theme.accentLight } });
    slide.addText(deckTitle, { x: 0.4, y: H - 0.38, w: W - 0.8, h: 0.3, fontFace: theme.bodyFont, fontSize: 9, color: theme.accent, align: 'left', valign: 'middle' });
}

function bulletTextObjects(bullets: { text: string; indent?: number }[], theme: Theme) {
    return bullets.map((b) => ({
        text: b.text,
        options: {
            bullet: { indent: 15 },
            indentLevel: b.indent ?? 0,
            fontFace: theme.bodyFont,
            fontSize: (b.indent ?? 0) > 0 ? 16 : 20,
            color: theme.body,
            paraSpaceAfter: 8,
        },
    }));
}

// ─── Tool ──────────────────────────────────────────────────────────────────────

export const createGeneratePptxTool = (outputDir: string) => tool(
    async ({ deckTitle, style, slides, sources }) => {
        console.log(`${TAG} INPUT: deckTitle='${deckTitle}', style='${style}', slides=${slides.length}`);

        const theme = THEMES[style ?? 'professional'];
        const pptx = new PptxGenJS();
        pptx.defineLayout({ name: 'WIDE', width: W, height: H });
        pptx.layout = 'WIDE';
        pptx.author = 'Slide Generator Agent';
        pptx.title = deckTitle;

        for (const s of slides) {
            const slide = pptx.addSlide();
            slide.background = { color: theme.bg };

            // Resolve image if provided
            let localImage: string | null = null;
            if (s.imageUrl) {
                localImage = await downloadImage(s.imageUrl, outputDir);
            }

            switch (s.layout) {
                case 'title': {
                    slide.addShape('rect', { x: 0, y: H / 2 - 0.03, w: W, h: 0.06, fill: { color: theme.accent }, line: { color: theme.accent } });
                    slide.addText(s.title, { x: 0.8, y: 1.8, w: W - 1.6, h: 2, fontFace: theme.titleFont, fontSize: 44, bold: true, color: theme.title, align: 'center', valign: 'bottom' });
                    if (s.subtitle) {
                        slide.addText(s.subtitle, { x: 0.8, y: 3.9, w: W - 1.6, h: 1.2, fontFace: theme.bodyFont, fontSize: 22, color: theme.body, align: 'center', valign: 'top' });
                    }
                    break;
                }
                case 'section': {
                    slide.background = { color: theme.accent };
                    slide.addText(s.title, { x: 0.8, y: 2.8, w: W - 1.6, h: 1.6, fontFace: theme.titleFont, fontSize: 40, bold: true, color: 'FFFFFF', align: 'left', valign: 'middle' });
                    if (s.subtitle) {
                        slide.addText(s.subtitle, { x: 0.8, y: 4.3, w: W - 1.6, h: 1, fontFace: theme.bodyFont, fontSize: 20, color: theme.accentLight, align: 'left' });
                    }
                    break;
                }
                case 'quote': {
                    slide.addText(`\u201C${s.quote ?? s.title}\u201D`, { x: 1, y: 1.5, w: W - 2, h: localImage ? 2.5 : 4.5, fontFace: theme.titleFont, fontSize: 30, italic: true, bold: true, color: theme.title, align: 'center', valign: 'middle' });
                    if (localImage) {
                        slide.addImage({ path: localImage, x: W / 2 - 2.5, y: 4.1, w: 5, h: 2.8, sizing: { type: 'contain', w: 5, h: 2.8 } });
                    }
                    addFooter(slide, theme, deckTitle);
                    break;
                }
                case 'code': {
                    slide.addText(s.title, { x: 0.6, y: 0.4, w: W - 1.2, h: 0.9, fontFace: theme.titleFont, fontSize: 28, bold: true, color: theme.title });
                    slide.addShape('rect', { x: 0.6, y: 1.4, w: W - 1.2, h: 5.4, fill: { color: '1E1E1E' }, line: { color: '1E1E1E' } });
                    slide.addText(s.code ?? '', { x: 0.8, y: 1.55, w: W - 1.6, h: 5.1, fontFace: 'Consolas', fontSize: 13, color: 'D4D4D4', align: 'left', valign: 'top' });
                    addFooter(slide, theme, deckTitle);
                    break;
                }
                case 'image': {
                    slide.addText(s.title, { x: 0.6, y: 0.4, w: W - 1.2, h: 0.9, fontFace: theme.titleFont, fontSize: 28, bold: true, color: theme.title });
                    if (localImage) {
                        slide.addImage({ path: localImage, x: 1, y: 1.5, w: W - 2, h: 5.2, sizing: { type: 'contain', w: W - 2, h: 5.2 } });
                    } else if (s.bullets?.length) {
                        slide.addText(bulletTextObjects(s.bullets, theme), { x: 0.8, y: 1.6, w: W - 1.6, h: 5 });
                    }
                    addFooter(slide, theme, deckTitle);
                    break;
                }
                case 'bullets-image': {
                    slide.addText(s.title, { x: 0.6, y: 0.4, w: W - 1.2, h: 0.9, fontFace: theme.titleFont, fontSize: 28, bold: true, color: theme.title });
                    const hasImg = !!localImage;
                    const bulletsW = hasImg ? (W - 1.2) * 0.55 : W - 1.2;
                    if (s.bullets?.length) {
                        slide.addText(bulletTextObjects(s.bullets, theme), { x: 0.6, y: 1.6, w: bulletsW, h: 5 });
                    }
                    if (hasImg) {
                        slide.addImage({ path: localImage!, x: 0.6 + bulletsW + 0.3, y: 1.6, w: (W - 1.2) - bulletsW - 0.3, h: 5, sizing: { type: 'contain', w: (W - 1.2) - bulletsW - 0.3, h: 5 } });
                    }
                    addFooter(slide, theme, deckTitle);
                    break;
                }
                case 'closing': {
                    slide.background = { color: theme.accent };
                    slide.addText(s.title, { x: 0.8, y: 1.6, w: W - 1.6, h: 1.4, fontFace: theme.titleFont, fontSize: 38, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
                    if (s.subtitle) {
                        slide.addText(s.subtitle, { x: 0.8, y: 3, w: W - 1.6, h: 0.8, fontFace: theme.bodyFont, fontSize: 20, color: theme.accentLight, align: 'center' });
                    }
                    if (sources?.length) {
                        const srcLines = sources.slice(0, 10).map((src) => ({
                            text: `${src.title} — ${src.url}`,
                            options: { bullet: true, fontFace: theme.bodyFont, fontSize: 11, color: theme.accentLight, paraSpaceAfter: 4 },
                        }));
                        slide.addText([{ text: 'Sources', options: { fontFace: theme.bodyFont, fontSize: 14, bold: true, color: 'FFFFFF', paraSpaceAfter: 6 } }, ...srcLines], { x: 0.8, y: 3.9, w: W - 1.6, h: 3 });
                    }
                    break;
                }
                case 'bullets':
                default: {
                    slide.addShape('rect', { x: 0.6, y: 1.25, w: 1.2, h: 0.06, fill: { color: theme.accent }, line: { color: theme.accent } });
                    slide.addText(s.title, { x: 0.6, y: 0.4, w: W - 1.2, h: 0.9, fontFace: theme.titleFont, fontSize: 28, bold: true, color: theme.title });
                    if (s.bullets?.length) {
                        slide.addText(bulletTextObjects(s.bullets, theme), { x: 0.8, y: 1.6, w: W - 1.6, h: 5.2 });
                    }
                    addFooter(slide, theme, deckTitle);
                    break;
                }
            }

            if (s.speakerNotes) slide.addNotes(s.speakerNotes);
        }

        const safe = deckTitle.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'presentation';
        const fileName = `${safe}.pptx`;
        const filePath = path.join(outputDir, fileName);
        await pptx.writeFile({ fileName: filePath });

        console.log(`${TAG} OUTPUT: wrote ${slides.length} slides → ${filePath}`);
        return JSON.stringify({ pptxPath: filePath, slideCount: slides.length, fileName });
    },
    {
        name: 'generate_pptx',
        description:
            'Generate the final PowerPoint (.pptx) file from a fully-specified deck. Call this ONCE, only after research is complete and (if needed) the user has answered clarifying questions. ' +
            'Provide every slide in order. Images are downloaded and embedded automatically from the imageUrl fields. Returns the path to the saved .pptx.',
        schema: z.object({
            deckTitle: z.string().describe('The presentation title (used for the filename and footer).'),
            style: z.enum(['professional', 'fun']).optional().describe('Visual style. Defaults to "professional". Use "fun" only if the user asked for a light/funny deck.'),
            slides: z.array(SlideInput).describe('The ordered list of slides to render.'),
            sources: z.array(z.object({ title: z.string(), url: z.string() })).optional().describe('Sources to list on the closing slide.'),
        }),
    }
);
