import { tool } from 'langchain';
import { z } from 'zod';
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { tavilySearch } from '../../appliances/tools/tavily-client.util';

const TAG = `${color256(75)}[search_images]${LogColors.RESET}`;

/**
 * Image-search tool for professional visuals (photos, diagrams, charts).
 * Returns candidate image URLs; the generate_pptx tool downloads and embeds them.
 */
export const searchImages = tool(
    async ({ query, maxResults }) => {
        const n = maxResults ?? 5;
        console.log(`${TAG} INPUT: query='${query}', maxResults=${n}`);

        const { images, error } = await tavilySearch(query, {
            maxResults: n,
            searchDepth: 'basic',
            includeAnswer: false,
            includeImages: true,
        });

        if (error) {
            console.log(`${TAG} ERROR: ${error}`);
            return JSON.stringify({ error });
        }

        const urls = images ?? [];
        console.log(`${TAG} OUTPUT: ${urls.length} image URLs`);

        return JSON.stringify({
            query,
            images: urls,
            _note: 'Pick the single most relevant, professional image URL and set it as the slide\'s imageUrl. Prefer .png/.jpg URLs.',
        });
    },
    {
        name: 'search_images',
        description:
            'Search the web for professional images, photos, diagrams, or charts related to a query (via Tavily image search). ' +
            'Returns candidate image URLs to embed on slides. Use for work-appropriate visuals.',
        schema: z.object({
            query: z.string().describe('What the image should depict (e.g. "cloud architecture diagram", "team collaboration office photo").'),
            maxResults: z.number().optional().describe('How many image candidates to return. Defaults to 5.'),
        }),
    }
);
