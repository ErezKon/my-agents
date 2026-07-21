import {MemorySaver} from '@langchain/langgraph';
import {ChatOpenAI} from '@langchain/openai';
import {createAgent} from 'langchain';
import {LLM_BASE_URL} from '../../config';
import {basicSystemPrompt} from './basic.prompt';

export const createBasicAgent = (apiKey: string) => {
    const checkpointer = new MemorySaver();

    const model = new ChatOpenAI({
        model: 'gpt-oss-120b',
        temperature: 0.5,
        maxRetries: 3,
        timeout: 30000,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: LLM_BASE_URL
        }
    });

    const agent = createAgent({
        model,
        checkpointer,
        systemPrompt: basicSystemPrompt,
        tools: [],
    });

    return agent;
};
