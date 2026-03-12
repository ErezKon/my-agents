import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors} from '../../../utils/log-colors.util';

const TAG = `${LogColors.BLUE}[search_stock]${LogColors.RESET}`;

export const createSearchStockTool = () => tool(
    async ({query}) => {
        console.log(`${TAG} INPUT: query="${query}"`);

        const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0`;

        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
            },
        });

        if (!response.ok) {
            const errMsg = `Failed to search stocks: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();
        const quotes = (data.quotes || []).map((q: any) => ({
            symbol: q.symbol,
            name: q.shortname || q.longname,
            type: q.quoteType,
            exchange: q.exchange,
            exchangeDisplay: q.exchDisp,
            market: q.symbol?.endsWith(".TA") ? "Israeli (TASE)" : "US",
        }));

        const result = JSON.stringify({
            count: quotes.length,
            results: quotes,
        });

        console.log(`${TAG} OUTPUT: found ${quotes.length} results`);
        return result;
    },
    {
        name: "search_stock",
        description: "Search for a stock by company name or keyword. Returns matching ticker symbols with exchange info. Use this to resolve a company name to its ticker symbol. For Israeli stocks, results will include symbols ending in .TA (Tel Aviv Stock Exchange).",
        schema: z.object({
            query: z.string().describe("Company name, keyword, or partial symbol to search for (e.g., 'Apple', 'Teva', 'AAPL')"),
        }),
    }
);
