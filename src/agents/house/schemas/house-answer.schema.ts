/**
 * ============================================================================
 * HOUSE ANSWER SCHEMA — Structured Output for the House Agent
 * ============================================================================
 *
 * Zod schema defining the shape of the House agent's final structured
 * response. Passed as responseFormat to createAgent() to force the LLM
 * to produce JSON matching this shape.
 *
 * The schema captures the dual nature of the house agent (legal + technical):
 * - answerHebrew: The full answer in Hebrew
 * - category: Whether the answer is legal, technical, or mixed
 * - keyFindings: Important facts discovered in the documents
 * - citations: References to source documents with page numbers
 * - measurements: Optional measurement results from diagrams
 * ============================================================================
 */
import { z } from "zod";

export const HouseAnswerSchema = z.object({
    answerHebrew: z.string().describe("The full answer in Hebrew"),
    summary: z.string().describe("A brief Hebrew summary of the answer (1-2 sentences)"),
    category: z.enum(["legal", "technical", "mixed"]).describe("Whether the answer relates to contracts (legal), diagrams (technical), or both"),
    keyFindings: z.array(z.string()).describe("List of key findings or facts in Hebrew"),
    openIssues: z.array(z.string()).describe("List of open questions or missing information in Hebrew"),
    citations: z.array(z.object({
        filename: z.string().describe("Source PDF filename"),
        page: z.number().describe("Page number"),
        quote: z.string().optional().describe("Relevant quote from the document"),
    })).describe("Citations from the house documents"),
    measurements: z.array(z.object({
        description: z.string().describe("What was measured"),
        value: z.number().describe("Measurement value"),
        unit: z.string().describe("Unit of measurement (m, m², cm)"),
        uncertainty: z.string().optional().describe("Uncertainty range"),
    })).optional().describe("Any measurements taken from diagrams"),
});
