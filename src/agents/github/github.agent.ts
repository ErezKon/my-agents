import {MemorySaver} from '@langchain/langgraph';
import {ChatOpenAI} from '@langchain/openai';
import {createAgent} from 'langchain';
import {githubSystemPrompt, prImpactSystemPrompt, repoQASystemPrompt} from './github.prompt';
import {AnalysisSchema} from './schemas/analysis.schema';
import {PrImpactSchema} from './schemas/pr-impact.schema';
import {RepoQASchema} from './schemas/qa.schema';
import {createGetAllRepoSummariesTool} from './tools/get-all-repo-summaries.tool';
import {createGetPrDiffTool} from './tools/get-pr-diff.tool';
import {createGetRepoInfoTool} from './tools/get-repo-info.tool';
import {createGetRepoTreeTool} from './tools/get-repo-tree.tool';
import {createReadRepoFileTool} from './tools/read-repo-file.tool';
import {createReadRepoSummaryTool} from './tools/read-repo-summary.tool';
import {createSearchRepoCodeTool} from './tools/search-repo-code.tool';
import {createCloneRepoTool} from './tools/clone-repo.tool';
import {createReadLocalFileTool} from './tools/read-local-file.tool';
import {createListLocalTreeTool} from './tools/list-local-tree.tool';
import {createSearchLocalCodeTool} from './tools/search-local-code.tool';
import {LLM_BASE_URL, PRIMARY_GITHUB, PUBLIC_GITHUB} from '../../config';

const DEFAULT_GITHUB_BASE_URL = PRIMARY_GITHUB?.apiUrl ?? '';
const DEFAULT_GITHUB_TOKEN = PRIMARY_GITHUB?.token ?? '';

export const createGitHubAgent = (
    apiKey: string,
    githubToken: string = DEFAULT_GITHUB_TOKEN,
    githubBaseUrl: string = DEFAULT_GITHUB_BASE_URL,
    summaryVersion?: string
) => {
    const checkpointer = new MemorySaver();

    const model = new ChatOpenAI({
        model: 'gpt-oss-120b',
        temperature: 0,
        maxRetries: 3,
        timeout: 30000,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: LLM_BASE_URL
        }
    });

    const readRepoSummary = createReadRepoSummaryTool(summaryVersion);
    const getRepoInfo = createGetRepoInfoTool(githubToken, githubBaseUrl);
    const getRepoTree = createGetRepoTreeTool(githubToken, githubBaseUrl);
    const readRepoFile = createReadRepoFileTool(githubToken, githubBaseUrl);
    const searchRepoCode = createSearchRepoCodeTool(githubToken, githubBaseUrl);

    const agent = createAgent({
        model,
        checkpointer,
        systemPrompt: githubSystemPrompt,
        responseFormat: AnalysisSchema,
        tools: [readRepoSummary, getRepoInfo, getRepoTree, readRepoFile, searchRepoCode],
    });

    return agent;
};

export const createPrImpactAgent = (
    apiKey: string,
    githubToken: string = DEFAULT_GITHUB_TOKEN,
    githubBaseUrl: string = DEFAULT_GITHUB_BASE_URL,
    summaryVersion?: string
) => {
    const checkpointer = new MemorySaver();

    const model = new ChatOpenAI({
        model: 'codellama-13b-instruct',
        temperature: 0,
        maxRetries: 3,
        timeout: 60000,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: LLM_BASE_URL
        }
    });

    const getPrDiff = createGetPrDiffTool(githubToken, githubBaseUrl);
    const getAllRepoSummaries = createGetAllRepoSummariesTool(summaryVersion);
    const readRepoSummary = createReadRepoSummaryTool(summaryVersion);
    const readRepoFile = createReadRepoFileTool(githubToken, githubBaseUrl);
    const getRepoTree = createGetRepoTreeTool(githubToken, githubBaseUrl);

    const agent = createAgent({
        model,
        checkpointer,
        systemPrompt: prImpactSystemPrompt,
        responseFormat: PrImpactSchema,
        tools: [getPrDiff, getAllRepoSummaries, readRepoSummary, readRepoFile, getRepoTree],
    });

    return agent;
};

export const createRepoQAAgent = (
    apiKey: string,
    githubToken: string = DEFAULT_GITHUB_TOKEN,
    githubBaseUrl: string = DEFAULT_GITHUB_BASE_URL,
    publicGithubToken?: string,
    summaryVersion?: string
) => {
    const checkpointer = new MemorySaver();

    const model = new ChatOpenAI({
        model: 'gpt-oss-120b',
        temperature: 0,
        maxRetries: 3,
        timeout: 60000,
        openAIApiKey: apiKey,
        apiKey: apiKey,
        configuration: {
            baseURL: LLM_BASE_URL
        }
    });

    // API-based tools (for quick lookups)
    const readRepoSummary = createReadRepoSummaryTool(summaryVersion);
    const getRepoInfo = createGetRepoInfoTool(githubToken, githubBaseUrl);
    const getRepoTree = createGetRepoTreeTool(githubToken, githubBaseUrl);
    const readRepoFile = createReadRepoFileTool(githubToken, githubBaseUrl);
    const searchRepoCode = createSearchRepoCodeTool(githubToken, githubBaseUrl);

    // Local clone-based tools (for deep analysis)
    const cloneRepo = createCloneRepoTool(githubToken, publicGithubToken);
    const readLocalFile = createReadLocalFileTool();
    const listLocalTree = createListLocalTreeTool();
    const searchLocalCode = createSearchLocalCodeTool();

    const agent = createAgent({
        model,
        checkpointer,
        systemPrompt: repoQASystemPrompt,
        responseFormat: RepoQASchema,
        tools: [
            readRepoSummary, getRepoInfo, getRepoTree, readRepoFile, searchRepoCode,
            cloneRepo, readLocalFile, listLocalTree, searchLocalCode,
        ],
    });

    return agent;
};
