import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { mg4SystemPrompt } from './mg4.prompt';
import { searchManuals } from './tools/search-manuals.tool';
import { listManuals } from './tools/list-manuals.tool';
import { getTips } from './tools/get-tips.tool';

export const createMG4Agent = (apiKey: string) => {
    const checkpointer = new MemorySaver();

    const model = new ChatOpenAI({
        model: "gpt-oss-120b",
        temperature: 0.3,
        maxRetries: 3,
        timeout: 60000,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: "https://genai-api-dev.dell.com/v1"
        }
    });

    const ollamaModel = new ChatOpenAI({
        model: "gpt-oss-120b",
        temperature: 0.3,
        maxRetries: 3,
        timeout: 60000,
        apiKey: "ApiKey here",
        configuration: {
            baseURL: "enter your address here"
        }
    });

    const agent = createAgent({
        model,
        checkpointer,
        systemPrompt: mg4SystemPrompt,
        tools: [searchManuals, listManuals, getTips],
    });

    return agent;
};
