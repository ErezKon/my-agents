import * as fs from 'fs';
import * as path from 'path';
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { tavilySearch } from './tavily-client.util';

const TAG = `${color256(51)}[product-image]${LogColors.RESET}`;

/** Accepted image content-types and their file extensions. */
const IMAGE_TYPES: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
};

export interface ProductImage {
    /** Remote URL of the image. */
    url: string;
    /** Local file path where the image was downloaded. */
    localPath: string;
    /** Image file buffer (for embedding in Excel / PDF). */
    buffer: Buffer;
}

/**
 * Sanitize a string for use as a filename.
 */
function safeFilename(s: string): string {
    return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

/**
 * Download an image from a URL. Returns the buffer and detected extension,
 * or null if the download fails or the response isn't an image.
 */
async function downloadImage(url: string): Promise<{ buffer: Buffer; ext: string } | null> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ApplianceBot/1.0)' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return null;

        const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const ext = IMAGE_TYPES[ct];
        if (!ext) return null;

        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        if (buffer.length < 2_000) return null; // skip tiny/broken images
        return { buffer, ext };
    } catch {
        return null;
    }
}

/**
 * Search for a product image using Tavily, download the best match,
 * and save it to the output directory.
 *
 * Returns a ProductImage or null if no usable image was found.
 */
export async function fetchProductImage(
    brand: string,
    model: string,
    outputDir: string,
): Promise<ProductImage | null> {
    const query = `${brand} ${model} product photo official`;
    console.log(`${TAG} Searching image for ${brand} ${model}`);

    const { images, error } = await tavilySearch(query, {
        maxResults: 3,
        searchDepth: 'basic',
        includeAnswer: false,
        includeImages: true,
    });

    if (error || !images?.length) {
        console.log(`${TAG} No images found for ${brand} ${model}`);
        return null;
    }

    // Try each image URL until one downloads successfully
    for (const url of images.slice(0, 5)) {
        const result = await downloadImage(url);
        if (!result) continue;

        const imagesDir = path.join(outputDir, 'images');
        fs.mkdirSync(imagesDir, { recursive: true });

        const filename = `${safeFilename(brand)}-${safeFilename(model)}${result.ext}`;
        const localPath = path.join(imagesDir, filename);
        fs.writeFileSync(localPath, result.buffer);

        console.log(`${TAG} Downloaded ${brand} ${model} → ${filename} (${(result.buffer.length / 1024).toFixed(0)} KB)`);
        return { url, localPath, buffer: result.buffer };
    }

    console.log(`${TAG} All image URLs failed for ${brand} ${model}`);
    return null;
}

/**
 * Fetch images for multiple models in parallel.
 * Returns a Map from "brand|model" key to ProductImage.
 */
export async function fetchAllProductImages(
    models: { brand: string; model: string }[],
    outputDir: string,
): Promise<Map<string, ProductImage>> {
    const map = new Map<string, ProductImage>();

    const results = await Promise.allSettled(
        models.map(async (m) => {
            const img = await fetchProductImage(m.brand, m.model, outputDir);
            return { key: `${m.brand}|${m.model}`, img };
        })
    );

    for (const r of results) {
        if (r.status === 'fulfilled' && r.value.img) {
            map.set(r.value.key, r.value.img);
        }
    }

    console.log(`${TAG} Fetched ${map.size}/${models.length} product images`);
    return map;
}
