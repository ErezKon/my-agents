/**
 * ============================================================================
 * STOCKS RESPONSE SCHEMA — Comprehensive Structured Output
 * ============================================================================
 *
 * This is the most complex Zod schema in the project. It defines the
 * structured output format for the Stocks agent's final response.
 *
 * Passed as `responseFormat` to `createAgent()`, it forces the LLM to
 * produce JSON matching this exact shape. Most fields are optional because
 * not every query requires all sections (e.g., a simple quote lookup won't
 * include comparison data or watchlist information).
 *
 * MAJOR SECTIONS:
 * - `summary` / `answer` — Human-readable text response.
 * - `market` — Which market (US/TASE) the data relates to.
 * - `stockData` — Array of individual stock quotes, history, yearly perf.
 * - `comparison` — Side-by-side comparison of multiple stocks.
 * - `indices` — Major market index data (S&P 500, NASDAQ, etc.).
 * - `movers` — Top gainers, losers, most active stocks.
 * - `news` — Recent headlines related to queried stocks.
 * - `technicalIndicators` — SMA, EMA, RSI, MACD analysis results.
 * - `multiYearPerformance` — Year-by-year performance breakdown.
 * - `dividends` — Dividend payment history and annual summaries.
 * - `watchlist` — Persistent watchlist data.
 * - `capabilities` — Self-describing list of what the agent can do.
 * - `insights` / `disclaimer` — Analyst commentary and legal disclaimer.
 * ============================================================================
 */
import {z} from "zod";

