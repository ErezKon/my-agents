/**
 * Extract physical dimensions (width, height, depth) from unstructured text
 * snippets returned by web search results.
 *
 * Supports Hebrew and English patterns commonly found in Israeli appliance
 * product pages and spec sheets.
 */

export interface ExtractedDimensions {
    widthCm: number | null;
    heightCm: number | null;
    depthCm: number | null;
    volumeLiters: number | null;
    /** The raw text snippet that the dimensions were extracted from, for traceability. */
    source: string | null;
}

/**
 * Try to extract dimensions from an array of text snippets.
 * Returns the best-effort extraction — fields may be null if not found.
 */
export function extractDimensions(snippets: string[]): ExtractedDimensions {
    const result: ExtractedDimensions = {
        widthCm: null,
        heightCm: null,
        depthCm: null,
        volumeLiters: null,
        source: null,
    };

    const combined = snippets.join('\n');

    // --- Volume (liters) ---
    extractVolume(combined, result);

    // --- Explicit labeled dimensions (most reliable) ---
    extractLabeledDimensions(combined, result);

    // --- HxWxD or WxDxH patterns ---
    extractTripleDimensions(combined, result);

    // --- Width-only patterns ---
    if (result.widthCm === null) {
        extractWidthOnly(combined, result);
    }

    return result;
}

/** Extract volume in liters from text. */
function extractVolume(text: string, result: ExtractedDimensions): void {
    // Hebrew: "500 ליטר", "500ליטר"
    const hebrewLiterPatterns = [
        /(\d{2,4})\s*ליטר/g,
        /(\d{2,4})\s*ל['׳]/g,
    ];
    for (const pattern of hebrewLiterPatterns) {
        const match = pattern.exec(text);
        if (match) {
            const val = parseInt(match[1], 10);
            if (val >= 30 && val <= 2000) {
                result.volumeLiters = val;
                return;
            }
        }
    }
    // English: "500 liters", "500L"
    const englishLiterPattern = /(\d{2,4})\s*(?:liters?|litres?|L\b)/gi;
    const match = englishLiterPattern.exec(text);
    if (match) {
        const val = parseInt(match[1], 10);
        if (val >= 30 && val <= 2000) {
            result.volumeLiters = val;
        }
    }
}

/** Extract explicitly labeled dimensions like "רוחב: 90 ס"מ", "Width: 90 cm" */
function extractLabeledDimensions(text: string, result: ExtractedDimensions): void {
    // Hebrew labels
    const hebrewLabels: { label: RegExp; field: 'widthCm' | 'heightCm' | 'depthCm' }[] = [
        { label: /רוחב[:\s]*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:ס"מ|ס״מ|סמ|cm|ס["״]מ)/gi, field: 'widthCm' },
        { label: /גובה[:\s]*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:ס"מ|ס״מ|סמ|cm|ס["״]מ)/gi, field: 'heightCm' },
        { label: /עומק[:\s]*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:ס"מ|ס״מ|סמ|cm|ס["״]מ)/gi, field: 'depthCm' },
    ];
    for (const { label, field } of hebrewLabels) {
        const match = label.exec(text);
        if (match) {
            const val = parseFloat(match[1].replace(',', '.'));
            if (isDimensionPlausible(field, val)) {
                result[field] = val;
                result.source = match[0];
            }
        }
    }

    // English labels
    const englishLabels: { label: RegExp; field: 'widthCm' | 'heightCm' | 'depthCm' }[] = [
        { label: /width[:\s]*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:cm|mm)/gi, field: 'widthCm' },
        { label: /height[:\s]*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:cm|mm)/gi, field: 'heightCm' },
        { label: /depth[:\s]*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:cm|mm)/gi, field: 'depthCm' },
    ];
    for (const { label, field } of englishLabels) {
        if (result[field] !== null) continue; // Hebrew already found
        const match = label.exec(text);
        if (match) {
            let val = parseFloat(match[1].replace(',', '.'));
            // If the unit is mm, convert to cm
            if (match[0].toLowerCase().includes('mm')) {
                val = val / 10;
            }
            if (isDimensionPlausible(field, val)) {
                result[field] = val;
                result.source = match[0];
            }
        }
    }

    // "ברוחב 90 ס"מ" pattern (in-sentence)
    if (result.widthCm === null) {
        const inSentence = /ברוחב\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:ס"מ|ס״מ|סמ|cm|ס["״]מ)/i;
        const match = inSentence.exec(text);
        if (match) {
            const val = parseFloat(match[1].replace(',', '.'));
            if (isDimensionPlausible('widthCm', val)) {
                result.widthCm = val;
                result.source = match[0];
            }
        }
    }
}

