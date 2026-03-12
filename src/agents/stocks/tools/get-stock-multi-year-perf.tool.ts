import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(81)}[get_stock_multi_year_perf]${LogColors.RESET}`;

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

async function fetchYearPerf(symbol: string, year: number): Promise<any> {
    const currentYear = new Date().getFullYear();
    const isCurrentYear = year === currentYear;

    // Fetch first trading days of the year (Jan 1–Jan 20)
    const startP1 = parseDateToUnix(1, 1, year);
    const startP2 = parseDateToUnix(20, 1, year);
    const startDays = await fetchRange(symbol, startP1, startP2);
    const startFiltered = startDays.filter((d: any) => d.date.endsWith(`/${year}`));

    if (startFiltered.length === 0) {
        return {year, error: `No trading data found in January ${year}`};
    }

    const firstDay = startFiltered[0];
    const openValue = firstDay.open;
    const openDate = firstDay.date;

    // Fetch last trading days
    let endDays: any[];
    if (isCurrentYear) {
        const now = Math.floor(Date.now() / 1000);
        const recentStart = now - 15 * 86400;
        endDays = await fetchRange(symbol, recentStart, now);
    } else {
        const endP1 = parseDateToUnix(15, 12, year);
        const endP2 = parseDateToUnix(31, 12, year) + 86400;
        endDays = await fetchRange(symbol, endP1, endP2);
    }

    if (endDays.length === 0) {
        return {year, error: `No trading data found at end of ${year}`};
    }

    const lastDay = endDays[endDays.length - 1];
    const closeValue = lastDay.close;
    const closeDate = lastDay.date;

    const change = Math.round((closeValue - openValue) * 100) / 100;
    const changePercent = Math.round((change / openValue) * 10000) / 100;

    return {
        year,
        openDate,
        openValue,
        closeDate,
        closeValue,
        change,
        changePercent,
    };
}

export const createGetStockMultiYearPerfTool = () => tool(
    async ({symbol, startYear, endYear}) => {
        console.log(`${TAG} INPUT: symbol="${symbol}", startYear=${startYear}, endYear=${endYear}`);

        const years: number[] = [];
        for (let y = startYear; y <= endYear; y++) {
            years.push(y);
        }

        if (years.length > 20) {
            const errMsg = "Range too large. Maximum 20 years at a time.";
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const results = [];
        for (const year of years) {
            try {
                const perf = await fetchYearPerf(symbol, year);
                results.push(perf);
            } catch (err: any) {
                results.push({year, error: err.message || "Unknown error"});
            }
        }

        // Compute cumulative performance
        const validResults = results.filter(r => !r.error);
        let cumulativeChange: number | null = null;
        if (validResults.length >= 2) {
            const firstOpen = validResults[0].openValue;
            const lastClose = validResults[validResults.length - 1].closeValue;
            if (firstOpen && lastClose) {
                cumulativeChange = Math.round(((lastClose - firstOpen) / firstOpen) * 10000) / 100;
            }
        }

        const result = JSON.stringify({
            symbol,
            startYear,
            endYear,
            yearCount: years.length,
            years: results,
            cumulativeChangePercent: cumulativeChange,
        });

        console.log(`${TAG} OUTPUT: ${symbol} ${startYear}-${endYear} (${results.length} years, cumulative=${cumulativeChange}%)`);
        return result;
    },
    {
        name: "get_stock_multi_year_perf",
        description: "Get year-by-year performance for a stock across multiple years in one call. Returns each year's open, close, change, and percent change, plus an overall cumulative change. For Israeli stocks use the .TA suffix.",
        schema: z.object({
            symbol: z.string().describe("Stock ticker symbol (e.g., 'AAPL', 'MSFT', 'TEVA.TA')"),
            startYear: z.number().describe("First year of the range (e.g., 2020)"),
            endYear: z.number().describe("Last year of the range (e.g., 2025)"),
        }),
    }
);
