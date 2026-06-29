/**
 * ============================================================================
 * STOCKS AGENT — AI-Powered Stock Broker & Financial Analyst
 * ============================================================================
 *
 * This module creates a LangGraph-based agent that acts as "Marcus Sterling" —
 * a seasoned Wall Street analyst with access to live market data from both
 * US markets (via Yahoo Finance API) and the Israeli TASE (Tel Aviv Stock
 * Exchange) via the TASE public API.
 *
 * This is the most tool-rich agent in the project, with 18 tools spanning:
 *   - Stock search and symbol resolution (Yahoo Finance + TASE)
 *   - Real-time and historical price data
 *   - Stock comparisons and performance analysis
 *   - Technical indicators (SMA, EMA, RSI, MACD)
 *   - Market indices, movers (gainers/losers), and news
 *   - Dividend history tracking
 *   - Persistent watchlist management (saved to disk as JSON files)
 *   - Markdown report export
 *   - Self-describing capabilities catalog
 *
 * ARCHITECTURE (LangChain / LangGraph Concepts):
 * ------------------------------------------------
 * - **createAgent()**: Same high-level helper as the Chef agent. Builds a
 *   LangGraph ReAct agent that loops between LLM reasoning and tool execution.
 *   Because financial queries often require multiple data lookups (e.g.,
 *   "compare AAPL and MSFT over 2024"), the agent may call several tools
 *   in sequence before producing its final answer.
 *
 * - **responseFormat (StocksResponseSchema)**: A comprehensive Zod schema
 *   with fields for stock data, comparisons, indices, movers, news,
 *   technical indicators, dividends, watchlists, and more. This ensures
 *   the API always returns structured, machine-readable JSON alongside
 *   the human-readable summary and insights.
 *
 * - **temperature=0.3**: Low temperature keeps the financial analysis
 *   precise and data-driven while allowing some natural language variation.
 *
 * - **timeout=30000**: Longer timeout (30s) because financial tools make
 *   multiple external API calls that can be slow.
 *
 * TOOL CATEGORIES:
 * ─────────────────
 * US Market (Yahoo Finance):          Israeli Market (TASE API):
 *   - search_stock                      - search_tase
 *   - get_stock_history                 - get_tase_history
 *   - get_stock_quote                   - get_tase_quote
 *   - get_stock_yearly_perf             - get_tase_yearly_perf
 *   - get_stock_multi_year_perf
 *   - get_technical_indicators
 *   - get_dividend_history
 *
 * Cross-Market / Utility:
 *   - compare_stocks
 *   - get_index_quote
 *   - get_market_movers
 *   - get_stock_news
 *   - manage_watchlist
 *   - export_markdown
 *   - get_capabilities
 * ============================================================================
 */

import {MemorySaver} from '@langchain/langgraph';
import {ChatOpenAI} from '@langchain/openai';
import {createAgent} from 'langchain';
import {stocksSystemPrompt} from './stocks.prompt';
import {createSearchStockTool} from './tools/search-stock.tool';
import {createGetStockHistoryTool} from './tools/get-stock-history.tool';
import {createGetStockQuoteTool} from './tools/get-stock-quote.tool';
import {createCompareStocksTool} from './tools/compare-stocks.tool';
import {createExportMarkdownTool} from './tools/export-markdown.tool';
import {createSearchTaseTool} from './tools/search-tase.tool';
import {createGetTaseHistoryTool} from './tools/get-tase-history.tool';
import {createGetTaseQuoteTool} from './tools/get-tase-quote.tool';
import {createGetStockYearlyPerfTool} from './tools/get-stock-yearly-perf.tool';
import {createGetTaseYearlyPerfTool} from './tools/get-tase-yearly-perf.tool';
import {createGetIndexQuoteTool} from './tools/get-index-quote.tool';
import {createGetMarketMoversTool} from './tools/get-market-movers.tool';
import {createGetStockNewsTool} from './tools/get-stock-news.tool';
import {createGetTechnicalIndicatorsTool} from './tools/get-technical-indicators.tool';
import {createGetStockMultiYearPerfTool} from './tools/get-stock-multi-year-perf.tool';
import {createGetDividendHistoryTool} from './tools/get-dividend-history.tool';
import {createManageWatchlistTool} from './tools/manage-watchlist.tool';
import {createGetCapabilitiesTool} from './tools/get-capabilities.tool';
import {StocksResponseSchema} from './schemas/stocks-response.schema';

