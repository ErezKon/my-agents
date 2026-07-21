import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {LogColors} from '../../../utils/log-colors.util';

export const createSearchRepoCodeTool = (githubToken: string, githubBaseUrl: string) => {
    const searchCache = new Map<string, string>();

    return tool(
    async ({owner, repo, query}) => {
        console.log(`${LogColors.BLUE}[search_repo_code]${LogColors.RESET} INPUT: owner=${owner}, repo=${repo}, query=${query}`);

        const cacheKey = `${owner}/${repo}::${query}`;
        if (searchCache.has(cacheKey)) {
            const msg = `DUPLICATE SEARCH — you already searched for '${query}' in ${owner}/${repo} and got: ${searchCache.get(cacheKey)}. Do NOT repeat this search. Try a different query, a different repo, or proceed with your analysis using the information you already have.`;
            console.log(`${LogColors.BLUE}[search_repo_code]${LogColors.RESET} SKIPPED (duplicate)`);
            return JSON.stringify({error: msg});
        }
        // GitHub code search API uses the main API host, not the /api/v3 path for search
        const searchUrl = `${githubBaseUrl}/search/code?q=${encodeURIComponent(query + ` repo:${owner}/${repo}`)}`;

        const response = await fetch(searchUrl, {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        if (!response.ok) {
            const errMsg = `Code search failed: ${response.status} ${response.statusText}`;
            console.log(`${LogColors.BLUE}[search_repo_code]${LogColors.RESET} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();

        const results = (data.items || []).slice(0, 20).map((item: any) => ({
            name: item.name,
            path: item.path,
            htmlUrl: item.html_url,
        }));

        const result = JSON.stringify({
            totalCount: data.total_count,
            resultsShown: results.length,
            results,
        });
        const summary = `totalCount=${data.total_count}, shown=${results.length}`;
        searchCache.set(cacheKey, summary);

        console.log(`${LogColors.BLUE}[search_repo_code]${LogColors.RESET} OUTPUT: ${summary}`);
        return result;
    },
    {
        name: 'search_repo_code',
        description: 'Search for code patterns, function names, class names, or any text within the repository. IMPORTANT: Never call this tool twice with the same owner+repo+query — duplicate calls will be rejected. If a search returns 0 results, try a DIFFERENT query or a DIFFERENT repo, or conclude that the pattern does not exist in that repo.',
        schema: z.object({
            owner: z.string().describe('The repository owner (user or organization)'),
            repo: z.string().describe('The repository name'),
            query: z.string().describe('The search query — can be a function name, class name, import, or any code pattern'),
        }),
    }
);
};
