import * as fs from 'fs';
import * as path from 'path';
import { parseApplianceFile, parseApplianceFileFromPath, ApplianceModel } from './parse-appliance-files';
import { mergeApplianceModels, MergedApplianceData } from './merge-appliance-data';
import { generateMergeSummary, MergeSummaryResult, RecommendationSets } from './generate-merge-summary';
import { writeExcel, writePdf } from '../tools/export-appliance-comparison.tool';
import { createOutputDir } from '../../../utils/save-output-base';
import { sanitizeFolderName } from '../../../utils/save-output-base';
import { LogColors } from '../../../utils/log-colors.util';
import type { ProductImage } from '../tools/fetch-product-image.util';

const TAG = `[produce-unified-output]`;

export interface MergeInput {
    buffer: Buffer;
    filename: string;
}

export interface MergeResult {
    outputDir: string;
    excelPath?: string;
    pdfPath?: string;
    mdPath?: string;
    modelCount: number;
    category: string;
    summary: string;
    warnings: string[];
}

function writeMarkdown(
    filePath: string,
    category: string,
    appliances: ApplianceModel[],
    summaryResult: MergeSummaryResult,
    sources: { title: string; url: string }[],
): void {
    const lines: string[] = [];

    lines.push(`# השוואת ${category} — מאוחד`);
    lines.push('');
    lines.push(summaryResult.summary);
    lines.push('');

    if (appliances.length) {
        lines.push('---');
        lines.push('');
        lines.push('## טבלת מוצרים');
        lines.push('');
        lines.push('| # | מותג | דגם | מידות (ג×ר×ע) / נפח | תכונות מרכזיות | אמינות | דירוג אנרגטי | מחיר (₪) | תמורה לכסף | יתרונות | חסרונות |');
        lines.push('|---|------|------|----------------------|----------------|--------|-------------|----------|-----------|----------|-----------|');

        appliances.forEach((a, i) => {
            const features = Array.isArray(a.keyFeatures) ? a.keyFeatures.join(', ') : '';
            const price = typeof a.priceILS === 'number' ? a.priceILS.toLocaleString('en-US') : '–';
            const dimParts: string[] = [];
            if (a.heightCm != null || a.widthCm != null || a.depthCm != null) {
                dimParts.push(`${a.heightCm ?? '?'}×${a.widthCm ?? '?'}×${a.depthCm ?? '?'} ס"ם`);
            }
            if (a.volumeLiters != null) dimParts.push(`${a.volumeLiters} ליטר`);
            const dims = dimParts.join(' / ') || '–';
            const pros = Array.isArray(a.pros) && a.pros.length ? a.pros.join(', ') : '–';
            const cons = Array.isArray(a.cons) && a.cons.length ? a.cons.join(', ') : '–';
            const modelCell = a.url ? `[${a.model || ''}](${a.url})` : (a.model || '');

            lines.push(
                `| ${i + 1} | **${a.brand || ''}** | ${modelCell} | ${dims} | ${features} | ${a.reliability || '–'} | ${a.energyRating || '–'} | ${price} | ${a.valueForMoney || '–'} | ${pros} | ${cons} |`
            );
        });
        lines.push('');
    }

    if (summaryResult.comparisons?.length) {
        lines.push('---');
        lines.push('');
        lines.push('## השוואות');
        lines.push('');
        for (const c of summaryResult.comparisons) {
            lines.push(`### ${c.category || ''}`);
            if (c.summary) lines.push(c.summary);
            if (c.recommendedModel) lines.push(`**דגם מומלץ:** ${c.recommendedModel}`);
            if (c.rationale) lines.push(`**נימוק:** ${c.rationale}`);
            lines.push('');
        }
    }

    const recSections: { title: string; items: string[] }[] = [
        { title: 'המלצות — מותגים מהרשימה', items: summaryResult.recommendations.fromGivenBrands },
        { title: 'המלצות — מותגים חלופיים', items: summaryResult.recommendations.fromAlternatives },
        { title: 'המלצות — הטובים ביותר מכל המותגים', items: summaryResult.recommendations.overallBest },
    ];
    const hasAnyRec = recSections.some(s => s.items.length > 0);
    if (hasAnyRec) {
        lines.push('---');
        lines.push('');
        lines.push('## המלצות');
        lines.push('');
        for (const sec of recSections) {
            if (!sec.items.length) continue;
            lines.push(`### ${sec.title}`);
            for (const r of sec.items) lines.push(`- ${r}`);
            lines.push('');
        }
    }

    if (sources.length) {
        lines.push('---');
        lines.push('');
        lines.push('## מקורות');
        lines.push('');
        for (const s of sources) {
            lines.push(`- 🔗 [${s.title || s.url}](${s.url})`);
        }
        lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('⚠️ המחירים והנתונים משוערים ועשויים להשתנות. מומלץ לאמת מול הספק לפני רכישה.');
    lines.push('');

    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

export async function produceUnifiedOutput(
    inputs: MergeInput[],
    apiKey: string,
    categoryOverride?: string,
): Promise<MergeResult> {
    const warnings: string[] = [];

    // 1. Parse all input files
    console.log(`${LogColors.BLUE}${TAG}${LogColors.RESET} Parsing ${inputs.length} input files...`);
    const parsedFiles = await Promise.all(
        inputs.map(async (input) => {
            try {
                return await parseApplianceFile(input.buffer, input.filename);
            } catch (err: any) {
                warnings.push(`Failed to parse ${input.filename}: ${err.message}`);
                console.error(`${LogColors.BRIGHT_RED}${TAG}${LogColors.RESET} Failed to parse ${input.filename}: ${err.message}`);
                return null;
            }
        })
    );
    const validFiles = parsedFiles.filter((f): f is NonNullable<typeof f> => f !== null);

    if (validFiles.length === 0) {
        throw new Error('No files could be parsed successfully');
    }

    // 2. Merge models
    const merged: MergedApplianceData = mergeApplianceModels(validFiles);
    const category = categoryOverride || merged.category;

    // 3. Generate unified summary via LLM
    const summaryResult = await generateMergeSummary(
        apiKey,
        merged.appliances,
        category,
        merged.existingSummaries,
    );

    // 4. Create output directory
    const outputDir = createOutputDir('appliances-merge', category, TAG);

    // 5. Write output files
    const base = sanitizeFolderName(category) || 'merged-comparison';
    const excelPath = path.join(outputDir, `${base}-merged.xlsx`);
    const pdfPath = path.join(outputDir, `${base}-merged.pdf`);
    const mdPath = path.join(outputDir, `${base}-merged.md`);

    const recs: RecommendationSets = summaryResult.recommendations;
    // No product images for the merge (images come from the original runs)
    const emptyImageMap = new Map<string, ProductImage>();

    const result: MergeResult = {
        outputDir,
        modelCount: merged.appliances.length,
        category,
        summary: summaryResult.summary,
        warnings,
    };

    // Write Excel
    try {
        await writeExcel(excelPath, category, merged.appliances, summaryResult.summary, recs, emptyImageMap);
        result.excelPath = excelPath;
        console.log(`${LogColors.BLUE}${TAG}${LogColors.RESET} Wrote Excel: ${excelPath}`);
    } catch (err: any) {
        warnings.push(`Excel generation failed: ${err.message}`);
        console.error(`${LogColors.BRIGHT_RED}${TAG}${LogColors.RESET} Excel error: ${err.message}`);
    }

    // Write PDF
    try {
        await writePdf(pdfPath, category, merged.appliances, summaryResult.summary, recs, emptyImageMap);
        result.pdfPath = pdfPath;
        console.log(`${LogColors.BLUE}${TAG}${LogColors.RESET} Wrote PDF: ${pdfPath}`);
    } catch (err: any) {
        warnings.push(`PDF generation failed: ${err.message}`);
        console.error(`${LogColors.BRIGHT_RED}${TAG}${LogColors.RESET} PDF error: ${err.message}`);
    }

    // Write Markdown
    try {
        writeMarkdown(mdPath, category, merged.appliances, summaryResult, merged.sources);
        result.mdPath = mdPath;
        console.log(`${LogColors.BLUE}${TAG}${LogColors.RESET} Wrote Markdown: ${mdPath}`);
    } catch (err: any) {
        warnings.push(`Markdown generation failed: ${err.message}`);
        console.error(`${LogColors.BRIGHT_RED}${TAG}${LogColors.RESET} Markdown error: ${err.message}`);
    }

    // Save merged data as JSON for reference
    try {
        const dataPath = path.join(outputDir, 'merged-data.json');
        fs.writeFileSync(dataPath, JSON.stringify({
            category,
            modelCount: merged.appliances.length,
            appliances: merged.appliances,
            summary: summaryResult.summary,
            comparisons: summaryResult.comparisons,
            recommendations: summaryResult.recommendations,
            sources: merged.sources,
            inputFiles: inputs.map(i => i.filename),
        }, null, 2), 'utf-8');
    } catch { /* non-critical */ }

    console.log(`${LogColors.BLUE}${TAG}${LogColors.RESET} Merge complete: ${merged.appliances.length} models → ${outputDir}`);
    return result;
}

export async function produceUnifiedOutputFromPaths(
    filePaths: string[],
    apiKey: string,
    categoryOverride?: string,
): Promise<MergeResult> {
    const inputs: MergeInput[] = filePaths.map(p => {
        if (!fs.existsSync(p)) {
            throw new Error(`File not found: ${p}`);
        }
        return {
            buffer: fs.readFileSync(p),
            filename: path.basename(p),
        };
    });
    return produceUnifiedOutput(inputs, apiKey, categoryOverride);
}
