import { tool } from 'langchain';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import PdfPrinter from 'pdfmake/src/printer';
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { sanitizeFolderName } from '../../../utils/save-output-base';
import { fetchAllProductImages, ProductImage } from './fetch-product-image.util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '..', 'assets');

const TAG = `${color256(178)}[export_appliance_comparison]${LogColors.RESET}`;

/** Reverse word order for PDF RTL display (pdfkit places glyphs LTR). */
function rtlWords(text: string): string {
    if (!text) return '';
    return text.split(/(\s+)/).reverse().join('');
}


const ModelSchema = z.object({
    brand: z.string(),
    model: z.string(),
    keyFeatures: z.array(z.string()).optional(),
    reliability: z.string().optional(),
    energyRating: z.string().optional(),
    priceILS: z.number().optional(),
    warranty: z.string().optional(),
    valueForMoney: z.string().optional(),
    heightCm: z.number().optional(),
    widthCm: z.number().optional(),
    depthCm: z.number().optional(),
    volumeLiters: z.number().optional(),
    pros: z.array(z.string()).optional(),
    cons: z.array(z.string()).optional(),
    fromGivenList: z.boolean().optional(),
    url: z.string().optional(),
});

const COLUMNS: { key: keyof z.infer<typeof ModelSchema> | 'source' | 'dimensions'; header: string }[] = [
    { key: 'brand', header: 'מותג' },
    { key: 'model', header: 'דגם' },
    { key: 'source', header: 'מקור' },
    { key: 'dimensions', header: 'מידות (ג×ר×ע ס\"מ) / נפח' },
    { key: 'keyFeatures', header: 'תכונות עיקריות' },
    { key: 'energyRating', header: 'דירוג אנרגטי' },
    { key: 'reliability', header: 'אמינות' },
    { key: 'warranty', header: 'אחריות/שירות' },
    { key: 'priceILS', header: 'מחיר (₪)' },
    { key: 'valueForMoney', header: 'תמורה לכסף' },
    { key: 'pros', header: 'יתרונות' },
    { key: 'cons', header: 'חסרונות' },
];

function cellValue(model: z.infer<typeof ModelSchema>, key: string): string {
    switch (key) {
        case 'source':
            return model.fromGivenList ? 'מהרשימה' : 'חלופה';
        case 'keyFeatures':
            return (model.keyFeatures ?? []).join(', ') || 'לא זמין';
        case 'priceILS':
            return typeof model.priceILS === 'number' ? model.priceILS.toLocaleString('en-US') : 'לא זמין';
        case 'dimensions': {
            const parts: string[] = [];
            const h = model.heightCm, w = model.widthCm, d = model.depthCm;
            if (h != null || w != null || d != null) {
                parts.push(`${h ?? '?'}×${w ?? '?'}×${d ?? '?'} ס"מ`);
            }
            if (model.volumeLiters != null) {
                parts.push(`${model.volumeLiters} ליטר`);
            }
            return parts.join(' / ') || 'לא זמין';
        }
        case 'pros':
            return (model.pros ?? []).join(', ') || 'לא זמין';
        case 'cons':
            return (model.cons ?? []).join(', ') || 'לא זמין';
        default: {
            const v = (model as any)[key];
            return v != null && v !== '' ? String(v) : 'לא זמין';
        }
    }
}

interface RecommendationSets {
    fromGivenBrands: string[];
    fromAlternatives: string[];
    overallBest: string[];
}

/** Detect a supported ExcelJS image extension from the local file path. Returns null for unsupported formats (e.g. webp). */
function excelImageExt(localPath: string): 'png' | 'jpeg' | null {
    if (localPath.endsWith('.png')) return 'png';
    if (localPath.endsWith('.jpg') || localPath.endsWith('.jpeg')) return 'jpeg';
    return null; // webp / gif etc. not supported by ExcelJS
}