export const StocksResponseSchema = z.object({
    summary: z
        .string()
        .describe("The broker's narrative summary and analysis of the response — context, key takeaways, and professional commentary"),

    market: z
        .enum(["US", "Israeli", "both"])
        .describe("Which market the data pertains to"),

    stockData: z
        .array(z.object({
            symbol: z.string().describe("Stock ticker symbol (e.g., AAPL, TEVA.TA)"),
            name: z.string().describe("Company name"),
            currency: z.string().describe("Currency of the quoted prices (e.g., USD, ILS)"),
            exchange: z.string().describe("Exchange name (e.g., NASDAQ, TASE)"),
            quote: z.object({
                price: z.number().describe("Current / last traded price"),
                change: z.number().describe("Price change from previous close"),
                changePercent: z.number().describe("Percentage change from previous close"),
                previousClose: z.number().describe("Previous closing price"),
                open: z.number().describe("Opening price for the current/last session"),
                dayHigh: z.number().describe("Intraday high"),
                dayLow: z.number().describe("Intraday low"),
                volume: z.number().describe("Trading volume"),
                marketCap: z.number().optional().describe("Market capitalization"),
                peRatio: z.number().optional().describe("Trailing price-to-earnings ratio"),
                eps: z.number().optional().describe("Earnings per share (trailing twelve months)"),
                dividendYield: z.number().optional().describe("Trailing annual dividend yield as a percentage"),
                fiftyTwoWeekHigh: z.number().optional().describe("52-week high price"),
                fiftyTwoWeekLow: z.number().optional().describe("52-week low price"),
                beta: z.number().optional().describe("Beta coefficient — volatility relative to market"),
            }).optional().describe("REQUIRED when get_stock_quote was called — include ALL fields returned by the tool. Do not omit."),
            history: z.array(z.object({
                date: z.string().describe("Date in dd/MM/yyyy format"),
                open: z.number().describe("Opening price"),
                high: z.number().describe("Day high"),
                low: z.number().describe("Day low"),
                close: z.number().describe("Closing price"),
                volume: z.number().describe("Trading volume"),
            })).optional().describe("REQUIRED when get_stock_history was called — include ALL data points returned by the tool. Every single row must appear here. Never summarize or skip rows."),
            yearlyPerformance: z.object({
                year: z.number().describe("The year"),
                openDate: z.string().describe("Date of the first trading day (dd/MM/yyyy)"),
                openValue: z.number().describe("Opening price on the first trading day of the year"),
                closeDate: z.string().describe("Date of the last trading day (dd/MM/yyyy)"),
                closeValue: z.number().describe("Closing price on the last trading day (or most recent if current year)"),
                change: z.number().describe("Absolute price change (closeValue - openValue)"),
                changePercent: z.number().describe("Percentage change over the year"),
            }).optional().describe("REQUIRED when get_stock_yearly_perf or get_tase_yearly_perf was called — include ALL fields returned by the tool."),
        }))
        .describe("Per-symbol data blocks — MUST include the raw data returned by tools (history array when get_stock_history was called, quote object when get_stock_quote was called)"),

    comparison: z
        .array(z.object({
            symbol: z.string().describe("Stock ticker symbol"),
            startPrice: z.number().describe("Price at the start of the comparison period"),
            endPrice: z.number().describe("Price at the end of the comparison period"),
            percentChange: z.number().describe("Percentage change over the period"),
            volatility: z.number().describe("Volatility as coefficient of variation (%)"),
            periodHigh: z.number().describe("Highest close in the period"),
            periodLow: z.number().describe("Lowest close in the period"),
        }))
        .optional()
        .describe("Side-by-side comparison data — included when the user asks to compare multiple stocks"),

    indices: z
        .array(z.object({
            symbol: z.string().describe("Index symbol (e.g., ^GSPC)"),
            name: z.string().describe("Index name"),
            price: z.number().describe("Current price/level"),
            change: z.number().describe("Absolute change"),
            changePercent: z.number().describe("Percentage change"),
            dayHigh: z.number().describe("Intraday high"),
            dayLow: z.number().describe("Intraday low"),
        }))
        .optional()
        .describe("REQUIRED when get_index_quote was called — include ALL index data returned by the tool."),

    movers: z
        .object({
            category: z.string().describe("Category: gainers, losers, or most_active"),
            items: z.array(z.object({
                symbol: z.string().describe("Stock ticker symbol"),
                name: z.string().describe("Company name"),
                price: z.number().describe("Current price"),
                change: z.number().describe("Absolute change"),
                changePercent: z.number().describe("Percentage change"),
                volume: z.number().describe("Trading volume"),
            })),
        })
        .optional()
        .describe("REQUIRED when get_market_movers was called — include ALL movers returned by the tool."),

    news: z
        .array(z.object({
            title: z.string().describe("Headline"),
            publisher: z.string().describe("News publisher"),
            link: z.string().describe("URL to the article"),
            publishedAt: z.string().optional().describe("Publication date in ISO format"),
        }))
        .optional()
        .describe("REQUIRED when get_stock_news was called — include ALL news items returned by the tool."),

    technicalIndicators: z
        .object({
            symbol: z.string().describe("Stock ticker symbol"),
            currentPrice: z.number().describe("Latest closing price"),
            sma20: z.number().optional().describe("20-day Simple Moving Average"),
            sma50: z.number().optional().describe("50-day Simple Moving Average"),
            ema12: z.number().optional().describe("12-day Exponential Moving Average"),
            ema26: z.number().optional().describe("26-day Exponential Moving Average"),
            rsi14: z.number().optional().describe("14-day Relative Strength Index"),
            macd: z.number().optional().describe("MACD line"),
            macdSignal: z.number().optional().describe("MACD signal line"),
            macdHistogram: z.number().optional().describe("MACD histogram"),
            trend: z.string().describe("Overall trend: bullish, bearish, or neutral"),
        })
        .optional()
        .describe("REQUIRED when get_technical_indicators was called — include ALL indicator values returned by the tool."),

    multiYearPerformance: z
        .object({
            symbol: z.string().describe("Stock ticker symbol"),
            startYear: z.number().describe("First year"),
            endYear: z.number().describe("Last year"),
            cumulativeChangePercent: z.number().optional().describe("Overall cumulative percentage change"),
            years: z.array(z.object({
                year: z.number().describe("Year"),
                openDate: z.string().optional().describe("First trading day date"),
                openValue: z.number().optional().describe("Opening price"),
                closeDate: z.string().optional().describe("Last trading day date"),
                closeValue: z.number().optional().describe("Closing price"),
                change: z.number().optional().describe("Absolute change"),
                changePercent: z.number().optional().describe("Percentage change"),
                error: z.string().optional().describe("Error message if data was unavailable for this year"),
            })),
        })
        .optional()
        .describe("REQUIRED when get_stock_multi_year_perf was called — include ALL year entries returned by the tool."),

    dividends: z
        .object({
            symbol: z.string().describe("Stock ticker symbol"),
            currency: z.string().describe("Currency"),
            totalPayments: z.number().describe("Total number of dividend payments"),
            dividends: z.array(z.object({
                date: z.string().describe("Ex-dividend date in dd/MM/yyyy format"),
                amount: z.number().describe("Dividend amount per share"),
            })),
            annualSummary: z.array(z.object({
                year: z.number().describe("Year"),
                totalDividend: z.number().describe("Total dividends paid that year"),
            })).optional(),
        })
        .optional()
        .describe("REQUIRED when get_dividend_history was called — include ALL dividend payments returned by the tool."),

    watchlist: z
        .object({
            name: z.string().describe("Watchlist name"),
            symbols: z.array(z.string()).describe("Symbols in the watchlist"),
            quotes: z.array(z.object({
                symbol: z.string().describe("Stock ticker symbol"),
                name: z.string().describe("Company name"),
                price: z.number().describe("Current price"),
                change: z.number().describe("Absolute change"),
                changePercent: z.number().describe("Percentage change"),
            })).optional().describe("Quotes for watchlist symbols — included when 'quotes' action was used"),
        })
        .optional()
        .describe("REQUIRED when manage_watchlist was called — include watchlist details returned by the tool."),

    capabilities: z
        .array(z.object({
            name: z.string().describe("Capability name (e.g., 'Stock Quote')"),
            description: z.string().describe("What this capability does"),
            exampleQuery: z.string().describe("Example user query that triggers this capability"),
            sampleResponse: z.string().describe("The COMPLETE sample JSON response as a stringified JSON block — copy it EXACTLY as returned by the get_capabilities tool. Do NOT summarize, shorten, or extract just the summary field."),
        }))
        .optional()
        .describe("REQUIRED when the user asks what you can do or requests a list of abilities — populate with ALL 17 capabilities from the catalog, each with name, description, example query, and sample JSON response."),

    insights: z
        .array(z.string())
        .describe("Key observations, trends, and professional takeaways from the data"),

    disclaimer: z
        .string()
        .describe("Standard financial disclaimer — e.g., 'This is not financial advice. Past performance does not guarantee future results.'"),
});
