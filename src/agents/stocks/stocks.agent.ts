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

export const createStocksAgent = (apiKey: string) => {
    const checkpointer = new MemorySaver();

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

    const searchStock = createSearchStockTool();
    const getStockHistory = createGetStockHistoryTool();
    const getStockQuote = createGetStockQuoteTool();
    const compareStocks = createCompareStocksTool();
    const exportMarkdown = createExportMarkdownTool();
    const searchTase = createSearchTaseTool();
    const getTaseHistory = createGetTaseHistoryTool();
    const getTaseQuote = createGetTaseQuoteTool();
    const getStockYearlyPerf = createGetStockYearlyPerfTool();
    const getTaseYearlyPerf = createGetTaseYearlyPerfTool();
    const getIndexQuote = createGetIndexQuoteTool();
    const getMarketMovers = createGetMarketMoversTool();
    const getStockNews = createGetStockNewsTool();
    const getTechnicalIndicators = createGetTechnicalIndicatorsTool();
    const getStockMultiYearPerf = createGetStockMultiYearPerfTool();
    const getDividendHistory = createGetDividendHistoryTool();
    const manageWatchlist = createManageWatchlistTool();
    const getCapabilities = createGetCapabilitiesTool();

    const agent = createAgent({
        model,
        checkpointer,
        systemPrompt: stocksSystemPrompt,
        responseFormat: StocksResponseSchema,
        tools: [searchStock, getStockHistory, getStockQuote, compareStocks, exportMarkdown, searchTase, getTaseHistory, getTaseQuote, getStockYearlyPerf, getTaseYearlyPerf, getIndexQuote, getMarketMovers, getStockNews, getTechnicalIndicators, getStockMultiYearPerf, getDividendHistory, manageWatchlist, getCapabilities],
    });

    return agent;
};