export async function writeExcel(filePath: string, category: string, models: z.infer<typeof ModelSchema>[], summary: string, recommendations: RecommendationSets, imageMap: Map<string, ProductImage>) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(category.slice(0, 28) || 'comparison', { views: [{ rightToLeft: true }] });

    const IMG_COL = COLUMNS.length + 1; // 1-based index for the image column
    const IMG_PIXEL_W = 120;
    const IMG_PIXEL_H = 100;
    const IMG_ROW_HEIGHT = 80; // points

    ws.addRow([`השוואת ${category}`]);
    ws.mergeCells(1, 1, 1, IMG_COL);
    ws.getCell(1, 1).font = { bold: true, size: 14 };

    const headers = [...COLUMNS.map(c => c.header), 'תמונה'];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        cell.alignment = { horizontal: 'right', wrapText: true };
    });

    const MODEL_COL_IDX = COLUMNS.findIndex(c => c.key === 'model') + 1; // 1-based

    for (const m of models) {
        const row = ws.addRow(COLUMNS.map(c => cellValue(m, c.key as string)));
        row.alignment = { horizontal: 'right', wrapText: true, vertical: 'top' };

        if (m.url && MODEL_COL_IDX > 0) {
            const modelCell = row.getCell(MODEL_COL_IDX);
            modelCell.value = { text: m.model, hyperlink: m.url } as any;
            modelCell.font = { color: { argb: 'FF0563C1' }, underline: true };
        }

        const img = imageMap.get(`${m.brand}|${m.model}`);
        if (img) {
            const ext = excelImageExt(img.localPath);
            if (ext) {
                row.height = IMG_ROW_HEIGHT;
                const imageId = wb.addImage({
                    buffer: img.buffer as any,
                    extension: ext,
                });
                ws.addImage(imageId, {
                    tl: { col: IMG_COL - 1, row: row.number - 1 },
                    ext: { width: IMG_PIXEL_W, height: IMG_PIXEL_H },
                });
            }
        }
    }

    ws.columns.forEach((col, idx) => {
        col.width = idx === IMG_COL - 1 ? 18 : 22;
    });

    ws.addRow([]);
    const sumTitle = ws.addRow(['סיכום']);
    sumTitle.font = { bold: true };
    ws.addRow([summary]);

    const recSections: { title: string; items: string[] }[] = [
        { title: 'המלצות — מותגים מהרשימה', items: recommendations.fromGivenBrands },
        { title: 'המלצות — מותגים חלופיים', items: recommendations.fromAlternatives },
        { title: 'המלצות — הטובים ביותר מכל המותגים', items: recommendations.overallBest },
    ];
    for (const sec of recSections) {
        if (!sec.items.length) continue;
        ws.addRow([]);
        const secTitle = ws.addRow([sec.title]);
        secTitle.font = { bold: true };
        secTitle.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        for (const r of sec.items) ws.addRow([`• ${r}`]);
    }

    await wb.xlsx.writeFile(filePath);
}

/** Return a pdfmake-compatible data-URI for an image, or null if the format is unsupported (e.g. webp). */
function pdfImageDataUri(img: ProductImage): string | null {
    const lp = img.localPath.toLowerCase();
    let mime: string;
    if (lp.endsWith('.png')) mime = 'image/png';
    else if (lp.endsWith('.jpg') || lp.endsWith('.jpeg')) mime = 'image/jpeg';
    else return null; // webp / gif not supported by pdfmake
    return `data:${mime};base64,${img.buffer.toString('base64')}`;
}

export function writePdf(filePath: string, category: string, models: z.infer<typeof ModelSchema>[], summary: string, recommendations: RecommendationSets, imageMap: Map<string, ProductImage>): Promise<void> {
    // DejaVu Sans covers Hebrew + Latin + digits + ₪, unlike NotoSansHebrew which
    // renders Latin/digits as missing-glyph boxes (tofu).
    const fonts = {
        Hebrew: {
            normal: path.join(ASSETS_DIR, 'DejaVuSans.ttf'),
            bold: path.join(ASSETS_DIR, 'DejaVuSans-Bold.ttf'),
            italics: path.join(ASSETS_DIR, 'DejaVuSans.ttf'),
            bolditalics: path.join(ASSETS_DIR, 'DejaVuSans-Bold.ttf'),
        },
    };
    const printer = new PdfPrinter(fonts);

    const IMG_WIDTH_PDF = 60;

    const headerRow = [
        ...COLUMNS.map(c => ({ text: rtlWords(c.header), bold: true, alignment: 'right', fillColor: '#D9E1F2' })),
        { text: rtlWords('תמונה'), bold: true, alignment: 'center', fillColor: '#D9E1F2' },
    ];

    const MODEL_COL_PDF = COLUMNS.findIndex(c => c.key === 'model');

    const dataRows = models.map(m => {
        const cells = COLUMNS.map((c, idx) => {
            const cellText = rtlWords(cellValue(m, c.key as string));
            if (idx === MODEL_COL_PDF && m.url) {
                return { text: cellText, link: m.url, color: '#0563C1', decoration: 'underline', alignment: 'right' };
            }
            return { text: cellText, alignment: 'right' };
        });
        const img = imageMap.get(`${m.brand}|${m.model}`);
        const dataUri = img ? pdfImageDataUri(img) : null;
        const imgCell: any = dataUri
            ? { image: dataUri, width: IMG_WIDTH_PDF, alignment: 'center' }
            : { text: '–', alignment: 'center' };
        return [...cells, imgCell];
    });

    const tableBody = [headerRow, ...dataRows];
    const colWidths = [...COLUMNS.map(() => 'auto'), IMG_WIDTH_PDF + 10];

    const recSections: { title: string; items: string[] }[] = [
        { title: 'המלצות — מותגים מהרשימה', items: recommendations.fromGivenBrands },
        { title: 'המלצות — מותגים חלופיים', items: recommendations.fromAlternatives },
        { title: 'המלצות — הטובים ביותר מכל המותגים', items: recommendations.overallBest },
    ];
    const recContent: any[] = [];
    for (const sec of recSections) {
        if (!sec.items.length) continue;
        recContent.push({ text: rtlWords(sec.title), fontSize: 12, bold: true, margin: [0, 12, 0, 4], fillColor: '#FFF2CC' });
        recContent.push({ ul: sec.items.map(r => rtlWords(r)) });
    }

    const docDefinition: any = {
        defaultStyle: { font: 'Hebrew', alignment: 'right', fontSize: 9 },
        pageOrientation: 'landscape',
        content: [
            { text: rtlWords(`השוואת ${category}`), fontSize: 16, bold: true, margin: [0, 0, 0, 10] },
            {
                table: { headerRows: 1, widths: colWidths, body: tableBody },
                layout: 'lightHorizontalLines',
            },
            { text: rtlWords('סיכום'), fontSize: 13, bold: true, margin: [0, 14, 0, 4] },
            { text: rtlWords(summary) },
            ...recContent,
            { text: rtlWords('⚠️ המחירים והנתונים משוערים ועשויים להשתנות. מומלץ לאמת מול הספק לפני רכישה.'), fontSize: 8, italics: true, margin: [0, 14, 0, 0] },
        ],
    };

    return new Promise((resolve, reject) => {
        try {
            const pdfDoc = printer.createPdfKitDocument(docDefinition);
            const stream = fs.createWriteStream(filePath);
            pdfDoc.pipe(stream);
            pdfDoc.on('error', reject);
            stream.on('finish', () => resolve());
            stream.on('error', reject);
            pdfDoc.end();
        } catch (err) {
            reject(err);
        }
    });
}

