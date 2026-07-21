import {MemorySaver} from '@langchain/langgraph';
import {ChatOpenAI} from '@langchain/openai';
import {createAgent} from 'langchain';
import {ConfluenceAnswerSchema} from './schemas/confluence-answer.schema';
import {createSearchConfluenceTool} from './tools/search-confluence.tool';
import {createGetPageContentTool} from './tools/get-page-content.tool';
import {createListSpacesTool} from './tools/list-spaces.tool';
import {createGetPageChildrenTool} from './tools/get-page-children.tool';
import {LLM_BASE_URL, CONFLUENCE_INSTANCES, ConfluenceInstance} from '../../config';
import {buildConfluenceSystemPrompt} from './confluence.prompt';

export const createConfluenceAgent = (
    apiKey: string,
    instances: ConfluenceInstance[] = CONFLUENCE_INSTANCES,
) => {
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

    // Tool call budget enforcement — prevents the agent from looping indefinitely
    const MAX_TOOL_CALLS = 10;
    const callTracker = { count: 0 };
    const wrapWithBudget = (t: any) => {
        const origFunc = t.func;
        t.func = async (input: any, config?: any) => {
            callTracker.count++;
            if (callTracker.count > MAX_TOOL_CALLS) {
                return JSON.stringify({
                    error: `TOOL BUDGET EXHAUSTED (${MAX_TOOL_CALLS} calls used). STOP calling tools immediately. Synthesize your final answer NOW from the information you have already collected.`
                });
            }
            return origFunc(input, config);
        };
        return t;
    };

    // Dynamically create tools for each configured Confluence instance
    const tools: any[] = [];
    for (const inst of instances) {
        tools.push(
            wrapWithBudget(createSearchConfluenceTool(inst.token, inst.baseUrl, inst.name)),
            wrapWithBudget(createGetPageContentTool(inst.token, inst.baseUrl, inst.name)),
            wrapWithBudget(createListSpacesTool(inst.token, inst.baseUrl, inst.name)),
            wrapWithBudget(createGetPageChildrenTool(inst.token, inst.baseUrl, inst.name)),
        );
    }

    const agent = createAgent({
        model,
        checkpointer,
        systemPrompt: buildConfluenceSystemPrompt(instances),
        responseFormat: ConfluenceAnswerSchema,
        tools,
    });

    return agent;
};
