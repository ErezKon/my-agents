import { z } from 'zod';

/**
 * A single bullet point on a slide. Bullets may be nested one level via `indent`.
 */
const BulletSchema = z.object({
    text: z.string().describe('The bullet text (concise — a slide is not a document)'),
    indent: z.number().optional().describe('Indent level for sub-bullets (0 = top level, 1 = nested). Defaults to 0.'),
});

/**
 * One slide in the deck.
 */
const SlideSchema = z.object({
    layout: z
        .enum(['title', 'section', 'bullets', 'image', 'bullets-image', 'quote', 'code', 'closing'])
        .describe(
            'Slide layout. "title" = opening title slide, "section" = section divider, "bullets" = title + bullet list, ' +
            '"image" = title + full image, "bullets-image" = bullets on the left with an image on the right, ' +
            '"quote" = a large centered quote/meme caption, "code" = title + a monospaced code block, "closing" = thank-you / sources slide.'
        ),
    title: z.string().describe('Slide title / heading'),
    subtitle: z.string().optional().describe('Optional subtitle (mainly for title and section slides)'),
    bullets: z.array(BulletSchema).optional().describe('Bullet points for bullet-based layouts'),
    code: z.string().optional().describe('A code snippet to render in a monospaced block (for the "code" layout)'),
    codeLanguage: z.string().optional().describe('Language of the code snippet (for labeling)'),
    quote: z.string().optional().describe('A quote or punchy caption (for the "quote" layout)'),
    imageUrl: z.string().optional().describe('Direct URL of an image/gif/meme to embed. Use a URL returned by the search_images or search_memes tools.'),
    imageQuery: z.string().optional().describe('If no imageUrl is known yet, the search query that should be used to fetch an image for this slide.'),
    speakerNotes: z.string().optional().describe('Presenter/speaker notes shown in the notes pane of the slide'),
});

export const SlideDeckSchema = z.object({
    answer: z
        .string()
        .describe('A short natural-language message to the caller: what was produced, or (if clarification is needed) the questions being asked.'),

    needsClarification: z
        .boolean()
        .describe('True if the agent needs the user to answer clarifying questions BEFORE a good deck can be built. When true, do NOT call generate_pptx yet.'),

    clarifyingQuestions: z
        .array(z.string())
        .optional()
        .describe('Questions to ask the user to improve the deck (audience, length, tone, focus areas, etc.). Populate when helpful.'),

    suggestedAdditions: z
        .array(z.string())
        .optional()
        .describe('Improvements/extra topics the agent discovered during research that the user did NOT ask for. Offer these so the user can approve including them.'),

    deckTitle: z.string().optional().describe('The overall presentation title'),

    style: z
        .enum(['professional', 'fun'])
        .optional()
        .describe('Overall style of the deck. "professional" (default) = clean, work-appropriate. "fun" = light tone with gifs/memes, only when the user asks for it.'),

    slides: z.array(SlideSchema).optional().describe('The ordered list of slides in the deck'),

    codeInsights: z
        .array(
            z.object({
                topic: z.string().describe('What the insight is about (e.g. architecture, key module, dependency)'),
                detail: z.string().describe('The insight derived from analyzing the provided code base'),
            })
        )
        .optional()
        .describe('Insights extracted from an analyzed code base/repo, if one was provided'),

    sources: z
        .array(
            z.object({
                title: z.string().describe('Source title or site name'),
                url: z.string().describe('Source URL'),
            })
        )
        .optional()
        .describe('Web sources used during research (cited on the closing slide)'),
});
