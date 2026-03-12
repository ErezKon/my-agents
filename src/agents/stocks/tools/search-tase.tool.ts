import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(214)}[search_tase]${LogColors.RESET}`;

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

export const createSearchTaseTool = () => tool(
    async ({query}) => {
        console.log(`${TAG} INPUT: query="${query}"`);

        const url = `${TASE_API_BASE}/content/searchentities?lang=1`;

        const response = await fetch(url, {
            method: "GET",
            headers: TASE_HEADERS,
        });

        if (!response.ok) {
            const errMsg = `Failed to fetch TASE securities: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();
        const allSecurities: any[] = Array.isArray(data) ? data : [];

        const queryLower = query.toLowerCase();
        const matches = allSecurities.filter((sec: any) => {
            const id = String(sec.Id || "");
            const name = String(sec.Name || "").toLowerCase();
            const longName = String(sec.LongName || sec.SecurityLongName || "").toLowerCase();
            return id.includes(queryLower) || name.includes(queryLower) || longName.includes(queryLower);
        }).slice(0, 20);

        const results = matches.map((sec: any) => ({
            securityId: String(sec.Id),
            name: sec.Name || sec.LongName || sec.SecurityLongName || "",
            type: sec.Type,
            subType: sec.SubType,
            market: "Israeli (TASE)",
        }));

        const result = JSON.stringify({
            count: results.length,
            results,
        });

        console.log(`${TAG} OUTPUT: found ${results.length} results out of ${allSecurities.length} total securities`);
        return result;
    },
    {
        name: "search_tase",
        description: "Search for Israeli securities on the Tel Aviv Stock Exchange (TASE) by name or TASE numeric ID. Use this when the user provides a TASE security ID (e.g., '1150283') or when a Yahoo Finance search with .TA suffix returns no results. Returns TASE security IDs which can be used with get_tase_history and get_tase_quote tools.",
        schema: z.object({
            query: z.string().describe("Company name, keyword, or TASE numeric security ID to search for (e.g., 'Teva', '1150283')"),
        }),
    }
);
