/**
 * ============================================================================
 * FETCH CURRENT RATES TOOL — Live Bank of Israel & CPI Data Scraper
 * ============================================================================
 *
 * A LangChain tool that fetches current financial rates from official
 * Israeli government sources:
 *
 *   - **BOI Rate**: Bank of Israel base interest rate (from boi.org.il)
 *   - **Prime Rate**: BOI + 1.5% (estimated if not directly found)
 *   - **CPI**: Consumer Price Index year-over-year (from cbs.gov.il)
 *
 * This is a best-effort web scraper. Data may not always be extractable
 * if the source websites change their structure. The tool returns raw
 * snippets from the scraped pages along with extracted rates, so the
 * agent can verify the data makes sense.
 *
 * Used by the mortgage agent to compare offer rates against current
 * market conditions and identify negotiation opportunities.
 * ============================================================================
 */
import { tool } from "langchain";
import { z } from "zod";
import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(33)}[fetch_current_rates]${LogColors.RESET}`;

const BOI_URL = "https://www.boi.org.il/he/economic-roles/monetary-policy/";
const CBS_URL = "https://www.cbs.gov.il/he/Pages/default.aspx";

async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; MortgageAgent/1.0)",
                "Accept": "text/html,application/xhtml+xml",
            },
        });
        clearTimeout(timer);

        if (!response.ok) return null;
        return await response.text();
    } catch {
        return null;
    }
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractRate(text: string, patterns: RegExp[]): number | null {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            const num = parseFloat(match[1]);
            if (!isNaN(num) && num > 0 && num < 30) return num;
        }
    }
    return null;
}

export const fetchCurrentRates = tool(
    async ({ include }) => {
        const targets = include && include.length > 0 ? include : ["prime", "boi", "cpi"];
        console.log(`${TAG} INPUT: include=[${targets.join(", ")}]`);

        const result: {
            primeRate?: number | null;
            boiRate?: number | null;
            cpiYoY?: number | null;
            fetchedAt: string;
            sources: string[];
            errors: string[];
            rawSnippets: string[];
        } = {
            fetchedAt: new Date().toISOString(),
            sources: [],
            errors: [],
            rawSnippets: [],
        };

        // Fetch Bank of Israel rate + prime
        if (targets.includes("boi") || targets.includes("prime")) {
            const html = await fetchWithTimeout(BOI_URL);
            if (html) {
                const text = stripHtml(html);
                result.sources.push(BOI_URL);

                // Extract a snippet around the rate mention
                const snippetMatch = text.match(/.{0,100}ריבית.{0,200}/);
                if (snippetMatch) {
                    result.rawSnippets.push(snippetMatch[0].trim());
                }

                if (targets.includes("boi")) {
                    result.boiRate = extractRate(text, [
                        /ריבית\s*(?:בנק\s*ישראל|ה?מוניטרית)[^0-9]{0,80}([\d]+\.[\d]+)\s*%/,
                        /ריבית[^0-9]{0,40}([\d]+\.[\d]+)\s*%/,
                        /([\d]+\.[\d]+)\s*%\s*[^0-9]{0,40}ריבית/,
                    ]);
                }

                if (targets.includes("prime")) {
                    result.primeRate = extractRate(text, [
                        /פריים[^0-9]{0,60}([\d]+\.[\d]+)\s*%/,
                        /([\d]+\.[\d]+)\s*%\s*[^0-9]{0,40}פריים/,
                    ]);
                    // If we got BOI rate but not prime, estimate: prime = BOI + 1.5
                    if (result.primeRate == null && result.boiRate != null) {
                        result.primeRate = Math.round((result.boiRate + 1.5) * 100) / 100;
                    }
                }
            } else {
                result.errors.push(`Failed to fetch Bank of Israel page: ${BOI_URL}`);
            }
        }

        // Fetch CPI (Consumer Price Index)
        if (targets.includes("cpi")) {
            const html = await fetchWithTimeout(CBS_URL);
            if (html) {
                const text = stripHtml(html);
                result.sources.push(CBS_URL);

                const snippetMatch = text.match(/.{0,100}מדד\s*המחירים.{0,200}/);
                if (snippetMatch) {
                    result.rawSnippets.push(snippetMatch[0].trim());
                }

                result.cpiYoY = extractRate(text, [
                    /מדד\s*המחירים\s*לצרכן[^0-9]{0,80}([\d]+\.[\d]+)\s*%/,
                    /שינוי\s*שנתי[^0-9]{0,40}([\d]+\.[\d]+)\s*%/,
                ]);
            } else {
                result.errors.push(`Failed to fetch CBS page: ${CBS_URL}`);
            }
        }

        const summary = [
            result.boiRate != null ? `boiRate=${result.boiRate}%` : null,
            result.primeRate != null ? `primeRate=${result.primeRate}%` : null,
            result.cpiYoY != null ? `cpiYoY=${result.cpiYoY}%` : null,
            result.errors.length > 0 ? `errors=${result.errors.length}` : null,
        ].filter(Boolean).join(", ");

        console.log(`${TAG} OUTPUT: ${summary || "no data extracted"}`);
        return JSON.stringify(result);
    },
    {
        name: "fetch_current_rates",
        description:
            "Fetch current Bank of Israel interest rate, prime rate, and CPI (Consumer Price Index) data from official Israeli sources. This is a best-effort scraper — data may not always be extractable. Use this when comparing mortgage offers to current market conditions. Falls back gracefully with error messages if sources are unavailable.",
        schema: z.object({
            include: z
                .array(z.enum(["prime", "boi", "cpi"]))
                .optional()
                .describe("Which rates to fetch. Options: 'prime' (prime rate), 'boi' (Bank of Israel base rate), 'cpi' (Consumer Price Index YoY). Defaults to all."),
        }),
    }
);
