import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(208)}[get_tase_history]${LogColors.RESET}`;

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

function parseDateToISO(dateStr: string): string {
    const [day, month, year] = dateStr.split("/").map(Number);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const createGetTaseHistoryTool = () => tool(
    async ({securityId, startDate, endDate}) => {
        console.log(`${TAG} INPUT: securityId=${securityId}, startDate=${startDate}, endDate=${endDate || "now"}`);

        const fromISO = parseDateToISO(startDate);
        const toISO = endDate ? parseDateToISO(endDate) : new Date().toISOString().split("T")[0];

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

        console.log(`${TAG} POST ${url}`);

        try {
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

            const history = items.map((item: any) => ({
                date: item.TradeDate || "",
                open: item.OpenRate ?? null,
                high: item.HighRate ?? null,
                low: item.LowRate ?? null,
                close: item.CloseRate ?? item.BaseRate ?? null,
                volume: item.OverallTurnOverUnits ?? item.Volume ?? null,
            }));

            const result = JSON.stringify({
                securityId,
                currency: "ILS",
                exchange: "TASE",
                dataPoints: history.length,
                history,
            });

            console.log(`${TAG} OUTPUT: ${history.length} data points for TASE ID ${securityId}`);
            return result;
        } catch (err: any) {
            const errMsg = err.message || "Unknown error fetching TASE history";
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }
    },
    {
        name: "get_tase_history",
        description: "Fetch historical price data (open, high, low, close, volume) for any Israeli security (stocks, bonds, ETFs) from the Tel Aviv Stock Exchange (TASE) using its numeric TASE ID. Use this when Yahoo Finance does not have the Israeli security. Dates must be in dd/MM/yyyy format.",
        schema: z.object({
            securityId: z.string().describe("TASE numeric security ID (e.g., '1150283')"),
            startDate: z.string().describe("Start date in dd/MM/yyyy format (e.g., '01/01/2025')"),
            endDate: z.string().optional().describe("End date in dd/MM/yyyy format. Defaults to today if omitted."),
        }),
    }
);
