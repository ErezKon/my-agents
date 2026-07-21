import * as fs from 'fs';
import ExcelJS from 'exceljs';
import pdfParse from 'pdf-parse';
import { LogColors } from '../../../utils/log-colors.util';

const TAG = `[parse-appliance-files]`;

export interface ApplianceModel {
    brand: string;
    model: string;
    keyFeatures?: string[];
    reliability?: string;
    energyRating?: string;
    priceILS?: number;
    warranty?: string;
    valueForMoney?: string;
    heightCm?: number;
    widthCm?: number;
    depthCm?: number;
    volumeLiters?: number;
    pros?: string[];
    cons?: string[];
    fromGivenList?: boolean;
    url?: string;
}

export interface ParsedApplianceFile {
    appliances: ApplianceModel[];
    summary?: string;
    recommendations?: string[];
    category?: string;
    sources?: { title: string; url: string }[];
}

// ─── Excel parser ───────────────────────────────────────────────────────────

const EXCEL_HEADER_MAP: Record<string, keyof ApplianceModel | 'source' | 'dimensions'> = {
    'מותג': 'brand',
    'דגם': 'model',
    'מקור': 'source',
    'מידות': 'dimensions',
    'תכונות עיקריות': 'keyFeatures',
    'תכונות מרכזיות': 'keyFeatures',
    'דירוג אנרגטי': 'energyRating',
    'אמינות': 'reliability',
    'אחריות/שירות': 'warranty',
    'אחריות': 'warranty',
    'מחיר': 'priceILS',
    'תמורה לכסף': 'valueForMoney',
    'יתרונות': 'pros',
    'חסרונות': 'cons',
};

function matchHeader(cellText: string): keyof ApplianceModel | 'source' | 'dimensions' | null {
    const text = cellText.trim();
    for (const [pattern, key] of Object.entries(EXCEL_HEADER_MAP)) {
        if (text.includes(pattern)) return key;
    }
    return null;
}

function cellToString(cell: ExcelJS.Cell): string {
    const val = cell.value;
    if (val == null) return '';
    if (typeof val === 'object' && 'text' in val) return (val as any).text ?? '';
    if (typeof val === 'object' && 'richText' in val) {
        return ((val as any).richText as any[]).map((r: any) => r.text ?? '').join('');
    }
    return String(val);
}

function extractHyperlink(cell: ExcelJS.Cell): string | null {
    const val = cell.value;
    if (val && typeof val === 'object' && 'hyperlink' in val) return (val as any).hyperlink;
    return null;
}

export async function parseExcel(buffer: Buffer): Promise<ParsedApplianceFile> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    const appliances: ApplianceModel[] = [];
    let summary: string | undefined;
    const recommendations: string[] = [];
    let category: string | undefined;

    for (const ws of wb.worksheets) {
        // Try to detect category from the first row (title row like 'השוואת מקרר')
        const titleCell = cellToString(ws.getCell(1, 1));
        if (titleCell.startsWith('השוואת ')) {
            category = titleCell.replace('השוואת ', '').trim();
        }

        // Find the header row — look for a row containing 'מותג' and 'דגם'
        let headerRowNum = -1;
        const colMap: Map<number, keyof ApplianceModel | 'source' | 'dimensions'> = new Map();

        ws.eachRow((row, rowNum) => {
            if (headerRowNum !== -1) return;
            let hasBrand = false;
            let hasModel = false;
            row.eachCell((cell, colNum) => {
                const text = cellToString(cell);
                const key = matchHeader(text);
                if (key === 'brand') hasBrand = true;
                if (key === 'model') hasModel = true;
                if (key) colMap.set(colNum, key);
            });
            if (hasBrand && hasModel) {
                headerRowNum = rowNum;
            } else {
                colMap.clear();
            }
        });

        if (headerRowNum === -1) continue;

        // Read data rows
        const modelColNum = [...colMap.entries()].find(([, k]) => k === 'model')?.[0];

        ws.eachRow((row, rowNum) => {
            if (rowNum <= headerRowNum) return;

            // Check if this is a data row (has brand + model)
            const brandCol = [...colMap.entries()].find(([, k]) => k === 'brand')?.[0];
            if (!brandCol) return;
            const brandVal = cellToString(row.getCell(brandCol)).trim();
            if (!brandVal) {
                // Could be summary/recommendations section
                const firstCell = cellToString(row.getCell(1)).trim();
                if (firstCell === 'סיכום') return; // skip title
                if (firstCell.startsWith('המלצות')) return; // skip section title
                if (firstCell.startsWith('•')) {
                    recommendations.push(firstCell.replace(/^•\s*/, ''));
                    return;
                }
                if (!summary && firstCell.length > 20) {
                    summary = firstCell;
                }
                return;
            }

            const m: ApplianceModel = { brand: brandVal, model: '' };

            for (const [colNum, key] of colMap) {
                const text = cellToString(row.getCell(colNum)).trim();
                if (!text || text === 'לא זמין' || text === '–') continue;

                switch (key) {
                    case 'brand':
                        m.brand = text.replace(/\*\*/g, '');
                        break;
                    case 'model': {
                        m.model = text;
                        const link = extractHyperlink(row.getCell(colNum));
                        if (link) m.url = link;
                        break;
                    }
                    case 'source':
                        m.fromGivenList = text.includes('מהרשימה');
                        break;
                    case 'dimensions':
                        parseDimensions(text, m);
                        break;
                    case 'keyFeatures':
                        m.keyFeatures = text.split(/,\s*/).filter(Boolean);
                        break;
                    case 'energyRating':
                        m.energyRating = text;
                        break;
                    case 'reliability':
                        m.reliability = text;
                        break;
                    case 'warranty':
                        m.warranty = text;
                        break;
                    case 'priceILS': {
                        const num = parseFloat(text.replace(/[,₪\s]/g, ''));
                        if (!isNaN(num)) m.priceILS = num;
                        break;
                    }
                    case 'valueForMoney':
                        m.valueForMoney = text;
                        break;
                    case 'pros':
                        m.pros = text.split(/,\s*/).filter(Boolean);
                        break;
                    case 'cons':
                        m.cons = text.split(/,\s*/).filter(Boolean);
                        break;
                }
            }

            if (m.model) appliances.push(m);
        });
    }

    console.log(`${LogColors.BLUE}${TAG}${LogColors.RESET} Parsed Excel: ${appliances.length} models, category='${category ?? 'unknown'}'`);
    return { appliances, summary, recommendations: recommendations.length ? recommendations : undefined, category };
}

