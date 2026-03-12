import {tool} from "@langchain/core/tools";
import {z} from "zod";
import * as fs from "fs";
import * as path from "path";
import {LogColors} from '../../../utils/log-colors.util';

const TAG = `${LogColors.YELLOW}[export_markdown]${LogColors.RESET}`;
const OUTPUTS_DIR = path.resolve(__dirname, "../../../../outputs");

function renderQuote(quote: any): string {
    const lines: string[] = [];
    lines.push(`  - **Price**: ${quote.price}`);
    lines.push(`  - **Change**: ${quote.change} (${quote.changePercent}%)`);
    lines.push(`  - **Previous Close**: ${quote.previousClose}`);
    lines.push(`  - **Open**: ${quote.open}`);
    lines.push(`  - **Day High**: ${quote.dayHigh}`);
    lines.push(`  - **Day Low**: ${quote.dayLow}`);
    lines.push(`  - **Volume**: ${quote.volume?.toLocaleString()}`);
    if (quote.marketCap != null) lines.push(`  - **Market Cap**: ${quote.marketCap.toLocaleString()}`);
    if (quote.peRatio != null) lines.push(`  - **P/E Ratio**: ${quote.peRatio}`);
    if (quote.eps != null) lines.push(`  - **EPS**: ${quote.eps}`);
    if (quote.dividendYield != null) lines.push(`  - **Dividend Yield**: ${quote.dividendYield}%`);
    if (quote.fiftyTwoWeekHigh != null) lines.push(`  - **52-Week High**: ${quote.fiftyTwoWeekHigh}`);
    if (quote.fiftyTwoWeekLow != null) lines.push(`  - **52-Week Low**: ${quote.fiftyTwoWeekLow}`);
    if (quote.beta != null) lines.push(`  - **Beta**: ${quote.beta}`);
    return lines.join("\n");
}

function renderHistory(history: any[]): string {
    const lines: string[] = [];
    lines.push("  | Date | Open | High | Low | Close | Volume |");
    lines.push("  |------|------|------|-----|-------|--------|");
    for (const row of history) {
        lines.push(`  | ${row.date} | ${row.open} | ${row.high} | ${row.low} | ${row.close} | ${row.volume?.toLocaleString()} |`);
    }
    return lines.join("\n");
}

function renderYearlyPerformance(perf: any): string {
    const sign = perf.change >= 0 ? "+" : "";
    const lines: string[] = [];
    lines.push(`  - **Open**: ${perf.openValue} on ${perf.openDate}`);
    lines.push(`  - **Close**: ${perf.closeValue} on ${perf.closeDate}`);
    lines.push(`  - **Change**: ${sign}${perf.change} (${sign}${perf.changePercent}%)`);
    return lines.join("\n");
}

function renderIndices(indices: any[]): string {
    const lines: string[] = [];
    lines.push("| Index | Price | Change | Change % | Day High | Day Low |");
    lines.push("|-------|-------|--------|----------|----------|---------|");
    for (const idx of indices) {
        const sign = (idx.change >= 0) ? "+" : "";
        lines.push(`| ${idx.name || idx.symbol} | ${idx.price} | ${sign}${idx.change} | ${sign}${idx.changePercent}% | ${idx.dayHigh} | ${idx.dayLow} |`);
    }
    return lines.join("\n");
}

function renderMovers(movers: any): string {
    const lines: string[] = [];
    lines.push(`**Category**: ${movers.category}\n`);
    lines.push("| # | Symbol | Name | Price | Change | Change % | Volume |");
    lines.push("|---|--------|------|-------|--------|----------|--------|");
    (movers.items || []).forEach((m: any, i: number) => {
        const sign = (m.change >= 0) ? "+" : "";
        lines.push(`| ${i + 1} | ${m.symbol} | ${m.name} | ${m.price} | ${sign}${m.change} | ${sign}${m.changePercent}% | ${m.volume?.toLocaleString()} |`);
    });
    return lines.join("\n");
}

function renderNews(news: any[]): string {
    const lines: string[] = [];
    for (const item of news) {
        const date = item.publishedAt ? ` (${item.publishedAt.split("T")[0]})` : "";
        lines.push(`- **${item.title}**${date}`);
        lines.push(`  - Publisher: ${item.publisher}`);
        lines.push(`  - [Read more](${item.link})`);
    }
    return lines.join("\n");
}