/**
 * Factory function that creates and returns a fully configured Stocks agent.
 *
 * @param apiKey - API key for the Dell GenAI endpoint (OpenAI-compatible).
 * @returns A LangGraph `CompiledStateGraph` (agent) that can be streamed
 *   with `.stream()` to observe each tool-call step in real time.
 *
 * Why stream instead of invoke?
 * The stocks agent often makes 3–8 sequential tool calls per request.
 * Streaming lets the Express handler log each step as it happens
 * (see index.ts) and gives visibility into the agent's reasoning process.
 */
export const createStocksAgent = (apiKey: string) => {
    // In-memory checkpointer for conversation state isolation.
    // Each API request gets a unique thread_id (e.g., "stocks-1719654321000").
    const checkpointer = new MemorySaver();

    // LLM configuration — temperature=0.3 for precise financial analysis,
    // 30-second timeout for multiple external API calls.
    const model = new ChatOpenAI({
        model: "gpt-oss-120b",
        temperature: 0.3,
        maxRetries: 3,
        timeout: 30000,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: "https://genai-api-dev.dell.com/v1"
        }
    });

    // Instantiate all 18 tools. Each tool factory returns a LangChain `tool()`
    // object with a name, description, Zod input schema, and an async handler.
    // The LLM reads the tool descriptions to decide which ones to call.

    // --- US Market Tools (Yahoo Finance) ---
    const searchStock = createSearchStockTool();             // Resolve company name → ticker symbol
    const getStockHistory = createGetStockHistoryTool();     // Historical OHLCV data
    const getStockQuote = createGetStockQuoteTool();         // Current quote with key metrics
    const compareStocks = createCompareStocksTool();         // Side-by-side stock comparison
    const getStockYearlyPerf = createGetStockYearlyPerfTool();   // Single-year performance
    const getStockMultiYearPerf = createGetStockMultiYearPerfTool(); // Multi-year breakdown
    const getDividendHistory = createGetDividendHistoryTool();    // Dividend payment history
    const getTechnicalIndicators = createGetTechnicalIndicatorsTool(); // SMA, EMA, RSI, MACD

    // --- Israeli Market Tools (TASE API) ---
    const searchTase = createSearchTaseTool();               // Search TASE by name/ID
    const getTaseHistory = createGetTaseHistoryTool();       // TASE historical data
    const getTaseQuote = createGetTaseQuoteTool();           // TASE current quote
    const getTaseYearlyPerf = createGetTaseYearlyPerfTool(); // TASE yearly performance

    // --- Cross-Market & Utility Tools ---
    const getIndexQuote = createGetIndexQuoteTool();         // Major market indices (S&P 500, NASDAQ, etc.)
    const getMarketMovers = createGetMarketMoversTool();     // Top gainers, losers, most active
    const getStockNews = createGetStockNewsTool();           // Recent news headlines
    const exportMarkdown = createExportMarkdownTool();       // Export response as formatted .md file
    const manageWatchlist = createManageWatchlistTool();     // CRUD operations on persistent watchlists
    const getCapabilities = createGetCapabilitiesTool();     // Self-describing capability catalog

    // Assemble the LangGraph agent with all tools, the system prompt (defining
    // Marcus Sterling's personality and response framework), and the structured
    // output schema ensuring consistent JSON responses.
    const agent = createAgent({
        model,
        checkpointer,
        systemPrompt: stocksSystemPrompt,
        responseFormat: StocksResponseSchema,
        tools: [searchStock, getStockHistory, getStockQuote, compareStocks, exportMarkdown, searchTase, getTaseHistory, getTaseQuote, getStockYearlyPerf, getTaseYearlyPerf, getIndexQuote, getMarketMovers, getStockNews, getTechnicalIndicators, getStockMultiYearPerf, getDividendHistory, manageWatchlist, getCapabilities],
    });

    return agent;
};