// ─── PDF parser ─────────────────────────────────────────────────────────────

export async function parsePdf(buffer: Buffer): Promise<ParsedApplianceFile> {
    const data = await pdfParse(buffer);
    const text = data.text;
    return parseTextContent(text, 'PDF');
}

// ─── Markdown parser ────────────────────────────────────────────────────────

export async function parseMarkdown(text: string): Promise<ParsedApplianceFile> {
    return parseTextContent(text, 'MD');
}

// ─── Shared text parser (for both PDF and MD) ───────────────────────────────

function parseTextContent(text: string, source: string): ParsedApplianceFile {
    const appliances: ApplianceModel[] = [];
    let summary: string | undefined;
    const recommendations: string[] = [];
    let category: string | undefined;
    const sources: { title: string; url: string }[] = [];

    const lines = text.split('\n').map(l => l.trim());

    // Detect category from title like 'השוואת מקרר' or '# השוואת מדיח כלים'
    for (const line of lines) {
        const catMatch = line.match(/השוואת\s+(.+)/);
        if (catMatch && !category) {
            category = catMatch[1].replace(/[#*]/g, '').trim();
            break;
        }
    }

    // Parse markdown table
    const tableLines = extractTableLines(lines);
    if (tableLines.headers && tableLines.rows.length) {
        const headerKeys = mapMarkdownHeaders(tableLines.headers);

        for (const row of tableLines.rows) {
            const cells = splitTableRow(row);
            const m: ApplianceModel = { brand: '', model: '' };

            for (let i = 0; i < cells.length && i < headerKeys.length; i++) {
                const key = headerKeys[i];
                const cell = cells[i].trim();
                if (!cell || cell === '–' || cell === 'לא זמין') continue;

                switch (key) {
                    case 'index': break; // row number
                    case 'brand':
                        m.brand = cell.replace(/\*\*/g, '');
                        break;
                    case 'model': {
                        const linkMatch = cell.match(/\[([^\]]+)\]\(([^)]+)\)/);
                        if (linkMatch) {
                            m.model = linkMatch[1];
                            m.url = linkMatch[2];
                        } else {
                            m.model = cell;
                        }
                        break;
                    }
                    case 'image': break; // skip
                    case 'dimensions':
                        parseDimensions(cell, m);
                        break;
                    case 'keyFeatures':
                        m.keyFeatures = cell.split(/,\s*/).filter(Boolean);
                        break;
                    case 'reliability':
                        m.reliability = cell;
                        break;
                    case 'energyRating':
                        m.energyRating = cell;
                        break;
                    case 'priceILS': {
                        const num = parseFloat(cell.replace(/[,₪\s]/g, ''));
                        if (!isNaN(num)) m.priceILS = num;
                        break;
                    }
                    case 'valueForMoney':
                        m.valueForMoney = cell;
                        break;
                    case 'pros':
                        m.pros = cell.split(/,\s*/).filter(Boolean);
                        break;
                    case 'cons':
                        m.cons = cell.split(/,\s*/).filter(Boolean);
                        break;
                    case 'source':
                        m.fromGivenList = cell.includes('מהרשימה');
                        break;
                    case 'warranty':
                        m.warranty = cell;
                        break;
                }
            }

            if (m.brand && m.model) appliances.push(m);
        }
    }

    // Parse summary section
    let inSummary = false;
    let inRecommendations = false;
    let inSources = false;

    for (const line of lines) {
        if (/^#{1,3}\s*סיכום/.test(line)) { inSummary = true; inRecommendations = false; inSources = false; continue; }
        if (/^#{1,3}\s*המלצות/.test(line)) { inRecommendations = true; inSummary = false; inSources = false; continue; }
        if (/^#{1,3}\s*מקורות/.test(line)) { inSources = true; inSummary = false; inRecommendations = false; continue; }
        if (/^#{1,3}\s/.test(line) && !line.includes('סיכום') && !line.includes('המלצות') && !line.includes('מקורות')) {
            inSummary = false; inRecommendations = false; inSources = false;
        }
        if (/^---$/.test(line)) { inSummary = false; inRecommendations = false; inSources = false; continue; }

        if (inSummary && line.length > 5) {
            summary = summary ? summary + ' ' + line : line;
        }
        if (inRecommendations && line.startsWith('-')) {
            recommendations.push(line.replace(/^-\s*/, ''));
        }
        if (inSources) {
            const srcMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
            if (srcMatch) {
                sources.push({ title: srcMatch[1], url: srcMatch[2] });
            }
        }
    }

    console.log(`${LogColors.BLUE}${TAG}${LogColors.RESET} Parsed ${source}: ${appliances.length} models, category='${category ?? 'unknown'}'`);
    return {
        appliances,
        summary,
        recommendations: recommendations.length ? recommendations : undefined,
        category,
        sources: sources.length ? sources : undefined,
    };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDimensions(text: string, m: ApplianceModel): void {
    // e.g. '85×60×65 ס"מ / 350 ליטר' or '85×60×65 ס"ם / 350 ליטר'
    const dimMatch = text.match(/(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)/);
    if (dimMatch) {
        m.heightCm = parseFloat(dimMatch[1]);
        m.widthCm = parseFloat(dimMatch[2]);
        m.depthCm = parseFloat(dimMatch[3]);
    }
    const volMatch = text.match(/(\d+(?:\.\d+)?)\s*ליטר/);
    if (volMatch) {
        m.volumeLiters = parseFloat(volMatch[1]);
    }
}

function extractTableLines(lines: string[]): { headers: string | null; rows: string[] } {
    let headers: string | null = null;
    const rows: string[] = [];
    let foundSeparator = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes('|')) continue;

        if (!headers) {
            headers = line;
            continue;
        }

        // Skip separator row (|---|---|...)
        if (/^\|[\s\-|]+\|$/.test(line) || /^[\s\-|]+$/.test(line)) {
            foundSeparator = true;
            continue;
        }

        if (foundSeparator) {
            rows.push(line);
        }
    }

    return { headers, rows };
}

const MD_HEADER_MAP: Record<string, string> = {
    '#': 'index',
    'מותג': 'brand',
    'דגם': 'model',
    'תמונה': 'image',
    'מידות': 'dimensions',
    'תכונות': 'keyFeatures',
    'אמינות': 'reliability',
    'דירוג אנרגטי': 'energyRating',
    'מחיר': 'priceILS',
    'תמורה לכסף': 'valueForMoney',
    'יתרונות': 'pros',
    'חסרונות': 'cons',
    'מקור': 'source',
    'אחריות': 'warranty',
};

function mapMarkdownHeaders(headerLine: string): string[] {
    const cells = splitTableRow(headerLine);
    return cells.map(cell => {
        const text = cell.trim();
        for (const [pattern, key] of Object.entries(MD_HEADER_MAP)) {
            if (text.includes(pattern)) return key;
        }
        return 'unknown';
    });
}

function splitTableRow(line: string): string[] {
    // Split by | but remove leading/trailing empty cells from outer pipes
    const parts = line.split('|');
    if (parts.length > 0 && parts[0].trim() === '') parts.shift();
    if (parts.length > 0 && parts[parts.length - 1].trim() === '') parts.pop();
    return parts;
}

// ─── Auto-detect and parse ──────────────────────────────────────────────────

export async function parseApplianceFile(buffer: Buffer, filename: string): Promise<ParsedApplianceFile> {
    const ext = filename.toLowerCase().split('.').pop();
    switch (ext) {
        case 'xlsx':
        case 'xls':
            return parseExcel(buffer);
        case 'pdf':
            return parsePdf(buffer);
        case 'md':
        case 'markdown':
            return parseMarkdown(buffer.toString('utf-8'));
        default:
            throw new Error(`Unsupported file type: .${ext} (expected .xlsx, .pdf, or .md)`);
    }
}

export function parseApplianceFileFromPath(filePath: string): Promise<ParsedApplianceFile> {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    const buffer = fs.readFileSync(filePath);
    const filename = filePath.split('/').pop() || filePath;
    return parseApplianceFile(buffer, filename);
}