function renderTechnicalIndicators(ti: any): string {
    const lines: string[] = [];
    lines.push(`**Symbol**: ${ti.symbol} — **Current Price**: ${ti.currentPrice} — **Trend**: ${ti.trend}\n`);
    lines.push("| Indicator | Value |");
    lines.push("|-----------|-------|");
    if (ti.sma20 != null) lines.push(`| SMA(20) | ${ti.sma20} |`);
    if (ti.sma50 != null) lines.push(`| SMA(50) | ${ti.sma50} |`);
    if (ti.ema12 != null) lines.push(`| EMA(12) | ${ti.ema12} |`);
    if (ti.ema26 != null) lines.push(`| EMA(26) | ${ti.ema26} |`);
    if (ti.rsi14 != null) lines.push(`| RSI(14) | ${ti.rsi14} |`);
    if (ti.macd != null) lines.push(`| MACD Line | ${ti.macd} |`);
    if (ti.macdSignal != null) lines.push(`| MACD Signal | ${ti.macdSignal} |`);
    if (ti.macdHistogram != null) lines.push(`| MACD Histogram | ${ti.macdHistogram} |`);
    return lines.join("\n");
}

function renderMultiYearPerformance(myp: any): string {
    const lines: string[] = [];
    lines.push(`**${myp.symbol}** — ${myp.startYear} to ${myp.endYear}`);
    if (myp.cumulativeChangePercent != null) {
        const sign = myp.cumulativeChangePercent >= 0 ? "+" : "";
        lines.push(`Cumulative change: ${sign}${myp.cumulativeChangePercent}%\n`);
    }
    lines.push("| Year | Open | Close | Change | Change % |");
    lines.push("|------|------|-------|--------|----------|");
    for (const yr of (myp.years || [])) {
        if (yr.error) {
            lines.push(`| ${yr.year} | — | — | — | ${yr.error} |`);
        } else {
            const sign = (yr.change >= 0) ? "+" : "";
            lines.push(`| ${yr.year} | ${yr.openValue} | ${yr.closeValue} | ${sign}${yr.change} | ${sign}${yr.changePercent}% |`);
        }
    }
    return lines.join("\n");
}

function renderDividends(div: any): string {
    const lines: string[] = [];
    lines.push(`**${div.symbol}** — ${div.currency} — ${div.totalPayments} payments\n`);
    if (div.annualSummary && div.annualSummary.length > 0) {
        lines.push("**Annual Summary:**");
        lines.push("| Year | Total Dividend |");
        lines.push("|------|----------------|");
        for (const yr of div.annualSummary) {
            lines.push(`| ${yr.year} | ${yr.totalDividend} |`);
        }
        lines.push("");
    }
    lines.push("**All Payments:**");
    lines.push("| Date | Amount |");
    lines.push("|------|--------|");
    for (const d of (div.dividends || [])) {
        lines.push(`| ${d.date} | ${d.amount} |`);
    }
    return lines.join("\n");
}

function renderWatchlist(wl: any): string {
    const lines: string[] = [];
    lines.push(`**Watchlist**: ${wl.name}`);
    lines.push(`**Symbols**: ${(wl.symbols || []).join(", ")}\n`);
    if (wl.quotes && wl.quotes.length > 0) {
        lines.push("| Symbol | Name | Price | Change | Change % |");
        lines.push("|--------|------|-------|--------|----------|");
        for (const q of wl.quotes) {
            const sign = (q.change >= 0) ? "+" : "";
            lines.push(`| ${q.symbol} | ${q.name} | ${q.price} | ${sign}${q.change} | ${sign}${q.changePercent}% |`);
        }
    }
    return lines.join("\n");
}

function renderCapabilities(capabilities: any[]): string {
    const lines: string[] = [];
    for (let i = 0; i < capabilities.length; i++) {
        const cap = capabilities[i];
        lines.push(`### ${i + 1}. ${cap.name}\n`);
        lines.push(`${cap.description}\n`);
        lines.push(`**Example**: ${cap.exampleQuery}\n`);
        lines.push(`**Sample Response:**`);
        lines.push("```json");
        try {
            const parsed = JSON.parse(cap.sampleResponse);
            lines.push(JSON.stringify(parsed, null, 2));
        } catch {
            lines.push(cap.sampleResponse);
        }
        lines.push("```\n");
    }
    return lines.join("\n");
}