export const createExportApplianceComparisonTool = (outputDir: string) =>
    tool(
        async ({ category, models, summary, recommendations }) => {
            console.log(`${TAG} INPUT: category='${category}', models=${models.length}`);

            const recs: RecommendationSets = {
                fromGivenBrands: recommendations?.fromGivenBrands ?? [],
                fromAlternatives: recommendations?.fromAlternatives ?? [],
                overallBest: recommendations?.overallBest ?? [],
            };
            fs.mkdirSync(outputDir, { recursive: true });

            // Fetch product images for all models in parallel
            console.log(`${TAG} Fetching product images...`);
            const imageMap = await fetchAllProductImages(models, outputDir);

            const base = sanitizeFolderName(category) || 'comparison';
            const excelPath = path.join(outputDir, `${base}-comparison.xlsx`);
            const pdfPath = path.join(outputDir, `${base}-comparison.pdf`);

            const generated: { excelPath?: string; pdfPath?: string; warnings: string[] } = { warnings: [] };

            try {
                await writeExcel(excelPath, category, models, summary, recs, imageMap);
                generated.excelPath = excelPath;
                console.log(`${TAG} OUTPUT: wrote Excel ${excelPath}`);
            } catch (err: any) {
                generated.warnings.push(`Excel failed: ${err.message}`);
                console.log(`${TAG} ERROR (excel): ${err.message}`);
            }

            try {
                await writePdf(pdfPath, category, models, summary, recs, imageMap);
                generated.pdfPath = pdfPath;
                console.log(`${TAG} OUTPUT: wrote PDF ${pdfPath}`);
            } catch (err: any) {
                generated.warnings.push(`PDF failed: ${err.message}`);
                console.log(`${TAG} ERROR (pdf): ${err.message}`);
            }

            return JSON.stringify({
                success: !!(generated.excelPath || generated.pdfPath),
                category,
                excelPath: generated.excelPath,
                pdfPath: generated.pdfPath,
                imagesFound: imageMap.size,
                warnings: generated.warnings,
            });
        },
        {
            name: 'export_appliance_comparison',
            description:
                'Generate comparison files (Excel .xlsx AND PDF) for one appliance category. Pass the compared models (with features, reliability, energy rating, price ILS, warranty, value-for-money), a Hebrew summary, and Hebrew recommendations. Returns the file paths. Call once per appliance category.',
            schema: z.object({
                category: z.string().describe('Appliance category in Hebrew (e.g. \'מקרר\')'),
                models: z.array(ModelSchema).describe('Models to include in the comparison file'),
                summary: z.string().describe('Hebrew comparison summary to include in the file'),
                recommendations: z.object({
                    fromGivenBrands: z.array(z.string()).describe('Hebrew recommendations for the best models from the user-provided brands list'),
                    fromAlternatives: z.array(z.string()).describe('Hebrew recommendations for the best models from alternative/competing brands'),
                    overallBest: z.array(z.string()).describe('Hebrew overall best recommendations combining both given brands and alternatives'),
                }).optional().describe('Hebrew recommendations organized in three sets'),
            }),
        }
    );
