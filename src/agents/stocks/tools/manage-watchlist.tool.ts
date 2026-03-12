import {tool} from "@langchain/core/tools";
import {z} from "zod";
import * as fs from "fs";
import * as path from "path";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(228)}[manage_watchlist]${LogColors.RESET}`;
const WATCHLISTS_DIR = path.resolve(__dirname, "../../../../outputs/watchlists");

interface Watchlist {
    name: string;
    symbols: string[];
    createdAt: string;
    updatedAt: string;
}

function getWatchlistPath(name: string): string {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    return path.join(WATCHLISTS_DIR, `${safeName}.json`);
}

function loadWatchlist(name: string): Watchlist | null {
    const filePath = getWatchlistPath(name);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function saveWatchlist(watchlist: Watchlist): void {
    fs.mkdirSync(WATCHLISTS_DIR, {recursive: true});
    const filePath = getWatchlistPath(watchlist.name);
    watchlist.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(watchlist, null, 2), "utf-8");
}

function listAllWatchlists(): string[] {
    if (!fs.existsSync(WATCHLISTS_DIR)) return [];
    return fs.readdirSync(WATCHLISTS_DIR)
        .filter(f => f.endsWith(".json"))
        .map(f => {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(WATCHLISTS_DIR, f), "utf-8"));
                return data.name;
            } catch {
                return f.replace(".json", "");
            }
        });
}

async function fetchBatchQuotes(symbols: string[]): Promise<any[]> {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.map(s => encodeURIComponent(s)).join(",")}`;
    const response = await fetch(url, {
        headers: {"User-Agent": "Mozilla/5.0"},
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch batch quotes: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return (data.quoteResponse?.result || []).map((q: any) => ({
        symbol: q.symbol,
        name: q.shortName || q.longName,
        price: q.regularMarketPrice,
        change: q.regularMarketChange != null ? Math.round(q.regularMarketChange * 100) / 100 : null,
        changePercent: q.regularMarketChangePercent != null ? Math.round(q.regularMarketChangePercent * 100) / 100 : null,
        volume: q.regularMarketVolume,
        marketCap: q.marketCap,
    }));
}

export const createManageWatchlistTool = () => tool(
    async ({action, name, symbols}) => {
        console.log(`${TAG} INPUT: action="${action}", name="${name || ""}", symbols=[${(symbols || []).join(", ")}]`);

        try {
            switch (action) {
                case "create": {
                    if (!name) return JSON.stringify({error: "Watchlist name is required for 'create' action."});
                    const existing = loadWatchlist(name);
                    if (existing) return JSON.stringify({error: `Watchlist "${name}" already exists. Use 'add' to add symbols.`});
                    const watchlist: Watchlist = {
                        name,
                        symbols: symbols || [],
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    };
                    saveWatchlist(watchlist);
                    console.log(`${TAG} OUTPUT: created watchlist "${name}" with ${watchlist.symbols.length} symbols`);
                    return JSON.stringify({success: true, action: "created", watchlist});
                }

                case "add": {
                    if (!name) return JSON.stringify({error: "Watchlist name is required for 'add' action."});
                    const watchlist = loadWatchlist(name);
                    if (!watchlist) return JSON.stringify({error: `Watchlist "${name}" not found. Use 'create' first.`});
                    const newSymbols = (symbols || []).filter(s => !watchlist.symbols.includes(s));
                    watchlist.symbols.push(...newSymbols);
                    saveWatchlist(watchlist);
                    console.log(`${TAG} OUTPUT: added ${newSymbols.length} symbols to "${name}"`);
                    return JSON.stringify({success: true, action: "added", added: newSymbols, watchlist});
                }

                case "remove": {
                    if (!name) return JSON.stringify({error: "Watchlist name is required for 'remove' action."});
                    const watchlist = loadWatchlist(name);
                    if (!watchlist) return JSON.stringify({error: `Watchlist "${name}" not found.`});
                    const toRemove = new Set(symbols || []);
                    const removed = watchlist.symbols.filter(s => toRemove.has(s));
                    watchlist.symbols = watchlist.symbols.filter(s => !toRemove.has(s));
                    saveWatchlist(watchlist);
                    console.log(`${TAG} OUTPUT: removed ${removed.length} symbols from "${name}"`);
                    return JSON.stringify({success: true, action: "removed", removed, watchlist});
                }

                case "list": {
                    if (name) {
                        const watchlist = loadWatchlist(name);
                        if (!watchlist) return JSON.stringify({error: `Watchlist "${name}" not found.`});
                        return JSON.stringify({watchlist});
                    }
                    const allNames = listAllWatchlists();
                    return JSON.stringify({watchlists: allNames, count: allNames.length});
                }

                case "quotes": {
                    if (!name) return JSON.stringify({error: "Watchlist name is required for 'quotes' action."});
                    const watchlist = loadWatchlist(name);
                    if (!watchlist) return JSON.stringify({error: `Watchlist "${name}" not found.`});
                    if (watchlist.symbols.length === 0) return JSON.stringify({error: `Watchlist "${name}" is empty.`});
                    const quotes = await fetchBatchQuotes(watchlist.symbols);
                    console.log(`${TAG} OUTPUT: fetched ${quotes.length} quotes for watchlist "${name}"`);
                    return JSON.stringify({watchlistName: name, count: quotes.length, quotes});
                }

                default:
                    return JSON.stringify({error: `Unknown action "${action}". Use: create, add, remove, list, quotes.`});
            }
        } catch (err: any) {
            const errMsg = err.message || "Unknown error managing watchlist";
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }
    },
    {
        name: "manage_watchlist",
        description: "Manage persistent stock watchlists. Actions: 'create' (new watchlist with optional symbols), 'add' (add symbols to existing), 'remove' (remove symbols), 'list' (show all watchlists or a specific one), 'quotes' (fetch current quotes for all symbols in a watchlist).",
        schema: z.object({
            action: z.enum(["create", "add", "remove", "list", "quotes"]).describe("Action to perform"),
            name: z.string().optional().describe("Watchlist name (e.g., 'tech', 'dividends', 'my-portfolio')"),
            symbols: z.array(z.string()).optional().describe("Stock symbols to add/remove (e.g., ['AAPL', 'MSFT'])"),
        }),
    }
);
