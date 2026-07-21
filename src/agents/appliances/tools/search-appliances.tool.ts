import { tool } from 'langchain';
import { z } from 'zod';
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { tavilySearch } from './tavily-client.util';
import { accumulateResearch } from './research-accumulator.util';

const TAG = `${color256(129)}[search_appliances]${LogColors.RESET}`;

export const createSearchAppliancesTool = (outputDir: string) => tool(
    async ({ brand, category, count, requirements }) => {
        const n = count ?? 5;
        console.log(`${TAG} INPUT: brand='${brand}', category='${category}', count=${n}, requirements='${requirements ?? '-'}'`);

        const reqPart = requirements ? ` ${requirements}` : '';
        const query = `דגמים מובילים ${count ?? 5} של ${brand} ${category}${reqPart} בישראל 2025 מפרט ומחיר`;
        const { answer, results, error } = await tavilySearch(query, {
            maxResults: Math.max(n * 2, 6),
            searchDepth: 'advanced',
            includeAnswer: true,
        });

        if (error) {
            console.log(`${TAG} ERROR: ${error}`);
            return JSON.stringify({ error });
        }

        console.log(`${TAG} OUTPUT: ${results.length} results`);

        const { truncatedAnswer, truncatedResults } = accumulateResearch(
            outputDir, 'search_appliances',
            { brand, category, count: n, requirements },
            answer, results,
        );

        return JSON.stringify({ brand, category, answer: truncatedAnswer, results: truncatedResults,
            _note: `Full results (${results.length}) saved to research-data.json` });
    },
    {
        name: 'search_appliances',
        description:
            'Search the web (Tavily) for the leading appliance models of a specific BRAND in a specific CATEGORY available in Israel. Returns a short answer plus source snippets. IMPORTANT: extract ALL distinct model names/numbers from the results (aim for 4-5 per brand). Do NOT settle for 1-2 models — go through every result to find as many different models as possible.',
        schema: z.object({
            brand: z.string().describe('The appliance brand to search for (e.g. \'Bosch\', \'Samsung\', \'Tadiran\')'),
            category: z.string().describe('The appliance category in Hebrew (e.g. \'מקרר\', \'תנור\', \'מיקרוגל\')'),
            count: z.number().optional().describe('How many leading models to look for. Defaults to 5.'),
            requirements: z.string().optional().describe('User-specified constraints to include in the search query (e.g. \'רוחב 90 ס\"מ\', \'נפח 500 ליטר\', \'דלת צרפתית\'). Pass the user\'s physical / technical requirements verbatim so the search returns only relevant models.'),
        }),
    }
);
