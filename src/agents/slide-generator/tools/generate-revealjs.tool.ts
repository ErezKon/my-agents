import { tool } from 'langchain';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(46)}[generate_revealjs]${LogColors.RESET}`;

// ─── Themes ──────────────────────────────────────────────────────────────────

interface RevealTheme {
    revealTheme: string;       // reveal.js built-in theme name
    customCss: string;         // extra CSS injected into <style>
}

const THEMES: Record<'professional' | 'fun', RevealTheme> = {
    professional: {
        revealTheme: 'white',
        customCss: `
            :root { --r-heading-color: #1F3864; --r-main-color: #333; --r-link-color: #1F3864; }
            .reveal h1, .reveal h2, .reveal h3 { font-family: 'Calibri', 'Segoe UI', sans-serif; font-weight: 700; }
            .reveal { font-family: 'Calibri', 'Segoe UI', sans-serif; }
            .reveal .slide-footer { position: fixed; bottom: 12px; left: 24px; font-size: 0.55em; color: #999; }
            .reveal pre code { font-size: 0.85em; line-height: 1.4; }
            .reveal blockquote { border-left: 4px solid #1F3864; padding: 0.4em 1em; font-style: italic; }
        `,
    },
    fun: {
        revealTheme: 'moon',
        customCss: `
            :root { --r-heading-color: #E8590C; --r-main-color: #2B2B2B; --r-link-color: #D9480F; }
            .reveal h1, .reveal h2, .reveal h3 { font-family: 'Comic Sans MS', 'Trebuchet MS', cursive; }
            .reveal { font-family: 'Trebuchet MS', 'Comic Sans MS', sans-serif; background: #FFF9F0; }
            .reveal .slide-footer { position: fixed; bottom: 12px; left: 24px; font-size: 0.55em; color: #aaa; }
            .reveal pre code { font-size: 0.85em; line-height: 1.4; }
            .reveal blockquote { border-left: 4px solid #E8590C; padding: 0.4em 1em; font-style: italic; }
        `,
    },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function bulletsToHtml(bullets: { text: string; indent?: number }[]): string {
    const lines: string[] = [];
    let inNested = false;
    for (const b of bullets) {
        if ((b.indent ?? 0) > 0) {
            if (!inNested) { lines.push('<ul>'); inNested = true; }
            lines.push(`  <li>${esc(b.text)}</li>`);
        } else {
            if (inNested) { lines.push('</ul>'); inNested = false; }
            lines.push(`<li>${esc(b.text)}</li>`);
        }
    }
    if (inNested) lines.push('</ul>');
    return `<ul>${lines.join('\n')}</ul>`;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const BulletInput = z.object({ text: z.string(), indent: z.number().optional() });

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

// ─── Slide → HTML section ────────────────────────────────────────────────────

function slideToSection(s: z.infer<typeof SlideInput>, sources?: { title: string; url: string }[]): string {
    const notes = s.speakerNotes
        ? `<aside class="notes">${esc(s.speakerNotes)}</aside>`
        : '';

    switch (s.layout) {
        case 'title':
            return `<section data-transition="zoom">
  <h1>${esc(s.title)}</h1>
  ${s.subtitle ? `<h3>${esc(s.subtitle)}</h3>` : ''}
  ${notes}
</section>`;

        case 'section':
            return `<section data-background-color="#1F3864" data-transition="slide">
  <h2 style="color:#fff">${esc(s.title)}</h2>
  ${s.subtitle ? `<p style="color:#D9E1F2">${esc(s.subtitle)}</p>` : ''}
  ${notes}
</section>`;

        case 'quote':
            return `<section>
  <blockquote>&ldquo;${esc(s.quote ?? s.title)}&rdquo;</blockquote>
  ${s.imageUrl ? `<img src="${esc(s.imageUrl)}" style="max-height:45vh;margin-top:0.5em" />` : ''}
  ${notes}
</section>`;

        case 'code':
            return `<section>
  <h2>${esc(s.title)}</h2>
  <pre><code class="language-${esc(s.codeLanguage ?? '')}" data-trim data-noescape>${esc(s.code ?? '')}</code></pre>
  ${notes}
</section>`;

        case 'image':
            return `<section>
  <h2>${esc(s.title)}</h2>
  ${s.imageUrl ? `<img src="${esc(s.imageUrl)}" style="max-height:65vh" />` : ''}
  ${s.bullets?.length ? bulletsToHtml(s.bullets) : ''}
  ${notes}
</section>`;

        case 'bullets-image': {
            const hasImg = !!s.imageUrl;
            return `<section>
  <h2>${esc(s.title)}</h2>
  <div style="display:flex;align-items:flex-start;gap:2em">
    <div style="flex:1">${s.bullets?.length ? bulletsToHtml(s.bullets) : ''}</div>
    ${hasImg ? `<div style="flex:1"><img src="${esc(s.imageUrl!)}" style="max-height:55vh" /></div>` : ''}
  </div>
  ${notes}
</section>`;
        }

        case 'closing': {
            let srcHtml = '';
            if (sources?.length) {
                const items = sources.slice(0, 10).map(
                    src => `<li><a href="${esc(src.url)}" target="_blank">${esc(src.title || src.url)}</a></li>`
                ).join('\n');
                srcHtml = `<div style="text-align:left;font-size:0.55em;margin-top:1em"><p><strong>Sources</strong></p><ul>${items}</ul></div>`;
            }
            return `<section data-background-color="#1F3864">
  <h2 style="color:#fff">${esc(s.title)}</h2>
  ${s.subtitle ? `<p style="color:#D9E1F2">${esc(s.subtitle)}</p>` : ''}
  ${srcHtml}
  ${notes}
</section>`;
        }

        case 'bullets':
        default:
            return `<section>
  <h2>${esc(s.title)}</h2>
  ${s.bullets?.length ? bulletsToHtml(s.bullets) : ''}
  ${notes}
</section>`;
    }
}

// ─── Full HTML document ──────────────────────────────────────────────────────

function buildHtml(
    deckTitle: string,
    style: 'professional' | 'fun',
    slides: z.infer<typeof SlideInput>[],
    sources?: { title: string; url: string }[],
): string {
    const theme = THEMES[style];
    const sections = slides.map(s => slideToSection(s, sources)).join('\n\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(deckTitle)}</title>
  <link rel="stylesheet" href="https://unpkg.com/reveal.js@5/dist/reveal.css" />
  <link rel="stylesheet" href="https://unpkg.com/reveal.js@5/dist/theme/${theme.revealTheme}.css" />
  <link rel="stylesheet" href="https://unpkg.com/reveal.js@5/plugin/highlight/monokai.css" />
  <style>${theme.customCss}
    .reveal img { max-width: 90%; border: none; box-shadow: none; }
  </style>
</head>
<body>
  <div class="reveal">
    <div class="slides">
${sections}
    </div>
    <div class="slide-footer">${esc(deckTitle)}</div>
  </div>

  <script src="https://unpkg.com/reveal.js@5/dist/reveal.js"><\/script>
  <script src="https://unpkg.com/reveal.js@5/plugin/notes/notes.js"><\/script>
  <script src="https://unpkg.com/reveal.js@5/plugin/highlight/highlight.js"><\/script>
  <script>
    Reveal.initialize({
      hash: true,
      slideNumber: true,
      transition: 'slide',
      plugins: [RevealNotes, RevealHighlight],
    });
  <\/script>
</body>
</html>`;
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export const createGenerateRevealJsTool = (outputDir: string) => tool(
    async ({ deckTitle, style, slides, sources }) => {
        console.log(`${TAG} INPUT: deckTitle='${deckTitle}', style='${style}', slides=${slides.length}`);

        const html = buildHtml(deckTitle, style ?? 'professional', slides, sources);

        const safe = deckTitle.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'presentation';
        const fileName = `${safe}.html`;
        const filePath = path.join(outputDir, fileName);
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(filePath, html, 'utf-8');

        console.log(`${TAG} OUTPUT: wrote ${slides.length} slides → ${filePath} (${(html.length / 1024).toFixed(0)} KB)`);
        return JSON.stringify({ htmlPath: filePath, slideCount: slides.length, fileName });
    },
    {
        name: 'generate_revealjs',
        description:
            'Generate the final presentation as a self-contained HTML file using reveal.js. The HTML loads reveal.js from CDN and can be opened directly in any browser. ' +
            'Call this ONCE (instead of generate_pptx) when the user asks for an HTML/web/reveal.js presentation. ' +
            'Animated gifs work natively in this format. Provide every slide in order. Returns the path to the saved .html file.',
        schema: z.object({
            deckTitle: z.string().describe('The presentation title.'),
            style: z.enum(['professional', 'fun']).optional().describe('Visual style. Defaults to "professional".'),
            slides: z.array(SlideInput).describe('The ordered list of slides to render.'),
            sources: z.array(z.object({ title: z.string(), url: z.string() })).optional().describe('Sources to list on the closing slide.'),
        }),
    }
);
