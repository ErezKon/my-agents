import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {LogColors} from '../../../utils/log-colors.util';

export const createReadRepoFileTool = (githubToken: string, githubBaseUrl: string) => tool(
    async ({owner, repo, path}) => {
        console.log(`${LogColors.YELLOW}[read_repo_file]${LogColors.RESET} INPUT: owner=${owner}, repo=${repo}, path=${path}`);
        const response = await fetch(
            `${githubBaseUrl}/repos/${owner}/${repo}/contents/${path}`,
            {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                },
            }
        );

        if (!response.ok) {
            const errMsg = `Failed to read file: ${response.status} ${response.statusText}`;
            console.log(`${LogColors.YELLOW}[read_repo_file]${LogColors.RESET} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();

        if (Array.isArray(data)) {
            // It's a directory, return the listing
            const items = data.map((item: any) => ({
                name: item.name,
                path: item.path,
                type: item.type,
                size: item.size,
            }));
            const result = JSON.stringify({type: 'directory', items});
            console.log(`${LogColors.YELLOW}[read_repo_file]${LogColors.RESET} OUTPUT: directory with ${items.length} items`);
            return result;
        }

        if (data.encoding === 'base64' && data.content) {
            const MAX_FILE_CHARS = 15000;
            let content = Buffer.from(data.content, 'base64').toString('utf-8');
            const wasTruncated = content.length > MAX_FILE_CHARS;
            if (wasTruncated) {
                content = content.slice(0, MAX_FILE_CHARS) + '\n\n... [TRUNCATED — file too large, showing first 15000 chars] ...';
            }
            const result = JSON.stringify({
                type: 'file',
                path: data.path,
                size: data.size,
                truncated: wasTruncated,
                content,
            });
            console.log(`${LogColors.YELLOW}[read_repo_file]${LogColors.RESET} OUTPUT: file=${data.path}, size=${data.size}, truncated=${wasTruncated}`);
            return result;
        }

        const result = JSON.stringify({
            type: 'file',
            path: data.path,
            size: data.size,
            content: '[Binary or unsupported file encoding]',
        });
        console.log(`${LogColors.YELLOW}[read_repo_file]${LogColors.RESET} OUTPUT: binary file=${data.path}, size=${data.size}`);
        return result;
    },
    {
        name: 'read_repo_file',
        description: 'Read the content of a specific file from the repository, or list the contents of a directory. Use this to inspect source code, configuration files, READMEs, and other files.',
        schema: z.object({
            owner: z.string().describe('The repository owner (user or organization)'),
            repo: z.string().describe('The repository name'),
            path: z.string().describe('The file or directory path within the repository (e.g., \'src/index.ts\' or \'package.json\')'),
        }),
    }
);
