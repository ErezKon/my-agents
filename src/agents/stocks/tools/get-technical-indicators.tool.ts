import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(135)}[get_technical_indicators]${LogColors.RESET}`;

function parseDateToUnix(day: number, month: number, year: number): number {
    const date = new Date(year, month - 1, day, 0, 0, 0);
    return Math.floor(date.getTime() / 1000);
}

function sma(values: number[], period: number): number | null {
    if (values.length < period) return null;
    const slice = values.slice(-period);
    return Math.round((slice.reduce((a, b) => a + b, 0) / period) * 100) / 100;
}

function ema(values: number[], period: number): number | null {
    if (values.length < period) return null;
    const k = 2 / (period + 1);
    let emaVal = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < values.length; i++) {
        emaVal = values[i] * k + emaVal * (1 - k);
    }
    return Math.round(emaVal * 100) / 100;
}

function rsi(closes: number[], period: number = 14): number | null {
    if (closes.length < period + 1) return null;
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) {
            avgGain = (avgGain * (period - 1) + diff) / period;
            avgLoss = (avgLoss * (period - 1)) / period;
        } else {
            avgGain = (avgGain * (period - 1)) / period;
            avgLoss = (avgLoss * (period - 1) - diff) / period;
        }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

function computeMACD(closes: number[]): {macdLine: number | null; signalLine: number | null; histogram: number | null} {
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);

    if (ema12 == null || ema26 == null) {
        return {macdLine: null, signalLine: null, histogram: null};
    }

    // Compute full MACD line series for signal line
    const k12 = 2 / 13;
    const k26 = 2 / 27;
    let ema12Val = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    let ema26Val = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;

    const macdSeries: number[] = [];

    for (let i = 26; i < closes.length; i++) {
        if (i >= 12) {
            ema12Val = closes[i] * k12 + ema12Val * (1 - k12);
        }
        ema26Val = closes[i] * k26 + ema26Val * (1 - k26);
        macdSeries.push(ema12Val - ema26Val);
    }

    const macdLine = macdSeries.length > 0 ? Math.round(macdSeries[macdSeries.length - 1] * 100) / 100 : null;

    // Signal line = 9-period EMA of MACD
    let signalLine: number | null = null;
    if (macdSeries.length >= 9) {
        const kSig = 2 / 10;
        let sigVal = macdSeries.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
        for (let i = 9; i < macdSeries.length; i++) {
            sigVal = macdSeries[i] * kSig + sigVal * (1 - kSig);
        }
        signalLine = Math.round(sigVal * 100) / 100;
    }

    const histogram = macdLine != null && signalLine != null
        ? Math.round((macdLine - signalLine) * 100) / 100
        : null;

    return {macdLine, signalLine, histogram};
}

function determineTrend(rsiVal: number | null, macdHistogram: number | null, price: number | null, sma50: number | null): string {
    let bullish = 0;
    let bearish = 0;

    if (rsiVal != null) {
        if (rsiVal > 70) bearish++;
        else if (rsiVal < 30) bullish++;
    }

    if (macdHistogram != null) {
        if (macdHistogram > 0) bullish++;
        else if (macdHistogram < 0) bearish++;
    }

    if (price != null && sma50 != null) {
        if (price > sma50) bullish++;
        else bearish++;
    }

    if (bullish > bearish) return "bullish";
    if (bearish > bullish) return "bearish";
    return "neutral";
}

export const createGetTechnicalIndicatorsTool = () => tool(
    async ({symbol, period}) => {
        console.log(`${TAG} INPUT: symbol="${symbol}", period=${period}`);

        // Fetch enough history for indicators (need at least 50 extra days for SMA50)
        const now = Math.floor(Date.now() / 1000);
        const daysNeeded = period + 60;
        const period1 = now - daysNeeded * 86400;

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${now}&interval=1d`;

        const response = await fetch(url, {
            headers: {"User-Agent": "Mozilla/5.0"},
        });

        if (!response.ok) {
            const errMsg = `Failed to fetch history for indicators: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();
        const chart = data.chart?.result?.[0];

        if (!chart) {
            const errMsg = `No chart data found for ${symbol}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const quote = chart.indicators?.quote?.[0] || {};
        const closes: number[] = (quote.close || []).filter((v: any) => v != null);

        if (closes.length < 26) {
            const errMsg = `Not enough data points (${closes.length}) for technical analysis. Need at least 26.`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const currentPrice = closes[closes.length - 1];
        const sma20 = sma(closes, 20);
        const sma50 = sma(closes, 50);
        const ema12 = ema(closes, 12);
        const ema26 = ema(closes, 26);
        const rsi14 = rsi(closes, 14);
        const macd = computeMACD(closes);
        const trend = determineTrend(rsi14, macd.histogram, currentPrice, sma50);

        const result = JSON.stringify({
            symbol,
            dataPoints: closes.length,
            currentPrice: Math.round(currentPrice * 100) / 100,
            indicators: {
                sma20,
                sma50,
                ema12,
                ema26,
                rsi14,
                macd: macd.macdLine,
                macdSignal: macd.signalLine,
                macdHistogram: macd.histogram,
            },
            trend,
            interpretation: {
                rsi: rsi14 != null
                    ? rsi14 > 70 ? "Overbought (RSI > 70)" : rsi14 < 30 ? "Oversold (RSI < 30)" : "Neutral"
                    : "Insufficient data",
                macd: macd.histogram != null
                    ? macd.histogram > 0 ? "Bullish (MACD above signal)" : "Bearish (MACD below signal)"
                    : "Insufficient data",
                priceVsSma50: currentPrice != null && sma50 != null
                    ? currentPrice > sma50 ? "Price above SMA(50) — bullish" : "Price below SMA(50) — bearish"
                    : "Insufficient data",
            },
        });

        console.log(`${TAG} OUTPUT: ${symbol} trend=${trend}, RSI=${rsi14}, MACD histogram=${macd.histogram}`);
        return result;
    },
    {
        name: "get_technical_indicators",
        description: "Compute technical indicators for a stock: SMA(20), SMA(50), EMA(12), EMA(26), RSI(14), MACD (line, signal, histogram), and an overall trend signal (bullish/bearish/neutral). Fetches recent history from Yahoo Finance and computes indicators locally. For Israeli stocks use the .TA suffix.",
        schema: z.object({
            symbol: z.string().describe("Stock ticker symbol (e.g., 'AAPL', 'MSFT', 'TEVA.TA')"),
            period: z.number().default(90).describe("Number of days of history to analyze (default 90). More days = more accurate long-term indicators."),
        }),
    }
);
