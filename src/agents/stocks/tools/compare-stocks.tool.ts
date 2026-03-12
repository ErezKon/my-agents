import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors} from '../../../utils/log-colors.util';

const TAG = `${LogColors.GREEN}[compare_stocks]${LogColors.RESET}`;

function parseDateToUnix(dateStr: string): number {
    const [day, month, year] = dateStr.split("/").map(Number);
    const date = new Date(year, month - 1, day, 0, 0, 0);
    return Math.floor(date.getTime() / 1000);
}

async function fetchHistory(symbol: string, period1: number, period2: number) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;

    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0",
        },
    });

    if (!response.ok) {
        return {error: `Failed to fetch data for ${symbol}: ${response.status} ${response.statusText}`};
    }

    const data = await response.json();
    const chart = data.chart?.result?.[0];

    if (!chart || !chart.timestamp?.length) {
        return {error: `No data found for ${symbol} in the given date range.`};
    }

    const closes = chart.indicators?.quote?.[0]?.close || [];
    const validCloses = closes.filter((c: number | null) => c != null);

    if (validCloses.length < 2) {
        return {error: `Insufficient data for ${symbol} to calculate performance.`};
    }

    const firstClose = validCloses[0];
    const lastClose = validCloses[validCloses.length - 1];
    const percentChange = Math.round(((lastClose - firstClose) / firstClose) * 10000) / 100;

    const mean = validCloses.reduce((a: number, b: number) => a + b, 0) / validCloses.length;
    const variance = validCloses.reduce((sum: number, c: number) => sum + Math.pow(c - mean, 2), 0) / validCloses.length;
    const stdDev = Math.sqrt(variance);
    const volatility = Math.round((stdDev / mean) * 10000) / 100;

    const high = Math.max(...validCloses);
    const low = Math.min(...validCloses);

    return {
        symbol: chart.meta?.symbol || symbol,
        currency: chart.meta?.currency,
        exchange: chart.meta?.exchangeName,
        dataPoints: validCloses.length,
        startPrice: Math.round(firstClose * 100) / 100,
        endPrice: Math.round(lastClose * 100) / 100,
        percentChange,
        periodHigh: Math.round(high * 100) / 100,
        periodLow: Math.round(low * 100) / 100,
        averageClose: Math.round(mean * 100) / 100,
        volatility,
    };
}

export const createCompareStocksTool = () => tool(
    async ({symbols, startDate, endDate}) => {
        console.log(`${TAG} INPUT: symbols=[${symbols.join(", ")}], startDate=${startDate}, endDate=${endDate || "now"}`);

        const period1 = parseDateToUnix(startDate);
        const period2 = endDate ? parseDateToUnix(endDate) + 86400 : Math.floor(Date.now() / 1000);

        const results = await Promise.all(
            symbols.map(sym => fetchHistory(sym, period1, period2))
        );

        const comparison = symbols.map((sym, i) => ({
            requestedSymbol: sym,
            ...results[i],
        }));

        const result = JSON.stringify({
            startDate,
            endDate: endDate || "today",
            comparison,
        });

        console.log(`${TAG} OUTPUT: compared ${symbols.length} stocks`);
        return result;
    },
    {
        name: "compare_stocks",
        description: "Compare performance of multiple stocks over a date range. Returns side-by-side metrics: percent change, volatility, period high/low, and average close price. Useful for portfolio analysis and benchmarking. For Israeli stocks use the .TA suffix.",
        schema: z.object({
            symbols: z.array(z.string()).describe("List of stock ticker symbols to compare (e.g., ['AAPL', 'MSFT', 'GOOGL'])"),
            startDate: z.string().describe("Start date in dd/MM/yyyy format (e.g., '01/01/2025')"),
            endDate: z.string().optional().describe("End date in dd/MM/yyyy format. If omitted, defaults to today."),
        }),
    }
);
