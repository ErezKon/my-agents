import { tool } from 'langchain';
import { z } from 'zod';
import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(200)}[compare_appliances]${LogColors.RESET}`;

const ModelSchema = z.object({
    brand: z.string().describe('Brand name'),
    model: z.string().describe('Model name/number'),
    keyFeatures: z.array(z.string()).optional().describe('Key features in Hebrew'),
    reliability: z.string().optional().describe('Reliability/reputation assessment in Hebrew'),
    energyRating: z.string().optional().describe('Energy efficiency rating (e.g. A, A+)'),
    priceILS: z.number().optional().describe('Approximate price in ILS'),
    warranty: z.string().optional().describe('Warranty/service info in Hebrew'),
    heightCm: z.number().optional().describe('Height in cm'),
    widthCm: z.number().optional().describe('Width in cm'),
    depthCm: z.number().optional().describe('Depth in cm'),
    volumeLiters: z.number().optional().describe('Volume/capacity in liters (if applicable)'),
    pros: z.array(z.string()).optional().describe('Advantages / pros in Hebrew'),
    cons: z.array(z.string()).optional().describe('Disadvantages / cons in Hebrew'),
    fromGivenList: z.boolean().optional().describe('True if brand was in the user-provided list'),
    url: z.string().optional().describe('URL of the product page where info was found'),
});

export const compareAppliances = tool(
    ({ category, models }) => {
        console.log(`${TAG} INPUT: category='${category}', models=${models.length}`);

        const priced = models.filter(m => typeof m.priceILS === 'number') as { priceILS: number }[];
        const cheapest = priced.length ? Math.min(...priced.map(m => m.priceILS)) : null;
        const mostExpensive = priced.length ? Math.max(...priced.map(m => m.priceILS)) : null;

        const rows = models.map(m => ({
            brand: m.brand,
            model: m.model,
            keyFeatures: m.keyFeatures ?? [],
            reliability: m.reliability ?? 'לא זמין',
            energyRating: m.energyRating ?? 'לא זמין',
            priceILS: m.priceILS ?? null,
            warranty: m.warranty ?? 'לא זמין',
            heightCm: m.heightCm ?? null,
            widthCm: m.widthCm ?? null,
            depthCm: m.depthCm ?? null,
            volumeLiters: m.volumeLiters ?? null,
            pros: m.pros ?? [],
            cons: m.cons ?? [],
            fromGivenList: m.fromGivenList ?? false,
            url: m.url ?? null,
            isCheapest: cheapest != null && m.priceILS === cheapest,
        }));

        const result = {
            category,
            modelCount: models.length,
            priceRangeILS: cheapest != null ? { min: cheapest, max: mostExpensive } : null,
            rows,
        };

        console.log(`${TAG} OUTPUT: compared ${models.length} models for ${category}`);
        return JSON.stringify(result);
    },
    {
        name: 'compare_appliances',
        description:
            'Build a structured side-by-side comparison of appliance models within one category. Pass the collected model data (features, reliability, energy rating, price ILS, warranty). Returns a normalized comparison table with price range and a \'cheapest\' flag. Use the returned data to write the comparison file and summary.',
        schema: z.object({
            category: z.string().describe('Appliance category in Hebrew (e.g. \'מקרר\')'),
            models: z.array(ModelSchema).describe('The models to compare side-by-side'),
        }),
    }
);
