import { tool } from 'langchain';
import { z } from 'zod';
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { tavilySearch } from './tavily-client.util';
import { accumulateResearch } from './research-accumulator.util';

const TAG = `${color256(160)}[get_appliance_details]${LogColors.RESET}`;

export const createGetApplianceDetailsTool = (outputDir: string) => tool(
    async ({ brand, model, category }) => {
        console.log(`${TAG} INPUT: brand='${brand}', model='${model}', category='${category ?? '-'}'`);

        const cat = category ? `${category} ` : '';
        const query = `${brand} ${model} ${cat}מפרט טכני תכונות דירוג אנרגטי אחריות מחיר בישראל ביקורות אמינות`;
        const { answer, results, error } = await tavilySearch(query, {
            maxResults: 6,
            searchDepth: 'advanced',
            includeAnswer: true,
        });

        if (error) {
            console.log(`${TAG} ERROR: ${error}`);
            return JSON.stringify({ error });
        }

        console.log(`${TAG} OUTPUT: ${results.length} results for ${brand} ${model}`);

        const { truncatedAnswer, truncatedResults } = accumulateResearch(
            outputDir, 'get_appliance_details',
            { brand, model, category },
            answer, results,
        );

        return JSON.stringify({ brand, model, category, answer: truncatedAnswer, results: truncatedResults,
            _note: `Full results (${results.length}) saved to research-data.json` });
    },
    {
        name: 'get_appliance_details',
        description:
            'Fetch detailed information for a SPECIFIC appliance model: technical specs, features, energy rating, warranty/service in Israel, reliability/reviews, and approximate price (ILS). Uses Tavily web search. Returns an answer plus source snippets.',
        schema: z.object({
            brand: z.string().describe('Brand name (e.g. \'Bosch\')'),
            model: z.string().describe('Model name/number (e.g. \'KGN39VLEB\')'),
            category: z.string().optional().describe('Appliance category in Hebrew, to refine the search (e.g. \'מקרר\')'),
        }),
    }
);
