import { tool } from 'langchain';
import { z } from 'zod';
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { tavilySearch } from '../../appliances/tools/tavily-client.util';
import { giphySearch } from './giphy-client.util';

const TAG = `${color256(207)}[search_memes]${LogColors.RESET}`;

/**
 * Meme/gif search tool — ONLY used when the user explicitly asks for a funny /
 * light-hearted deck. Searches BOTH Tavily (web images) and Giphy (animated gifs)
 * and returns merged candidate URLs to embed.
 */
export const searchMemes = tool(
    async ({ topic, maxResults, source }) => {
        const n = maxResults ?? 6;
        const useSource = source ?? 'both';
        console.log(`${TAG} INPUT: topic='${topic}', maxResults=${n}, source='${useSource}'`);

        interface ImageCandidate {
            url: string;
            /** A still-frame URL (for pptx embedding where animated gifs are static). */
            stillUrl?: string;
            title?: string;
            source: 'tavily' | 'giphy';
        }

        const candidates: ImageCandidate[] = [];

        // --- Tavily ---
        if (useSource === 'both' || useSource === 'tavily') {
            const query = `${topic} funny meme OR gif`;
            const { images, error } = await tavilySearch(query, {
                maxResults: n,
                searchDepth: 'basic',
                includeAnswer: false,
                includeImages: true,
            });
            if (error) {
                console.log(`${TAG} Tavily error: ${error}`);
            } else {
                for (const url of images ?? []) {
                    candidates.push({ url, source: 'tavily' });
                }
                console.log(`${TAG} Tavily returned ${images?.length ?? 0} images`);
            }
        }

        // --- Giphy ---
        if (useSource === 'both' || useSource === 'giphy') {
            const { results, error } = await giphySearch(topic, { limit: n, rating: 'pg' });
            if (error) {
                console.log(`${TAG} Giphy error: ${error}`);
            } else {
                for (const gif of results) {
                    candidates.push({
                        url: gif.gifUrl,
                        stillUrl: gif.stillUrl,
                        title: gif.title,
                        source: 'giphy',
                    });
                }
                console.log(`${TAG} Giphy returned ${results.length} gifs`);
            }
        }

        console.log(`${TAG} OUTPUT: ${candidates.length} total candidates`);

        return JSON.stringify({
            topic,
            candidates,
            _note:
                'Only use these when the user asked for a FUN deck. Pick a tasteful, on-topic image and set it as the slide\'s imageUrl. ' +
                'For PowerPoint (.pptx): prefer the stillUrl (static frame) from Giphy results, since animated gifs embed as a single frame. ' +
                'For reveal.js (HTML): the animated gifUrl works great and will animate in the browser.',
        });
    },
    {
        name: 'search_memes',
        description:
            'Search for on-topic memes and gifs using BOTH Tavily (web image search) and Giphy (animated gifs). ' +
            'Use ONLY when the user explicitly requested a funny / light / humorous deck. ' +
            'Returns candidate image URLs from both sources to embed on slides. ' +
            'Giphy results include a stillUrl (static frame) which is better for PowerPoint embedding.',
        schema: z.object({
            topic: z.string().describe('The subject the meme should relate to (e.g. "monday morning meetings", "javascript bugs").'),
            maxResults: z.number().optional().describe('How many results to fetch from EACH source. Defaults to 6.'),
            source: z
                .enum(['both', 'tavily', 'giphy'])
                .optional()
                .describe('Which source(s) to query. Defaults to "both". Use "giphy" for animated gifs, "tavily" for static meme images.'),
        }),
    }
);
