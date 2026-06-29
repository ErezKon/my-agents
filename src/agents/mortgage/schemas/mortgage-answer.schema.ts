/**
 * ============================================================================
 * MORTGAGE ANSWER SCHEMA — Structured Output for the Mortgage Agent
 * ============================================================================
 *
 * Zod schema defining the shape of the Mortgage agent's final structured
 * response. Passed as `responseFormat` to `createAgent()` to force the LLM
 * to produce JSON matching this exact shape.
 *
 * Fields:
 * - `answerHebrew`: The full advisory answer in Hebrew.
 * - `summary`: A concise 1-2 sentence summary.
 * - `recommendations`: Actionable advice for the borrower.
 * - `openIssues`: Questions or missing information.
 * - `citations`: References to source bank documents with page numbers.
 * ============================================================================
 */
import { z } from "zod";

export const MortgageAnswerSchema = z.object({
    answerHebrew: z.string().describe("The full answer in Hebrew"),
    summary: z.string().describe("A brief Hebrew summary of the answer (1-2 sentences)"),
    recommendations: z.array(z.string()).describe("List of actionable recommendations in Hebrew"),
    openIssues: z.array(z.string()).describe("List of open questions or missing information in Hebrew"),
    citations: z.array(z.object({
        bank: z.string().describe("Bank name"),
        filename: z.string().describe("Source PDF filename"),
        page: z.number().describe("Page number"),
        quote: z.string().optional().describe("Relevant quote from the document"),
    })).describe("Citations from the mortgage offer documents"),
});
