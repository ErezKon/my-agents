import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {LogColors} from '../../../utils/log-colors.util';

const MAX_TREE_ITEMS = 500;

export const createGetRepoTreeTool = (githubToken: string, githubBaseUrl: string) => tool(
    async ({owner, repo, branch, path, maxDepth}) => {
        console.log(`${LogColors.MAGENTA}[get_repo_tree]${LogColors.RESET} INPUT: owner=${owner}, repo=${repo}, branch=${branch}, path=${path}, maxDepth=${maxDepth}`);
        // If no branch provided, fetch the default branch first
        let targetBranch = branch;
        if (!targetBranch) {
            const repoResponse = await fetch(`${githubBaseUrl}/repos/${owner}/${repo}`, {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                },
            });

            if (!repoResponse.ok) {
                const errMsg = `Failed to fetch repo info: ${repoResponse.status} ${repoResponse.statusText}`;
                console.log(`${LogColors.MAGENTA}[get_repo_tree]${LogColors.RESET} ERROR: ${errMsg}`);
                return JSON.stringify({error: errMsg});
            }

            const repoData = await repoResponse.json();
            targetBranch = repoData.default_branch;
        }

        const response = await fetch(
            `${githubBaseUrl}/repos/${owner}/${repo}/git/trees/${targetBranch}?recursive=1`,
            {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                },
            }
        );

        if (!response.ok) {
            const errMsg = `Failed to fetch repo tree: ${response.status} ${response.statusText}`;
            console.log(`${LogColors.MAGENTA}[get_repo_tree]${LogColors.RESET} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();

        let tree = data.tree
            .filter((item: any) => item.type === 'blob' || item.type === 'tree')
            .map((item: any) => ({
                path: item.path,
                type: item.type === 'blob' ? 'file' : 'directory',
                size: item.size || 0,
            }));

        // Filter by path prefix if provided
        if (path) {
            const prefix = path.endsWith('/') ? path : path + '/';
            tree = tree.filter((item: any) => item.path.startsWith(prefix) || item.path === path);
        }

        // Filter by max depth
        const baseDepth = path ? path.split('/').length : 0;
        const effectiveMaxDepth = maxDepth ?? 3;
        tree = tree.filter((item: any) => {
            const depth = item.path.split('/').length;
            return depth <= baseDepth + effectiveMaxDepth;
        });

        const totalBeforeCap = tree.length;
        if (tree.length > MAX_TREE_ITEMS) {
            tree = tree.slice(0, MAX_TREE_ITEMS);
        }

        const result = JSON.stringify({
            branch: targetBranch,
            totalItems: totalBeforeCap,
            shown: tree.length,
            capped: totalBeforeCap > MAX_TREE_ITEMS,
            tree,
        });
        console.log(`${LogColors.MAGENTA}[get_repo_tree]${LogColors.RESET} OUTPUT: totalItems=${totalBeforeCap}, shown=${tree.length}, capped=${totalBeforeCap > MAX_TREE_ITEMS}`);
        return result;
    },
    {
        name: 'get_repo_tree',
        description: 'Get the file and directory tree of a repository. Returns up to 500 items. Use \'path\' to focus on a subdirectory and \'maxDepth\' to control depth (default 3). Call multiple times with different paths to explore large repos.',
        schema: z.object({
            owner: z.string().describe('The repository owner (user or organization)'),
            repo: z.string().describe('The repository name'),
            branch: z.string().optional().describe('Branch name. If not provided, uses the default branch.'),
            path: z.string().optional().describe('Optional subdirectory path to filter the tree (e.g., \'src\' or \'src/components\')'),
            maxDepth: z.number().optional().describe('Maximum directory depth to return (default 3). Use 1 for top-level only.'),
        }),
    }
);
