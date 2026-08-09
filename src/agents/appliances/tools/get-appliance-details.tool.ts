import { tool } from 'langchain';
import { z } from 'zod';
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { tavilySearch } from './tavily-client.util';
import { accumulateResearch } from './research-accumulator.util';
import { extractDimensions, ExtractedDimensions } from './extract-dimensions.util';

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

        // --- Dimension extraction from search snippets ---
        const snippets = [
            answer ?? '',
            ...results.map(r => r.content),
            ...results.map(r => r.title),
        ].filter(Boolean);

        const extractedDimensions: ExtractedDimensions = extractDimensions(snippets);

        if (extractedDimensions.widthCm !== null || extractedDimensions.heightCm !== null || extractedDimensions.depthCm !== null) {
            console.log(`${TAG} DIMENSIONS: width=${extractedDimensions.widthCm}, height=${extractedDimensions.heightCm}, depth=${extractedDimensions.depthCm} (source: "${extractedDimensions.source}")`);
        } else {
            console.log(`${TAG} DIMENSIONS: none extracted from snippets`);
        }

        // If we didn't find dimensions, try a targeted spec search
        let specDimensions: ExtractedDimensions | null = null;
        if (extractedDimensions.widthCm === null) {
            const specQuery = `${brand} ${model} specifications dimensions width height depth cm`;
            const specResult = await tavilySearch(specQuery, {
                maxResults: 4,
                searchDepth: 'advanced',
                includeAnswer: true,
            });
            if (!specResult.error && specResult.results.length > 0) {
                const specSnippets = [
                    specResult.answer ?? '',
                    ...specResult.results.map(r => r.content),
                ].filter(Boolean);
                specDimensions = extractDimensions(specSnippets);
                if (specDimensions.widthCm !== null || specDimensions.heightCm !== null) {
                    console.log(`${TAG} SPEC DIMENSIONS: width=${specDimensions.widthCm}, height=${specDimensions.heightCm}, depth=${specDimensions.depthCm} (source: "${specDimensions.source}")`);
                    // Merge: prefer spec dimensions for any null fields
                    if (extractedDimensions.widthCm === null && specDimensions.widthCm !== null) extractedDimensions.widthCm = specDimensions.widthCm;
                    if (extractedDimensions.heightCm === null && specDimensions.heightCm !== null) extractedDimensions.heightCm = specDimensions.heightCm;
                    if (extractedDimensions.depthCm === null && specDimensions.depthCm !== null) extractedDimensions.depthCm = specDimensions.depthCm;
                    if (extractedDimensions.volumeLiters === null && specDimensions.volumeLiters !== null) extractedDimensions.volumeLiters = specDimensions.volumeLiters;
                }
            }
        }

        const { truncatedAnswer, truncatedResults } = accumulateResearch(
            outputDir, 'get_appliance_details',
            { brand, model, category },
            answer, results,
        );

        return JSON.stringify({
            brand, model, category,
            answer: truncatedAnswer,
            results: truncatedResults,
            extractedDimensions,
            _note: `Full results (${results.length}) saved to research-data.json. Use extractedDimensions to verify model meets size requirements.`,
        });
    },
    {
        name: 'get_appliance_details',
        description:
            'Fetch detailed information for a SPECIFIC appliance model: technical specs, features, energy rating, warranty/service in Israel, reliability/reviews, and approximate price (ILS). Uses Tavily web search. Returns an answer, source snippets, AND extractedDimensions with widthCm/heightCm/depthCm/volumeLiters parsed from the results. IMPORTANT: check extractedDimensions to verify the model meets size requirements before including it in the comparison.',
        schema: z.object({
            brand: z.string().describe('Brand name (e.g. \'Bosch\')'),
            model: z.string().describe('Model name/number (e.g. \'KGN39VLEB\')'),
            category: z.string().optional().describe('Appliance category in Hebrew, to refine the search (e.g. \'מקרר\')'),
        }),
    }
);
