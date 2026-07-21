import { z } from 'zod';

export const AppliancesAnswerSchema = z.object({
    answerHebrew: z.string().describe('The full answer in Hebrew'),
    summary: z.string().describe('A brief Hebrew summary of the answer (1-2 sentences)'),
    appliances: z.array(z.object({
        category: z.string().describe('Appliance category in Hebrew (e.g. מקרר, תנור, מיקרוגל)'),
        brand: z.string().describe('Brand name (e.g. Bosch, Samsung)'),
        model: z.string().describe('Model name/number'),
        keyFeatures: z.array(z.string()).describe('Key features in Hebrew'),
        reliability: z.string().optional().describe('Reliability/reputation assessment in Hebrew'),
        energyRating: z.string().optional().describe('Energy efficiency rating (e.g. A, A+, B)'),
        priceILS: z.number().optional().describe('Approximate price in ILS (₪)'),
        valueForMoney: z.string().optional().describe('Value-for-money assessment in Hebrew'),
        heightCm: z.number().optional().describe('Height in cm'),
        widthCm: z.number().optional().describe('Width in cm'),
        depthCm: z.number().optional().describe('Depth in cm'),
        volumeLiters: z.number().optional().describe('Volume/capacity in liters (if applicable, e.g. for refrigerators)'),
        pros: z.array(z.string()).optional().describe('Advantages / pros in Hebrew'),
        cons: z.array(z.string()).optional().describe('Disadvantages / cons in Hebrew'),
        fromGivenList: z.boolean().optional().describe('True if this brand was in the user-provided list, false if it is an alternative found by the agent'),
        url: z.string().optional().describe('URL of the product page where the model info was found'),
    })).describe('All appliance models considered'),
    comparisons: z.array(z.object({
        category: z.string().describe('Appliance category being compared (Hebrew)'),
        summary: z.string().describe('Comparison summary for this appliance in Hebrew'),
        recommendedModel: z.string().optional().describe('The recommended model for this category'),
        rationale: z.string().optional().describe('Why this model is recommended (Hebrew)'),
    })).describe('Per-appliance comparison summaries'),
    recommendations: z.array(z.string()).describe('Overall recommendations in Hebrew'),
    generatedFiles: z.array(z.object({
        category: z.string().describe('Appliance category the file covers'),
        excelPath: z.string().optional().describe('Path to the generated Excel file'),
        pdfPath: z.string().optional().describe('Path to the generated PDF file'),
    })).optional().describe('Comparison files generated for each appliance'),
    sources: z.array(z.object({
        title: z.string().describe('Source title or site name'),
        url: z.string().describe('Source URL'),
    })).optional().describe('Web sources used'),
});
