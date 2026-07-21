import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { LogColors, color256 } from '../../../utils/log-colors.util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
// Cache directory. Defaults to the agent's local cache folder, overridable via
// TAVILY_CACHE_DIR (used by tests to avoid polluting the real cache).
const CACHE_DIR = process.env.TAVILY_CACHE_DIR
    ? path.resolve(process.env.TAVILY_CACHE_DIR)
    : path.resolve(__dirname, '../cache');
const TAG = `${color256(63)}[tavily-cache]${LogColors.RESET}`;

export interface TavilyResult {
    title: string;
    url: string;
    content: string;
    score?: number;
}

export interface TavilySearchOutput {
    answer?: string;
    results: TavilyResult[];
    images?: string[];
    error?: string;
    cached?: boolean;
}

function cacheKey(query: string, options: Record<string, any>): string {
    const payload = JSON.stringify({ query, ...options });
    return crypto.createHash('sha256').update(payload).digest('hex');
}

function readCache(key: string): TavilySearchOutput | null {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as TavilySearchOutput;
    } catch {
        return null;
    }
}

function writeCache(key: string, data: TavilySearchOutput): void {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Minimal Tavily Search REST client with file-based caching.
 * Reads the API key from process.env.TAVILY_API_KEY.
 */
export async function tavilySearch(
    query: string,
    options: {
        maxResults?: number;
        searchDepth?: 'basic' | 'advanced';
        includeAnswer?: boolean;
        includeImages?: boolean;
        includeDomains?: string[];
        excludeDomains?: string[];
    } = {}
): Promise<TavilySearchOutput> {
    const resolvedOptions = {
        searchDepth: options.searchDepth ?? 'advanced',
        maxResults: options.maxResults ?? 6,
        includeAnswer: options.includeAnswer ?? true,
        includeImages: options.includeImages ?? false,
        includeDomains: options.includeDomains ?? [],
        excludeDomains: options.excludeDomains ?? [],
    };

    const key = cacheKey(query, resolvedOptions);
    const cachePath = path.join(CACHE_DIR, `${key}.json`);
    console.log(`${TAG} query="${query}"`);
    console.log(`${TAG} key=${key} path=${cachePath}`);
    const cached = readCache(key);
    if (cached) {
        console.log(`${TAG} CACHE HIT`);
        return { ...cached, cached: true };
    }
    console.log(`${TAG} CACHE MISS — calling Tavily API`);

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        return { results: [], error: 'TAVILY_API_KEY is not configured in the environment.' };
    }

    try {
        const response = await fetch(TAVILY_SEARCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                query,
                search_depth: resolvedOptions.searchDepth,
                max_results: resolvedOptions.maxResults,
                include_answer: resolvedOptions.includeAnswer,
                include_images: resolvedOptions.includeImages,
                include_domains: resolvedOptions.includeDomains,
                exclude_domains: resolvedOptions.excludeDomains,
            }),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { results: [], error: `Tavily request failed: ${response.status} ${response.statusText} ${text}` };
        }

        const data: any = await response.json();
        const results: TavilyResult[] = (data.results || []).map((r: any) => ({
            title: r.title,
            url: r.url,
            content: r.content,
            score: r.score,
        }));

        const images: string[] = Array.isArray(data.images)
            ? data.images.map((img: any) => typeof img === 'string' ? img : img?.url).filter(Boolean)
            : [];
        const output: TavilySearchOutput = { answer: data.answer, results, ...(images.length ? { images } : {}) };
        writeCache(key, output);
        console.log(`${TAG} Saved to cache (key=${key.slice(0, 12)}, ${results.length} results)`);
        return output;
    } catch (err: any) {
        return { results: [], error: `Tavily request error: ${err.message}` };
    }
}