/**
 * Extract H×W×D or similar triple-number patterns.
 * Common formats:
 *   "185×90×72 cm"
 *   "185 x 90 x 72 ס"מ"
 *   "(H)185 x (W)90 x (D)72"
 */
function extractTripleDimensions(text: string, result: ExtractedDimensions): void {
    // Pattern: three numbers separated by × or x, optionally with unit suffix
    const triplePattern = /(\d{2,3}(?:[.,]\d{1,2})?)\s*[×xX*]\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*[×xX*]\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:ס"מ|ס״מ|סמ|cm|mm|ס["״]מ)?/g;

    let match: RegExpExecArray | null;
    while ((match = triplePattern.exec(text)) !== null) {
        const nums = [
            parseFloat(match[1].replace(',', '.')),
            parseFloat(match[2].replace(',', '.')),
            parseFloat(match[3].replace(',', '.')),
        ].sort((a, b) => b - a); // sort descending

        // Heuristic: height is typically the largest (>100cm), width is medium, depth is smallest
        // For refrigerators: height ~150-210, width ~50-120, depth ~50-80
        const [largest, medium, smallest] = nums;

        if (largest >= 100 && largest <= 250 && medium >= 40 && medium <= 130 && smallest >= 30 && smallest <= 100) {
            if (result.heightCm === null) result.heightCm = largest;
            if (result.widthCm === null) result.widthCm = medium;
            if (result.depthCm === null) result.depthCm = smallest;
            result.source = match[0];
            break;
        }
    }
}

/** Extract standalone width mentions like "90 ס"מ" in context that implies width */
function extractWidthOnly(text: string, result: ExtractedDimensions): void {
    // "רוחב 90" without explicit unit
    const widthNoUnit = /רוחב\s+(\d{2,3}(?:[.,]\d{1,2})?)/i;
    const match = widthNoUnit.exec(text);
    if (match) {
        const val = parseFloat(match[1].replace(',', '.'));
        if (isDimensionPlausible('widthCm', val)) {
            result.widthCm = val;
            result.source = match[0];
        }
    }

    // URL-based: "/90-cm" or "/90cm" or "width-90"
    const urlPattern = /(?:width|רוחב)[_-]?(\d{2,3})/i;
    const urlMatch = urlPattern.exec(text);
    if (urlMatch && result.widthCm === null) {
        const val = parseFloat(urlMatch[1]);
        if (isDimensionPlausible('widthCm', val)) {
            result.widthCm = val;
            result.source = urlMatch[0];
        }
    }
}

/** Sanity check: is the value plausible for the given dimension type? */
function isDimensionPlausible(field: 'widthCm' | 'heightCm' | 'depthCm', val: number): boolean {
    switch (field) {
        case 'widthCm':
            return val >= 30 && val <= 200; // refrigerators: 40-120cm common
        case 'heightCm':
            return val >= 50 && val <= 250; // refrigerators: 80-210cm common
        case 'depthCm':
            return val >= 30 && val <= 120; // refrigerators: 50-80cm common
        default:
            return val > 0 && val < 300;
    }
}

/**
 * Parse a dimension range requirement string like "90-100" or "90" from a
 * requirements text. Returns { min, max } or null if no range found.
 */
export function parseDimensionRange(requirements: string | undefined, dimensionLabel: string): { min: number; max: number } | null {
    if (!requirements) return null;

    // Hebrew labels for dimensions
    const labels: Record<string, string[]> = {
        width: ['רוחב', 'width'],
        height: ['גובה', 'height'],
        depth: ['עומק', 'depth'],
    };

    const targetLabels = labels[dimensionLabel] ?? [dimensionLabel];

    for (const label of targetLabels) {
        // Pattern: "רוחב 90-100 ס"מ" or "רוחב 90-100" or "width 90-100 cm"
        const rangePattern = new RegExp(`${label}[:\\s]*?(\\d{2,3}(?:[.,]\\d{1,2})?)\\s*[-–]\\s*(\\d{2,3}(?:[.,]\\d{1,2})?)`, 'i');
        const rangeMatch = rangePattern.exec(requirements);
        if (rangeMatch) {
            return {
                min: parseFloat(rangeMatch[1].replace(',', '.')),
                max: parseFloat(rangeMatch[2].replace(',', '.')),
            };
        }

        // Single value: "רוחב 90 ס"מ"
        const singlePattern = new RegExp(`${label}[:\\s]*?(\\d{2,3}(?:[.,]\\d{1,2})?)`, 'i');
        const singleMatch = singlePattern.exec(requirements);
        if (singleMatch) {
            const val = parseFloat(singleMatch[1].replace(',', '.'));
            return { min: val, max: val };
        }
    }

    return null;
}
