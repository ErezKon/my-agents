import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(220)}[get_stock_news]${LogColors.RESET}`;

export const createGetStockNewsTool = () => tool(
    async ({symbol, count}) => {
        console.log(`${TAG} INPUT: symbol="${symbol}", count=${count}`);

        const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=${count}&quotesCount=0&listsCount=0`;

        const response = await fetch(url, {
            headers: {"User-Agent": "Mozilla/5.0"},
        });

        if (!response.ok) {
            const errMsg = `Failed to fetch stock news: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();
        const newsItems = (data.news || []).slice(0, count).map((item: any) => ({
            title: item.title,
            publisher: item.publisher,
            link: item.link,
            publishedAt: item.providerPublishTime
                ? new Date(item.providerPublishTime * 1000).toISOString()
                : null,
            relatedSymbols: (item.relatedTickers || []).slice(0, 5),
        }));

        const result = JSON.stringify({
            symbol,
            count: newsItems.length,
            news: newsItems,
        });

        console.log(`${TAG} OUTPUT: ${newsItems.length} news items for ${symbol}`);
        return result;
    },
    {
        name: "get_stock_news",
        description: "Get recent news headlines for a stock symbol from Yahoo Finance. Returns titles, publishers, links, and publication dates. Useful for explaining price moves or providing context on recent events.",
        schema: z.object({
            symbol: z.string().describe("Stock ticker symbol (e.g., 'AAPL', 'TSLA', 'TEVA.TA')"),
            count: z.number().default(5).describe("Number of news items to return (default 5, max 20)"),
        }),
    }
);
