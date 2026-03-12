import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(222)}[get_stock_yearly_perf]${LogColors.RESET}`;

function parseDateToUnix(day: number, month: number, year: number): number {
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

async function fetchRange(symbol: string, period1: number, period2: number): Promise<any[]> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;

    const response = await fetch(url, {
        headers: {"User-Agent": "Mozilla/5.0"},
    });

    if (!response.ok) {
        throw new Error(`Yahoo Finance failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const chart = data.chart?.result?.[0];
    if (!chart) return [];

    const timestamps = chart.timestamp || [];
    const quote = chart.indicators?.quote?.[0] || {};
    const meta = chart.meta || {};

    return timestamps.map((ts: number, i: number) => ({
        date: formatUnixToDate(ts),
        open: quote.open?.[i] != null ? Math.round(quote.open[i] * 100) / 100 : null,
        close: quote.close?.[i] != null ? Math.round(quote.close[i] * 100) / 100 : null,
        currency: meta.currency,
        exchange: meta.exchangeName,
        symbol: meta.symbol,
    }));
}

export const createGetStockYearlyPerfTool = () => tool(
    async ({symbol, year}) => {
        console.log(`${TAG} INPUT: symbol=${symbol}, year=${year}`);

        const currentYear = new Date().getFullYear();
        const isCurrentYear = year === currentYear;

        try {
            // Fetch first trading days of the year (Jan 1–Jan 20)
            const startP1 = parseDateToUnix(1, 1, year);
            const startP2 = parseDateToUnix(20, 1, year);
            const startDays = await fetchRange(symbol, startP1, startP2);

            // Filter to entries actually in the target year (Yahoo may return a Dec 31 entry due to timezone)
            const startFiltered = startDays.filter((d: any) => d.date.endsWith(`/${year}`));

            if (startFiltered.length === 0) {
                throw new Error(`No trading data found for ${symbol} in January ${year}`);
            }

            const firstDay = startFiltered[0];
            const openValue = firstDay.open;
            const openDate = firstDay.date;

            // Fetch last trading days
            let endDays: any[];
            if (isCurrentYear) {
                // Last 15 calendar days up to today
                const now = Math.floor(Date.now() / 1000);
                const recentStart = now - 15 * 86400;
                endDays = await fetchRange(symbol, recentStart, now);
            } else {
                // Dec 15–Dec 31 of the year
                const endP1 = parseDateToUnix(15, 12, year);
                const endP2 = parseDateToUnix(31, 12, year) + 86400;
                endDays = await fetchRange(symbol, endP1, endP2);
            }

            if (endDays.length === 0) {
                throw new Error(`No trading data found for ${symbol} at end of ${year}`);
            }

            const lastDay = endDays[endDays.length - 1];
            const closeValue = lastDay.close;
            const closeDate = lastDay.date;

            const change = Math.round((closeValue - openValue) * 100) / 100;
            const changePercent = Math.round((change / openValue) * 10000) / 100;

            const result = {
                symbol: firstDay.symbol || symbol,
                year,
                openDate,
                openValue,
                closeDate,
                closeValue,
                change,
                changePercent,
                currency: firstDay.currency || "USD",
                exchange: firstDay.exchange || "",
            };

            console.log(`${TAG} OUTPUT: ${result.symbol} ${year} — ${openValue} → ${closeValue} (${changePercent > 0 ? "+" : ""}${changePercent}%)`);
            return JSON.stringify(result);
        } catch (err: any) {
            const errMsg = err.message || "Unknown error fetching yearly performance";
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }
    },
    {
        name: "get_stock_yearly_perf",
        description: "Get the yearly performance for a stock: opening price on the first trading day of the year and closing price on the last trading day (or the most recent trading day if the current year). Returns absolute and percentage change. For Israeli stocks use the .TA suffix.",
        schema: z.object({
            symbol: z.string().describe("Stock ticker symbol (e.g., 'AAPL', 'MSFT', 'TEVA.TA')"),
            year: z.number().describe("The year to get performance for (e.g., 2025)"),
        }),
    }
);
