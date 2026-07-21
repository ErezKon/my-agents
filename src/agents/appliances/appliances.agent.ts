import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { appliancesSystemPrompt } from './appliances.prompt';
import { AppliancesAnswerSchema } from './schemas/appliances-answer.schema';
import { listApplianceCategories } from './tools/list-appliance-categories.tool';
import { createSearchAppliancesTool } from './tools/search-appliances.tool';
import { createGetApplianceDetailsTool } from './tools/get-appliance-details.tool';
import { createFindApplianceAlternativesTool } from './tools/find-appliance-alternatives.tool';
import { compareAppliances } from './tools/compare-appliances.tool';
import { applianceGlossary } from './tools/appliance-glossary.tool';
import { createExportApplianceComparisonTool } from './tools/export-appliance-comparison.tool';
import { LLM_BASE_URL } from '../../config';

export const createAppliancesAgent = (apiKey: string, outputDir: string) => {
    const checkpointer = new MemorySaver();

    const model = new ChatOpenAI({
        model: 'gpt-oss-120b',
        temperature: 0.3,
        maxRetries: 3,
        timeout: 60000,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: LLM_BASE_URL
        }
    });

    const agent = createAgent({
        model,
        checkpointer,
        systemPrompt: appliancesSystemPrompt,
        responseFormat: AppliancesAnswerSchema,
        tools: [
            listApplianceCategories,
            createSearchAppliancesTool(outputDir),
            createGetApplianceDetailsTool(outputDir),
            createFindApplianceAlternativesTool(outputDir),
            compareAppliances,
            applianceGlossary,
            createExportApplianceComparisonTool(outputDir),
        ],
    });

    return agent;
};
