import { ApplianceModel, ParsedApplianceFile } from './parse-appliance-files';
import { LogColors } from '../../../utils/log-colors.util';

const TAG = `[merge-appliance-data]`;

export interface MergedApplianceData {
    appliances: ApplianceModel[];
    existingSummaries: string[];
    existingRecommendations: string[];
    category: string;
    sources: { title: string; url: string }[];
}

function modelKey(m: ApplianceModel): string {
    return `${m.brand.trim().toLowerCase()}|${m.model.trim().toLowerCase()}`;
}

function unionArrays(a?: string[], b?: string[]): string[] | undefined {
    const setA = new Set(a ?? []);
    const setB = new Set(b ?? []);
    const merged = new Set([...setA, ...setB]);
    return merged.size > 0 ? [...merged] : undefined;
}

function preferNonEmpty<T>(a: T | undefined | null, b: T | undefined | null): T | undefined {
    if (a != null && a !== '') return a;
    if (b != null && b !== '') return b;
    return undefined;
}

function mergeTwo(existing: ApplianceModel, incoming: ApplianceModel): ApplianceModel {
    return {
        brand: existing.brand || incoming.brand,
        model: existing.model || incoming.model,
        keyFeatures: unionArrays(existing.keyFeatures, incoming.keyFeatures),
        reliability: preferNonEmpty(existing.reliability, incoming.reliability) as string | undefined,
        energyRating: preferNonEmpty(existing.energyRating, incoming.energyRating) as string | undefined,
        priceILS: existing.priceILS ?? incoming.priceILS,
        warranty: preferNonEmpty(existing.warranty, incoming.warranty) as string | undefined,
        valueForMoney: preferNonEmpty(existing.valueForMoney, incoming.valueForMoney) as string | undefined,
        heightCm: existing.heightCm ?? incoming.heightCm,
        widthCm: existing.widthCm ?? incoming.widthCm,
        depthCm: existing.depthCm ?? incoming.depthCm,
        volumeLiters: existing.volumeLiters ?? incoming.volumeLiters,
        pros: unionArrays(existing.pros, incoming.pros),
        cons: unionArrays(existing.cons, incoming.cons),
        fromGivenList: existing.fromGivenList || incoming.fromGivenList,
        url: preferNonEmpty(existing.url, incoming.url) as string | undefined,
    };
}

export function mergeApplianceModels(files: ParsedApplianceFile[]): MergedApplianceData {
    const modelMap = new Map<string, ApplianceModel>();
    const existingSummaries: string[] = [];
    const existingRecommendations: string[] = [];
    const allSources: { title: string; url: string }[] = [];
    let category = '';

    for (const file of files) {
        // Pick up category from first file that has one
        if (!category && file.category) {
            category = file.category;
        }

        // Collect summaries & recommendations
        if (file.summary) existingSummaries.push(file.summary);
        if (file.recommendations) existingRecommendations.push(...file.recommendations);

        // Collect sources
        if (file.sources) {
            for (const src of file.sources) {
                if (!allSources.some(s => s.url === src.url)) {
                    allSources.push(src);
                }
            }
        }

        // Merge models
        for (const m of file.appliances) {
            const key = modelKey(m);
            const existing = modelMap.get(key);
            if (existing) {
                modelMap.set(key, mergeTwo(existing, m));
            } else {
                modelMap.set(key, { ...m });
            }
        }
    }

    const appliances = [...modelMap.values()];

    // Deduplicate recommendations
    const uniqueRecs = [...new Set(existingRecommendations)];

    console.log(`${LogColors.BLUE}${TAG}${LogColors.RESET} Merged ${files.length} files → ${appliances.length} unique models, category='${category || 'unknown'}'`);

    return {
        appliances,
        existingSummaries,
        existingRecommendations: uniqueRecs,
        category: category || 'מכשירי חשמל',
        sources: allSources,
    };
}
