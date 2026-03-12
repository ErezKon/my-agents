import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(34)}[get_dividend_history]${LogColors.RESET}`;

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

export const createGetDividendHistoryTool = () => tool(
    async ({symbol, startDate, endDate}) => {
        console.log(`${TAG} INPUT: symbol="${symbol}", startDate=${startDate}, endDate=${endDate || "now"}`);

        const period1 = startDate ? parseDateToUnix(startDate) : Math.floor(Date.now() / 1000) - 5 * 365 * 86400;
        const period2 = endDate ? parseDateToUnix(endDate) + 86400 : Math.floor(Date.now() / 1000);

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=dividends`;

        const response = await fetch(url, {
            headers: {"User-Agent": "Mozilla/5.0"},
        });

        if (!response.ok) {
            const errMsg = `Failed to fetch dividend history: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();
        const chart = data.chart?.result?.[0];

        if (!chart) {
            const errMsg = `No chart data found for ${symbol}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const meta = chart.meta || {};
        const dividendEvents = chart.events?.dividends || {};

        const dividends = Object.entries(dividendEvents)
            .map(([timestamp, div]: [string, any]) => ({
                date: formatUnixToDate(Number(timestamp)),
                amount: Math.round(div.amount * 10000) / 10000,
                unixTimestamp: Number(timestamp),
            }))
            .sort((a, b) => a.unixTimestamp - b.unixTimestamp)
            .map(({date, amount}) => ({date, amount}));

        // Compute annual totals
        const annualTotals: Record<number, number> = {};
        for (const div of dividends) {
            const year = Number(div.date.split("/")[2]);
            annualTotals[year] = (annualTotals[year] || 0) + div.amount;
        }

        const annualSummary = Object.entries(annualTotals)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([year, total]) => ({
                year: Number(year),
                totalDividend: Math.round(total * 10000) / 10000,
            }));

        const result = JSON.stringify({
            symbol: meta.symbol || symbol,
            currency: meta.currency || "USD",
            exchange: meta.exchangeName || "",
            totalPayments: dividends.length,
            dividends,
            annualSummary,
        });

        console.log(`${TAG} OUTPUT: ${dividends.length} dividend payments for ${symbol}`);
        return result;
    },
    {
        name: "get_dividend_history",
        description: "Fetch historical dividend payments for a stock including ex-dates and amounts. Also computes annual dividend totals. For Israeli stocks use the .TA suffix. If no startDate is provided, defaults to the last 5 years.",
        schema: z.object({
            symbol: z.string().describe("Stock ticker symbol (e.g., 'AAPL', 'MSFT', 'JNJ')"),
            startDate: z.string().optional().describe("Start date in dd/MM/yyyy format (e.g., '01/01/2020'). Defaults to 5 years ago."),
            endDate: z.string().optional().describe("End date in dd/MM/yyyy format. Defaults to today."),
        }),
    }
);