export function buildMarkdown(data: any): string {
    const sections: string[] = [];

    if (data.summary) {
        sections.push(`# Summary\n\n${data.summary}`);
    }

    if (data.market) {
        sections.push(`# Market\n\n${data.market}`);
    }

    if (data.stockData && data.stockData.length > 0) {
        const items: string[] = [];
        for (const stock of data.stockData) {
            const header = `- **${stock.symbol}** — ${stock.name} (${stock.exchange}, ${stock.currency})`;
            const parts: string[] = [header];

            if (stock.quote) {
                parts.push("\n  **Quote:**");
                parts.push(renderQuote(stock.quote));
            }

            if (stock.yearlyPerformance) {
                parts.push(`\n  **Yearly Performance (${stock.yearlyPerformance.year}):**`);
                parts.push(renderYearlyPerformance(stock.yearlyPerformance));
            }

            if (stock.history && stock.history.length > 0) {
                parts.push("\n  **History:**");
                parts.push(renderHistory(stock.history));
            }

            items.push(parts.join("\n"));
        }
        sections.push(`# Stock Data\n\n${items.join("\n\n")}`);
    }

    if (data.comparison && data.comparison.length > 0) {
        const items: string[] = [];
        for (const comp of data.comparison) {
            const lines: string[] = [];
            lines.push(`- **${comp.symbol}**`);
            lines.push(`  - **Start Price**: ${comp.startPrice}`);
            lines.push(`  - **End Price**: ${comp.endPrice}`);
            lines.push(`  - **Percent Change**: ${comp.percentChange}%`);
            lines.push(`  - **Volatility**: ${comp.volatility}%`);
            lines.push(`  - **Period High**: ${comp.periodHigh}`);
            lines.push(`  - **Period Low**: ${comp.periodLow}`);
            items.push(lines.join("\n"));
        }
        sections.push(`# Comparison\n\n${items.join("\n\n")}`);
    }

    if (data.indices && data.indices.length > 0) {
        sections.push(`# Market Indices\n\n${renderIndices(data.indices)}`);
    }

    if (data.movers) {
        sections.push(`# Market Movers\n\n${renderMovers(data.movers)}`);
    }

    if (data.news && data.news.length > 0) {
        sections.push(`# News\n\n${renderNews(data.news)}`);
    }

    if (data.technicalIndicators) {
        sections.push(`# Technical Analysis\n\n${renderTechnicalIndicators(data.technicalIndicators)}`);
    }

    if (data.multiYearPerformance) {
        sections.push(`# Multi-Year Performance\n\n${renderMultiYearPerformance(data.multiYearPerformance)}`);
    }

    if (data.dividends) {
        sections.push(`# Dividend History\n\n${renderDividends(data.dividends)}`);
    }

    if (data.watchlist) {
        sections.push(`# Watchlist\n\n${renderWatchlist(data.watchlist)}`);
    }

    if (data.capabilities && data.capabilities.length > 0) {
        sections.push(`# Capabilities\n\n${renderCapabilities(data.capabilities)}`);
    }

    if (data.insights && data.insights.length > 0) {
        const items = data.insights.map((insight: string) => `- ${insight}`);
        sections.push(`# Insights\n\n${items.join("\n")}`);
    }

    if (data.disclaimer) {
        sections.push(`# Disclaimer\n\n${data.disclaimer}`);
    }

    return sections.join("\n\n---\n\n") + "\n";
}

function sanitizeFolderName(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase()
        .slice(0, 80);
}

export const createExportMarkdownTool = () => tool(
    async ({structuredResponse}) => {
        console.log(`${TAG} INPUT: received structured response (${structuredResponse.length} chars)`);

        let data: any;
        try {
            data = JSON.parse(structuredResponse);
        } catch {
            const errMsg = "Failed to parse structured response as JSON.";
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const markdown = buildMarkdown(data);

        const title = sanitizeFolderName(data.summary || "stocks-report") || "stocks-report";
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const folderName = `stocks-${title}-${timestamp}`;
        const outputDir = path.join(OUTPUTS_DIR, folderName);

        fs.mkdirSync(outputDir, {recursive: true});

        const mdPath = path.join(outputDir, "response.md");
        fs.writeFileSync(mdPath, markdown, "utf-8");

        console.log(`${TAG} OUTPUT: saved markdown to ${mdPath} (${markdown.length} chars)`);
        return JSON.stringify({
            success: true,
            filePath: mdPath,
            characters: markdown.length,
        });
    },
    {
        name: "export_markdown",
        description: "Export the structured stock response as a formatted markdown file. Pass the full structuredResponse JSON string. The tool will parse it and create a well-formatted .md file with sections for Summary, Market, Stock Data, Comparison, Insights, and Disclaimer. Optional sections are omitted if not present in the data.",
        schema: z.object({
            structuredResponse: z.string().describe("The full structured response JSON string to convert to markdown"),
        }),
    }
);
