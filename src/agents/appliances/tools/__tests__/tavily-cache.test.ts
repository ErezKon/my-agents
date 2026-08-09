import { test, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { tavilySearch as TavilySearchFn } from '../tavily-client.util';

// Set the cache dir + api key BEFORE importing the module under test, because
// the module resolves CACHE_DIR at load time. These run at module eval, which
// is before the async `before` hook that performs the dynamic import.
const CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tavily-cache-test-'));
process.env.TAVILY_CACHE_DIR = CACHE_DIR;
process.env.TAVILY_API_KEY = 'test-key';

let tavilySearch: typeof TavilySearchFn;

before(async () => {
    ({ tavilySearch } = await import('../tavily-client.util'));
});

// --- fetch mock -------------------------------------------------------------
const realFetch = globalThis.fetch;
let fetchCalls = 0;

function installFetchMock() {
    fetchCalls = 0;
    globalThis.fetch = (async () => {
        fetchCalls++;
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
                answer: 'mock answer',
                results: [
                    { title: 'Result 1', url: 'https://example.com/1', content: 'content 1', score: 0.9 },
                    { title: 'Result 2', url: 'https://example.com/2', content: 'content 2', score: 0.8 },
                ],
            }),
            text: async () => '',
        } as any;
    }) as any;
}

function clearCacheDir() {
    for (const f of fs.readdirSync(CACHE_DIR)) {
        fs.rmSync(path.join(CACHE_DIR, f), { force: true });
    }
}

beforeEach(() => {
    installFetchMock();
    clearCacheDir();
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

after(() => {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
});

// --- tests ------------------------------------------------------------------

test('first call for a query is a MISS and hits the network once', async () => {
    const res = await tavilySearch('מקרר Bosch מחיר');
    assert.equal(fetchCalls, 1, 'fetch should be called once on a cache miss');
    assert.equal(res.cached, undefined, 'fresh result should not be flagged cached');
    assert.equal(res.results.length, 2);
});

test('identical query on the second call is a HIT and does NOT hit the network', async () => {
    const first = await tavilySearch('מקרר Bosch מחיר');
    assert.equal(fetchCalls, 1);
    assert.equal(first.cached, undefined);

    const second = await tavilySearch('מקרר Bosch מחיר');
    assert.equal(fetchCalls, 1, 'second identical query must NOT call fetch again');
    assert.equal(second.cached, true, 'second result must be flagged as cached');
    assert.deepEqual(second.results, first.results, 'cached results must match originals');
});

test('repeating the same query many times only hits the network once', async () => {
    for (let i = 0; i < 5; i++) {
        await tavilySearch('דגמים מובילים של Samsung מקרר בישראל 2025');
    }
    assert.equal(fetchCalls, 1, '5 identical queries should result in exactly 1 network call');
});

test('a different query is a separate MISS', async () => {
    await tavilySearch('query one');
    await tavilySearch('query two');
    assert.equal(fetchCalls, 2, 'two distinct queries should produce two network calls');
});

test('same query text but different options uses a different cache entry', async () => {
    await tavilySearch('same text', { maxResults: 6 });
    await tavilySearch('same text', { maxResults: 10 });
    assert.equal(fetchCalls, 2, 'differing options must not collide in the cache');
});

test('a cache file is written to disk on a miss', async () => {
    await tavilySearch('persisted query');
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
    assert.equal(files.length, 1, 'exactly one cache file should be written');

    const saved = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, files[0]), 'utf-8'));
    assert.equal(saved.results.length, 2);
    assert.equal(saved.answer, 'mock answer');
});

test('cache survives a fresh module load (persistent across \'restarts\')', async () => {
    await tavilySearch('query that persists across restart');
    assert.equal(fetchCalls, 1);

    // Re-import with a cache-busting query string to simulate a new process load.
    const mod = await import('../tavily-client.util?reload=' + Date.now());
    const res = await mod.tavilySearch('query that persists across restart');
    assert.equal(fetchCalls, 1, 'a reloaded module should still read the on-disk cache');
    assert.equal(res.cached, true);
});
