import { tool } from 'langchain';
import { z } from 'zod';
import { LogColors, color256 } from '../../../utils/log-colors.util';
import {parseDimensionRange} from './extract-dimensions.util';

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
    ({ category, models, requirements }) => {
        console.log(`${TAG} INPUT: category='${category}', models=${models.length}, requirements='${requirements ?? '-'}'`);

        // --- Programmatic dimension filtering ---
        const widthRange = parseDimensionRange(requirements, 'width');
        const heightRange = parseDimensionRange(requirements, 'height');
        const depthRange = parseDimensionRange(requirements, 'depth');

        const rejected: { brand: string; model: string; reason: string }[] = [];
        let filtered = models;

        if (widthRange) {
            console.log(`${TAG} FILTER: width range ${widthRange.min}-${widthRange.max} cm`);
            filtered = filtered.filter(m => {
                if (m.widthCm == null) {
                    rejected.push({ brand: m.brand, model: m.model, reason: `רוחב לא ידוע (null) — דרישה: ${widthRange.min}-${widthRange.max} ס"מ` });
                    return false;
                }
                if (m.widthCm < widthRange.min || m.widthCm > widthRange.max) {
                    rejected.push({ brand: m.brand, model: m.model, reason: `רוחב ${m.widthCm} ס"מ — מחוץ לטווח ${widthRange.min}-${widthRange.max} ס"מ` });
                    return false;
                }
                return true;
            });
        }

        if (heightRange) {
            console.log(`${TAG} FILTER: height range ${heightRange.min}-${heightRange.max} cm`);
            filtered = filtered.filter(m => {
                if (m.heightCm == null) return true; // don't reject on height if unknown
                if (m.heightCm < heightRange.min || m.heightCm > heightRange.max) {
                    rejected.push({ brand: m.brand, model: m.model, reason: `גובה ${m.heightCm} ס"מ — מחוץ לטווח ${heightRange.min}-${heightRange.max} ס"מ` });
                    return false;
                }
                return true;
            });
        }

        if (depthRange) {
            console.log(`${TAG} FILTER: depth range ${depthRange.min}-${depthRange.max} cm`);
            filtered = filtered.filter(m => {
                if (m.depthCm == null) return true; // don't reject on depth if unknown
                if (m.depthCm < depthRange.min || m.depthCm > depthRange.max) {
                    rejected.push({ brand: m.brand, model: m.model, reason: `עומק ${m.depthCm} ס"מ — מחוץ לטווח ${depthRange.min}-${depthRange.max} ס"מ` });
                    return false;
                }
                return true;
            });
        }

        if (rejected.length > 0) {
            console.log(`${TAG} REJECTED ${rejected.length} models:`);
            for (const r of rejected) {
                console.log(`${TAG}   ✗ ${r.brand} ${r.model}: ${r.reason}`);
            }
        }

        const priced = filtered.filter(m => typeof m.priceILS === 'number') as { priceILS: number }[];
        const cheapest = priced.length ? Math.min(...priced.map(m => m.priceILS)) : null;
        const mostExpensive = priced.length ? Math.max(...priced.map(m => m.priceILS)) : null;

        const rows = filtered.map(m => ({
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
            modelCount: filtered.length,
            originalCount: models.length,
            rejectedCount: rejected.length,
            rejectedModels: rejected,
            priceRangeILS: cheapest != null ? { min: cheapest, max: mostExpensive } : null,
            rows,
            _filterNote: rejected.length > 0
                ? `⚠️ ${rejected.length} דגמים נפסלו כי לא עמדו בדרישות המידות. ראה rejectedModels לפירוט.`
                : undefined,
        };

        console.log(`${TAG} OUTPUT: compared ${filtered.length} models for ${category} (${rejected.length} rejected)`);
        return JSON.stringify(result);
    },
    {
        name: 'compare_appliances',
        description:
            'Build a structured side-by-side comparison of appliance models within one category. Pass the collected model data (features, reliability, energy rating, price ILS, warranty). Returns a normalized comparison table with price range and a \'cheapest\' flag. IMPORTANT: pass the user\'s dimension requirements in the `requirements` parameter (e.g. "רוחב 90-100 ס\"מ") — models with null width or width outside the range will be automatically rejected.',
        schema: z.object({
            category: z.string().describe('Appliance category in Hebrew (e.g. \'מקרר\')'),
            models: z.array(ModelSchema).describe('The models to compare side-by-side'),
            requirements: z.string().optional().describe('User dimension/size requirements to filter against (e.g. \'רוחב 90-100 ס"מ\'). Models with null or out-of-range dimensions will be rejected.'),
        }),
    }
);
