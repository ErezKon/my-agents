import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors} from '../../../utils/log-colors.util';

const TAG = `${LogColors.MAGENTA}[get_stock_history]${LogColors.RESET}`;

function parseDateToUnix(dateStr: string): number {
    const [day, month, year] = dateStr.split("/").map(Number);
    const date = new Date(year, month - 1, day, 0, 0, 0);
    return Math.floor(date.getTime() / 1000);
}

function formatUnixToDate(unix: number): string {
    const date = new Date(unix * 1000);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

export const createGetStockHistoryTool = () => tool(
    async ({symbol, startDate, endDate}) => {
        console.log(`${TAG} INPUT: symbol=${symbol}, startDate=${startDate}, endDate=${endDate || "now"}`);

        const period1 = parseDateToUnix(startDate);
        const period2 = endDate ? parseDateToUnix(endDate) + 86400 : Math.floor(Date.now() / 1000);

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;

        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
            },
        });

        if (!response.ok) {
            const errMsg = `Failed to fetch stock history: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();
        const chart = data.chart?.result?.[0];

        if (!chart) {
            const errMsg = "No data found for the given symbol and date range.";
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const timestamps = chart.timestamp || [];
        const quote = chart.indicators?.quote?.[0] || {};
        const meta = chart.meta || {};

        const history = timestamps.map((ts: number, i: number) => ({
            date: formatUnixToDate(ts),
            open: quote.open?.[i] != null ? Math.round(quote.open[i] * 100) / 100 : null,
            high: quote.high?.[i] != null ? Math.round(quote.high[i] * 100) / 100 : null,
            low: quote.low?.[i] != null ? Math.round(quote.low[i] * 100) / 100 : null,
            close: quote.close?.[i] != null ? Math.round(quote.close[i] * 100) / 100 : null,
            volume: quote.volume?.[i] ?? null,
        }));

        const result = JSON.stringify({
            symbol: meta.symbol,
            currency: meta.currency,
            exchange: meta.exchangeName,
            dataPoints: history.length,
            history,
        });

        console.log(`${TAG} OUTPUT: ${history.length} data points for ${meta.symbol}`);
        return result;
    },
    {
        name: "get_stock_history",
        description: "Fetch historical stock data (open, high, low, close, volume) for a given symbol and date range. Dates must be in dd/MM/yyyy format. If endDate is omitted, data is fetched up to today. For a single day, set startDate and endDate to the same date. For Israeli stocks use the .TA suffix (e.g., TEVA.TA).",
        schema: z.object({
            symbol: z.string().describe("Stock ticker symbol (e.g., 'AAPL', 'MSFT', 'TEVA.TA' for Israeli stocks)"),
            startDate: z.string().describe("Start date in dd/MM/yyyy format (e.g., '01/01/2025')"),
            endDate: z.string().optional().describe("End date in dd/MM/yyyy format (e.g., '31/01/2025'). If omitted, defaults to today."),
        }),
    }
);
