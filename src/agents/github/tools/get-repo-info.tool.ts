import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {LogColors} from '../../../utils/log-colors.util';

export const createGetRepoInfoTool = (githubToken: string, githubBaseUrl: string) => tool(
    async ({owner, repo}) => {
        console.log(`${LogColors.BRIGHT_GREEN}[get_repo_info]${LogColors.RESET} INPUT: owner=${owner}, repo=${repo}`);
        const response = await fetch(`${githubBaseUrl}/repos/${owner}/${repo}`, {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        if (!response.ok) {
            const errMsg = `Failed to fetch repo info: ${response.status} ${response.statusText}`;
            console.log(`${LogColors.BRIGHT_GREEN}[get_repo_info]${LogColors.RESET} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();

        const result = JSON.stringify({
            name: data.name,
            fullName: data.full_name,
            description: data.description,
            language: data.language,
            defaultBranch: data.default_branch,
            private: data.private,
            size: data.size,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            topics: data.topics,
            openIssuesCount: data.open_issues_count,
            forksCount: data.forks_count,
            stargazersCount: data.stargazers_count,
        });
        console.log(`${LogColors.BRIGHT_GREEN}[get_repo_info]${LogColors.RESET} OUTPUT: ${result.slice(0, 500)}`);
        return result;
    },
    {
        name: 'get_repo_info',
        description: 'Fetch repository metadata including description, primary language, default branch, size, and other key information. Use this first to understand what a repository is about.',
        schema: z.object({
            owner: z.string().describe('The repository owner (user or organization)'),
            repo: z.string().describe('The repository name'),
        }),
    }
);
