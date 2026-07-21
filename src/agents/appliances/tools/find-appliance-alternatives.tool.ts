import { tool } from 'langchain';
import { z } from 'zod';
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { tavilySearch } from './tavily-client.util';
import { accumulateResearch } from './research-accumulator.util';

const TAG = `${color256(33)}[find_appliance_alternatives]${LogColors.RESET}`;

export const createFindApplianceAlternativesTool = (outputDir: string) => tool(
    async ({ category, referenceModel, excludeBrands, count, requirements }) => {
        const n = count ?? 5;
        const exclude = excludeBrands ?? [];
        console.log(`${TAG} INPUT: category='${category}', reference='${referenceModel ?? '-'}', exclude=[${exclude.join(', ')}], count=${n}, requirements='${requirements ?? '-'}'`);

        const refPart = referenceModel ? `דומה ל-${referenceModel} ` : '';
        const excludePart = exclude.length ? `לא ממותגים: ${exclude.join(', ')}. ` : '';
        const reqPart = requirements ? ` ${requirements}` : '';
        const query = `חלופות ${category}${reqPart} ${refPart}ממותגים אחרים בישראל 2025 מפרט ומחיר. ${excludePart}דגמים מובילים מתחרים`;

        const { answer, results, error } = await tavilySearch(query, {
            maxResults: Math.max(n * 2, 8),
            searchDepth: 'advanced',
            includeAnswer: true,
        });

        if (error) {
            console.log(`${TAG} ERROR: ${error}`);
            return JSON.stringify({ error });
        }

        console.log(`${TAG} OUTPUT: ${results.length} results`);

        const { truncatedAnswer, truncatedResults } = accumulateResearch(
            outputDir, 'find_appliance_alternatives',
            { category, referenceModel, excludeBrands: exclude, count: n, requirements },
            answer, results,
        );

        return JSON.stringify({
            category,
            referenceModel,
            excludedBrands: exclude,
            note: 'Verify that returned models are NOT from the excluded brands before including them.',
            answer: truncatedAnswer,
            results: truncatedResults,
            _note: `Full results (${results.length}) saved to research-data.json`,
        });
    },
    {
        name: 'find_appliance_alternatives',
        description:
            'Find similar-class alternative appliance models from OTHER brands (not in the user-provided list) in the same category. Pass the user\'s brand list in excludeBrands so the search focuses on competing brands. Uses Tavily web search.',
        schema: z.object({
            category: z.string().describe('Appliance category in Hebrew (e.g. \'מקרר\')'),
            referenceModel: z.string().optional().describe('A reference model to find alternatives similar to (e.g. \'Bosch KGN39VLEB\')'),
            excludeBrands: z.array(z.string()).optional().describe('Brands to EXCLUDE — the user-provided brand list (e.g. [\'Bosch\', \'Samsung\'])'),
            count: z.number().optional().describe('How many alternatives to look for. Defaults to 5.'),
            requirements: z.string().optional().describe('User-specified constraints to include in the search query (e.g. \'רוחב 90 ס\"מ\', \'נפח 500 ליטר\', \'דלת צרפתית\'). Pass the user\'s physical / technical requirements verbatim so the search returns only relevant models.'),
        }),
    }
);
