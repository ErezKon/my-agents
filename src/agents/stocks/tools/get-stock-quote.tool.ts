import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors} from '../../../utils/log-colors.util';

const TAG = `${LogColors.BRIGHT_CYAN}[get_stock_quote]${LogColors.RESET}`;

export const createGetStockQuoteTool = () => tool(
    async ({symbol}) => {
        console.log(`${TAG} INPUT: symbol=${symbol}`);

        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;

        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
            },
        });

        if (!response.ok) {
            const errMsg = `Failed to fetch stock quote: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();
        const q = data.quoteResponse?.result?.[0];

        if (!q) {
            const errMsg = `No quote data found for symbol "${symbol}".`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const result = JSON.stringify({
            symbol: q.symbol,
            name: q.shortName || q.longName,
            exchange: q.fullExchangeName,
            currency: q.currency,
            market: q.symbol?.endsWith(".TA") ? "Israeli (TASE)" : "US",
            price: q.regularMarketPrice,
            change: q.regularMarketChange != null ? Math.round(q.regularMarketChange * 100) / 100 : null,
            changePercent: q.regularMarketChangePercent != null ? Math.round(q.regularMarketChangePercent * 100) / 100 : null,
            previousClose: q.regularMarketPreviousClose,
            open: q.regularMarketOpen,
            dayHigh: q.regularMarketDayHigh,
            dayLow: q.regularMarketDayLow,
            volume: q.regularMarketVolume,
            avgVolume: q.averageDailyVolume3Month,
            marketCap: q.marketCap,
            peRatio: q.trailingPE != null ? Math.round(q.trailingPE * 100) / 100 : null,
            forwardPE: q.forwardPE != null ? Math.round(q.forwardPE * 100) / 100 : null,
            eps: q.epsTrailingTwelveMonths != null ? Math.round(q.epsTrailingTwelveMonths * 100) / 100 : null,
            dividendYield: q.trailingAnnualDividendYield != null ? Math.round(q.trailingAnnualDividendYield * 10000) / 100 : null,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow,
            fiftyDayAvg: q.fiftyDayAverage != null ? Math.round(q.fiftyDayAverage * 100) / 100 : null,
            twoHundredDayAvg: q.twoHundredDayAverage != null ? Math.round(q.twoHundredDayAverage * 100) / 100 : null,
            beta: q.beta != null ? Math.round(q.beta * 100) / 100 : null,
        });

        console.log(`${TAG} OUTPUT: ${q.symbol} @ ${q.regularMarketPrice} ${q.currency}`);
        return result;
    },
    {
        name: "get_stock_quote",
        description: "Get the current/latest stock quote with key metrics: price, change, market cap, PE ratio, 52-week range, volume, EPS, dividend yield, beta, and moving averages. For Israeli stocks use the .TA suffix (e.g., TEVA.TA).",
        schema: z.object({
            symbol: z.string().describe("Stock ticker symbol (e.g., 'AAPL', 'GOOGL', 'NICE.TA' for Israeli stocks)"),
        }),
    }
);
