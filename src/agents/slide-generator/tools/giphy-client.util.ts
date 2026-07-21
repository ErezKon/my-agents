import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { LogColors, color256 } from '../../../utils/log-colors.util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GIPHY_SEARCH_URL = 'https://api.giphy.com/v1/gifs/search';
const CACHE_DIR = process.env.GIPHY_CACHE_DIR
    ? path.resolve(process.env.GIPHY_CACHE_DIR)
    : path.resolve(__dirname, '../cache/giphy');
const TAG = `${color256(201)}[giphy]${LogColors.RESET}`;

export interface GiphyResult {
    /** Direct URL to the gif image (downsized for embedding). */
    gifUrl: string;
    /** Direct URL to a static frame (first frame as jpg/png). */
    stillUrl: string;
    /** Title of the gif. */
    title: string;
    /** Full Giphy page URL. */
    pageUrl: string;
    /** Width in pixels (of the downsized version). */
    width: number;
    /** Height in pixels (of the downsized version). */
    height: number;
}

export interface GiphySearchOutput {
    results: GiphyResult[];
    error?: string;
    cached?: boolean;
}

function cacheKey(query: string, options: Record<string, any>): string {
    const payload = JSON.stringify({ query, ...options });
    return crypto.createHash('sha256').update(payload).digest('hex');
}

function readCache(key: string): GiphySearchOutput | null {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GiphySearchOutput;
    } catch {
        return null;
    }
}

function writeCache(key: string, data: GiphySearchOutput): void {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Search Giphy for gifs matching a query.
 * Reads the API key from process.env.GIPHY_API_KEY.
 */
export async function giphySearch(
    query: string,
    options: {
        limit?: number;
        rating?: 'g' | 'pg' | 'pg-13' | 'r';
    } = {}
): Promise<GiphySearchOutput> {
    const resolvedOptions = {
        limit: options.limit ?? 6,
        rating: options.rating ?? 'pg',
    };

    const key = cacheKey(query, resolvedOptions);
    console.log(`${TAG} query="${query}" limit=${resolvedOptions.limit}`);

    const cached = readCache(key);
    if (cached) {
        console.log(`${TAG} CACHE HIT (${cached.results.length} results)`);
        return { ...cached, cached: true };
    }
    console.log(`${TAG} CACHE MISS — calling Giphy API`);

    const apiKey = process.env.GIPHY_API_KEY;
    if (!apiKey) {
        return { results: [], error: 'GIPHY_API_KEY is not configured in the environment.' };
    }

    try {
        const params = new URLSearchParams({
            api_key: apiKey,
            q: query,
            limit: String(resolvedOptions.limit),
            rating: resolvedOptions.rating,
        });

        const response = await fetch(`${GIPHY_SEARCH_URL}?${params}`, {
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { results: [], error: `Giphy request failed: ${response.status} ${response.statusText} ${text}` };
        }

        const data: any = await response.json();
        const results: GiphyResult[] = (data.data || []).map((gif: any) => {
            const downsized = gif.images?.downsized_medium ?? gif.images?.downsized ?? gif.images?.original;
            const still = gif.images?.downsized_still ?? gif.images?.original_still;
            return {
                gifUrl: downsized?.url ?? '',
                stillUrl: still?.url ?? '',
                title: gif.title ?? '',
                pageUrl: gif.url ?? '',
                width: parseInt(downsized?.width, 10) || 0,
                height: parseInt(downsized?.height, 10) || 0,
            };
        }).filter((r: GiphyResult) => r.gifUrl);

        const output: GiphySearchOutput = { results };
        writeCache(key, output);
        console.log(`${TAG} Saved to cache (${results.length} results)`);
        return output;
    } catch (err: any) {
        return { results: [], error: `Giphy request error: ${err.message}` };
    }
}
