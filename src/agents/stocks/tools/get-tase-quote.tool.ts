import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(202)}[get_tase_quote]${LogColors.RESET}`;

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

export const createGetTaseQuoteTool = () => tool(
    async ({securityId}) => {
        console.log(`${TAG} INPUT: securityId=${securityId}`);

        const url = `${TASE_API_BASE}/company/securitydata?securityId=${securityId}&lang=1`;
        console.log(`${TAG} GET ${url}`);

        try {
            const response = await fetch(url, {
                method: "GET",
                headers: TASE_HEADERS,
            });

            if (!response.ok) {
                throw new Error(`TASE quote failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            const details = {
                securityId: String(securityId),
                name: data.Name || data.LongName || data.SecurityLongName || "",
                currency: "ILS",
                exchange: "TASE",
                market: "Israeli (TASE)",
                price: data.LastRate ?? data.BaseRate ?? null,
                change: data.Change ?? null,
                changePercent: data.ChangePercent ?? null,
                previousClose: data.BaseRate ?? null,
                open: data.OpenRate ?? null,
                dayHigh: data.HighRate ?? null,
                dayLow: data.LowRate ?? null,
                volume: data.Volume ?? null,
                marketCap: data.MarketCap ?? data.MarketValue ?? null,
                peRatio: data.PE ?? null,
                eps: data.EPS ?? null,
                dividendYield: data.DividendYield ?? null,
                fiftyTwoWeekHigh: data.Week52High ?? null,
                fiftyTwoWeekLow: data.Week52Low ?? null,
            };

            const result = JSON.stringify(details);
            console.log(`${TAG} OUTPUT: ${details.name} @ ${details.price} ILS`);
            return result;
        } catch (err: any) {
            const errMsg = err.message || "Unknown error fetching TASE quote";
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }
    },
    {
        name: "get_tase_quote",
        description: "Get current details and quote for any Israeli security (stocks, bonds, ETFs) from the Tel Aviv Stock Exchange (TASE) using its numeric TASE ID. Use this when Yahoo Finance does not have the Israeli security.",
        schema: z.object({
            securityId: z.string().describe("TASE numeric security ID (e.g., '1150283')"),
        }),
    }
);
