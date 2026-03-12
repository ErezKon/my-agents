import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(51)}[get_index_quote]${LogColors.RESET}`;

const KNOWN_INDICES: Record<string, string> = {
    "^GSPC": "S&P 500",
    "^IXIC": "NASDAQ Composite",
    "^DJI": "Dow Jones Industrial Average",
    "^TA35.TA": "TA-35 (Tel Aviv)",
    "^TA125.TA": "TA-125 (Tel Aviv)",
};

export const createGetIndexQuoteTool = () => tool(
    async ({indexSymbol}) => {
        const symbols = indexSymbol === "all"
            ? Object.keys(KNOWN_INDICES)
            : [indexSymbol];

        console.log(`${TAG} INPUT: indexSymbol="${indexSymbol}" → fetching [${symbols.join(", ")}]`);

        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.map(s => encodeURIComponent(s)).join(",")}`;

        const response = await fetch(url, {
            headers: {"User-Agent": "Mozilla/5.0"},
        });

        if (!response.ok) {
            const errMsg = `Failed to fetch index quote: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();
        const results = (data.quoteResponse?.result || []).map((q: any) => ({
            symbol: q.symbol,
            name: KNOWN_INDICES[q.symbol] || q.shortName || q.longName,
            price: q.regularMarketPrice,
            change: q.regularMarketChange != null ? Math.round(q.regularMarketChange * 100) / 100 : null,
            changePercent: q.regularMarketChangePercent != null ? Math.round(q.regularMarketChangePercent * 100) / 100 : null,
            previousClose: q.regularMarketPreviousClose,
            open: q.regularMarketOpen,
            dayHigh: q.regularMarketDayHigh,
            dayLow: q.regularMarketDayLow,
            volume: q.regularMarketVolume,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow,
        }));

        const result = JSON.stringify({count: results.length, indices: results});
        console.log(`${TAG} OUTPUT: fetched ${results.length} index quotes`);
        return result;
    },
    {
        name: "get_index_quote",
        description: `Get current quotes for major market indices. Supported symbols: ${Object.entries(KNOWN_INDICES).map(([k, v]) => `${k} (${v})`).join(", ")}. Pass "all" to fetch all indices at once. Use this to benchmark a stock against the broader market.`,
        schema: z.object({
            indexSymbol: z.string().describe('Index symbol (e.g., "^GSPC", "^IXIC", "^DJI", "^TA35.TA", "^TA125.TA") or "all" for all major indices'),
        }),
    }
);
