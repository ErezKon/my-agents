import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ApplianceModel } from './parse-appliance-files';
import { LogColors } from '../../../utils/log-colors.util';
import { LLM_BASE_URL } from '../../../config';

const TAG = `[generate-merge-summary]`;

export interface RecommendationSets {
    fromGivenBrands: string[];
    fromAlternatives: string[];
    overallBest: string[];
}

export interface MergeSummaryResult {
    summary: string;
    comparisons: { category: string; summary: string; recommendedModel?: string; rationale?: string }[];
    recommendations: RecommendationSets;
}

const SYSTEM_PROMPT = `אתה מומחה למכשירי חשמל ביתיים בישראל. קיבלת נתונים ממוזגים ממספר קבצי השוואה של מכשירי חשמל.

המשימה שלך:
1. כתוב סיכום מאוחד בעברית שמכסה את כל הדגמים שהתקבלו — חזקות, חולשות, ומגמות.
2. עבור כל קטגוריית מכשיר, כתוב השוואה קצרה וציין דגם מומלץ עם נימוק.
3. צור שלוש קבוצות המלצות בעברית:
   - fromGivenBrands: המלצות על הדגמים הטובים ביותר מהמותגים שהמשתמש ציין (סמן: fromGivenList=true)
   - fromAlternatives: המלצות על דגמים טובים ממותגים חלופיים (fromGivenList=false)
   - overallBest: ההמלצות הטובות ביותר ללא תלות במותג

ענה אך ורק בפורמט JSON הבא (ללא טקסט נוסף):
{
  "summary": "סיכום מאוחד בעברית...",
  "comparisons": [
    { "category": "קטגוריה", "summary": "סיכום השוואה", "recommendedModel": "שם הדגם", "rationale": "נימוק" }
  ],
  "recommendations": {
    "fromGivenBrands": ["המלצה 1", "המלצה 2"],
    "fromAlternatives": ["המלצה 1"],
    "overallBest": ["המלצה 1", "המלצה 2"]
  }
}`;

export async function generateMergeSummary(
    apiKey: string,
    appliances: ApplianceModel[],
    category: string,
    existingSummaries: string[],
): Promise<MergeSummaryResult> {
    console.log(`${LogColors.BLUE}${TAG}${LogColors.RESET} Generating unified summary for ${appliances.length} models via LLM...`);

    const model = new ChatOpenAI({
        model: 'gpt-oss-120b',
        temperature: 0.3,
        maxRetries: 3,
        timeout: 120000,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: LLM_BASE_URL
        }
    });

    const applianceSummary = appliances.map((a, i) => {
        const parts = [
            `${i + 1}. ${a.brand} ${a.model}`,
            a.fromGivenList ? "(מהרשימה)" : "(חלופה)",
        ];
        if (a.priceILS) parts.push(`מחיר: ₪${a.priceILS.toLocaleString('en-US')}`);
        if (a.energyRating) parts.push(`דירוג אנרגטי: ${a.energyRating}`);
        if (a.reliability) parts.push(`אמינות: ${a.reliability}`);
        if (a.valueForMoney) parts.push(`תמורה לכסף: ${a.valueForMoney}`);
        if (a.keyFeatures?.length) parts.push(`תכונות: ${a.keyFeatures.join(', ')}`);
        if (a.pros?.length) parts.push(`יתרונות: ${a.pros.join(', ')}`);
        if (a.cons?.length) parts.push(`חסרונות: ${a.cons.join(', ')}`);
        if (a.heightCm || a.widthCm || a.depthCm) {
            parts.push(`מידות: ${a.heightCm ?? '?'}×${a.widthCm ?? '?'}×${a.depthCm ?? '?'} ס"מ`);
        }
        if (a.volumeLiters) parts.push(`נפח: ${a.volumeLiters} ליטר`);
        if (a.warranty) parts.push(`אחריות: ${a.warranty}`);
        return parts.join(' | ');
    }).join('\n');

    const existingSummaryText = existingSummaries.length
        ? `\n\nסיכומים קיימים מהקבצים המקוריים:\n${existingSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
        : '';

    const userMessage = `קטגוריה: ${category}\n\nדגמים ממוזגים:\n${applianceSummary}${existingSummaryText}`;

    const response = await model.invoke([
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(userMessage),
    ]);

    const content = typeof response.content === 'string' ? response.content : '';

    // Extract JSON from the response
    let parsed: MergeSummaryResult;
    try {
        // Try to find JSON in the response (might be wrapped in markdown code blocks)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in LLM response');
        parsed = JSON.parse(jsonMatch[0]);
    } catch (err: any) {
        console.error(`${LogColors.BRIGHT_RED}${TAG}${LogColors.RESET} Failed to parse LLM response: ${err.message}`);
        console.error(`${TAG} Raw response: ${content.slice(0, 500)}`);
        // Return a fallback
        parsed = {
            summary: existingSummaries.join('\n\n') || `סיכום השוואת ${category}`,
            comparisons: [{ category, summary: `השוואה של ${appliances.length} דגמים` }],
            recommendations: {
                fromGivenBrands: [],
                fromAlternatives: [],
                overallBest: [],
            },
        };
    }

    // Ensure structure integrity
    if (!parsed.recommendations) {
        parsed.recommendations = { fromGivenBrands: [], fromAlternatives: [], overallBest: [] };
    }
    if (!Array.isArray(parsed.comparisons)) {
        parsed.comparisons = [{ category, summary: parsed.summary }];
    }

    console.log(`${LogColors.BLUE}${TAG}${LogColors.RESET} Generated summary (${parsed.summary.length} chars), ${parsed.comparisons.length} comparisons, ${parsed.recommendations.fromGivenBrands.length + parsed.recommendations.fromAlternatives.length + parsed.recommendations.overallBest.length} recommendations`);
    return parsed;
}
