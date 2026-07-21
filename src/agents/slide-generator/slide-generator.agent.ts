import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { slideGeneratorSystemPrompt } from './slide-generator.prompt';
import { SlideDeckSchema } from './schemas/slide-deck.schema';
import { createResearchTopicTool } from './tools/research-topic.tool';
import { searchImages } from './tools/search-images.tool';
import { searchMemes } from './tools/search-memes.tool';
import { createGeneratePptxTool } from './tools/generate-pptx.tool';
import { createGenerateRevealJsTool } from './tools/generate-revealjs.tool';
import { createParseAttachedFileTool } from './tools/parse-attached-file.tool';

// Reused GitHub tools for optional code-base analysis
import { createGetRepoInfoTool } from '../github/tools/get-repo-info.tool';
import { createGetRepoTreeTool } from '../github/tools/get-repo-tree.tool';
import { createReadRepoFileTool } from '../github/tools/read-repo-file.tool';
import { createSearchRepoCodeTool } from '../github/tools/search-repo-code.tool';
import { createCloneRepoTool } from '../github/tools/clone-repo.tool';
import { createReadLocalFileTool } from '../github/tools/read-local-file.tool';
import { createListLocalTreeTool } from '../github/tools/list-local-tree.tool';
import { createSearchLocalCodeTool } from '../github/tools/search-local-code.tool';
import { LLM_BASE_URL, PRIMARY_GITHUB, PUBLIC_GITHUB } from '../../config';

export interface SlideGeneratorOptions {
    outputDir: string;
    /** Enterprise GitHub token (for code-base analysis). Optional. */
    githubToken?: string;
    /** Enterprise GitHub API base URL. */
    githubBaseUrl?: string;
    /** Public github.com token (for cloning public repos). Optional. */
    publicGithubToken?: string;
}

export const createSlideGeneratorAgent = (apiKey: string, options: SlideGeneratorOptions) => {
    const { outputDir, githubToken = PRIMARY_GITHUB?.token ?? '', githubBaseUrl = PRIMARY_GITHUB?.apiUrl ?? '', publicGithubToken } = options;

    const checkpointer = new MemorySaver();

    const model = new ChatOpenAI({
        model: 'gpt-oss-120b',
        temperature: 0.4,
        maxRetries: 3,
        timeout: 60000,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: LLM_BASE_URL
        }
    });

    const tools = [
        // Research + visuals
        createResearchTopicTool(outputDir),
        searchImages,
        searchMemes,
        // Attached file parsing (pptx, pdf, md, txt, etc.)
        createParseAttachedFileTool(),
        // Code-base analysis (optional — used only when the user provides a repo)
        createGetRepoInfoTool(githubToken, githubBaseUrl),
        createGetRepoTreeTool(githubToken, githubBaseUrl),
        createReadRepoFileTool(githubToken, githubBaseUrl),
        createSearchRepoCodeTool(githubToken, githubBaseUrl),
        createCloneRepoTool(githubToken, publicGithubToken || undefined),
        createReadLocalFileTool(),
        createListLocalTreeTool(),
        createSearchLocalCodeTool(),
        // Final output — two formats
        createGeneratePptxTool(outputDir),
        createGenerateRevealJsTool(outputDir),
    ];

    const agent = createAgent({
        model,
        checkpointer,
        systemPrompt: slideGeneratorSystemPrompt,
        responseFormat: SlideDeckSchema,
        tools,
    });

    return agent;
};
