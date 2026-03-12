import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(46)}[get_market_movers]${LogColors.RESET}`;

const SCREENER_IDS: Record<string, string> = {
    gainers: "day_gainers",
    losers: "day_losers",
    most_active: "most_actives",
};

export const createGetMarketMoversTool = () => tool(
    async ({category, count}) => {
        console.log(`${TAG} INPUT: category="${category}", count=${count}`);

        const scrId = SCREENER_IDS[category];
        if (!scrId) {
            const errMsg = `Unknown category "${category}". Use one of: gainers, losers, most_active.`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${scrId}&count=${count}`;

        const response = await fetch(url, {
            headers: {"User-Agent": "Mozilla/5.0"},
        });

        if (!response.ok) {
            const errMsg = `Failed to fetch market movers: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();
        const quotes = data.finance?.result?.[0]?.quotes || [];

        const movers = quotes.slice(0, count).map((q: any) => ({
            symbol: q.symbol,
            name: q.shortName || q.longName,
            price: q.regularMarketPrice,
            change: q.regularMarketChange != null ? Math.round(q.regularMarketChange * 100) / 100 : null,
            changePercent: q.regularMarketChangePercent != null ? Math.round(q.regularMarketChangePercent * 100) / 100 : null,
            volume: q.regularMarketVolume,
            marketCap: q.marketCap,
        }));

        const result = JSON.stringify({
            category,
            count: movers.length,
            movers,
        });

        console.log(`${TAG} OUTPUT: ${movers.length} ${category}`);
        return result;
    },
    {
        name: "get_market_movers",
        description: "Get today's top market movers from Yahoo Finance: top gainers, top losers, or most actively traded stocks. Useful for daily market recaps and discovering trending stocks.",
        schema: z.object({
            category: z.enum(["gainers", "losers", "most_active"]).describe("Category of movers to fetch"),
            count: z.number().default(10).describe("Number of results to return (default 10, max 25)"),
        }),
    }
);
