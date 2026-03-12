import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(177)}[get_tase_yearly_perf]${LogColors.RESET}`;

const TASE_API_BASE = "https://api.tase.co.il/api";

const TASE_HEADERS: Record<string, string> = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
    "Origin": "https://market.tase.co.il",
    "Referer": "https://market.tase.co.il/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
};

async function fetchTaseRange(securityId: string, fromISO: string, toISO: string): Promise<any[]> {
    const url = `${TASE_API_BASE}/security/historyeod`;
    const body = {
        dFrom: fromISO,
        dTo: toISO,
        oId: securityId,
        pageNum: 1,
        pType: "8",
        TotalRec: 1,
        lang: "1",
    };

    const response = await fetch(url, {
        method: "POST",
        headers: TASE_HEADERS,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`TASE history failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const items = data.Items || data.items || [];

    return items.map((item: any) => ({
        date: item.TradeDate || "",
        open: item.OpenRate ?? null,
        close: item.CloseRate ?? item.BaseRate ?? null,
    }));
}

export const createGetTaseYearlyPerfTool = () => tool(
    async ({securityId, year}) => {
        console.log(`${TAG} INPUT: securityId=${securityId}, year=${year}`);

        const currentYear = new Date().getFullYear();
        const isCurrentYear = year === currentYear;

        try {
            // Fetch first trading days of the year (Jan 1–Jan 20)
            const startDays = await fetchTaseRange(securityId, `${year}-01-01`, `${year}-01-20`);

            // TASE returns items in reverse chronological order (newest first)
            if (startDays.length === 0) {
                throw new Error(`No trading data found for TASE ID ${securityId} in January ${year}`);
            }

            const firstDay = startDays[startDays.length - 1];
            const openValue = firstDay.open;
            const openDate = firstDay.date;

            // Fetch last trading days
            let endDays: any[];
            if (isCurrentYear) {
                // Last 15 calendar days
                const now = new Date();
                const recent = new Date(now.getTime() - 15 * 86400000);
                const fromISO = `${recent.getFullYear()}-${String(recent.getMonth() + 1).padStart(2, "0")}-${String(recent.getDate()).padStart(2, "0")}`;
                const toISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                endDays = await fetchTaseRange(securityId, fromISO, toISO);
            } else {
                // Dec 15–Dec 31
                endDays = await fetchTaseRange(securityId, `${year}-12-15`, `${year}-12-31`);
            }

            if (endDays.length === 0) {
                throw new Error(`No trading data found for TASE ID ${securityId} at end of ${year}`);
            }

            // TASE returns newest first, so index 0 is the most recent
            const lastDay = endDays[0];
            const closeValue = lastDay.close;
            const closeDate = lastDay.date;

            const change = Math.round((closeValue - openValue) * 100) / 100;
            const changePercent = Math.round((change / openValue) * 10000) / 100;

            const result = {
                securityId,
                year,
                openDate,
                openValue,
                closeDate,
                closeValue,
                change,
                changePercent,
                currency: "ILS",
                exchange: "TASE",
            };

            console.log(`${TAG} OUTPUT: TASE ${securityId} ${year} — ${openValue} → ${closeValue} (${changePercent > 0 ? "+" : ""}${changePercent}%)`);
            return JSON.stringify(result);
        } catch (err: any) {
            const errMsg = err.message || "Unknown error fetching TASE yearly performance";
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }
    },
    {
        name: "get_tase_yearly_perf",
        description: "Get the yearly performance for an Israeli security from TASE: opening price on the first trading day of the year and closing price on the last trading day (or the most recent trading day if the current year). Returns absolute and percentage change.",
        schema: z.object({
            securityId: z.string().describe("TASE numeric security ID (e.g., '1150283')"),
            year: z.number().describe("The year to get performance for (e.g., 2025)"),
        }),
    }
);
