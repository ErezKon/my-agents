import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {LogColors} from '../../../utils/log-colors.util';

const MAX_DIFF_CHARS = 30000;

export const createGetPrDiffTool = (githubToken: string, githubBaseUrl: string) => tool(
    async ({owner, repo, prNumber}) => {
        console.log(`${LogColors.RED}[get_pr_diff]${LogColors.RESET} INPUT: owner=${owner}, repo=${repo}, prNumber=${prNumber}`);

        // 1. Fetch PR metadata
        const prResponse = await fetch(
            `${githubBaseUrl}/repos/${owner}/${repo}/pulls/${prNumber}`,
            {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                },
            }
        );

        if (!prResponse.ok) {
            const errMsg = `Failed to fetch PR: ${prResponse.status} ${prResponse.statusText}`;
            console.log(`${LogColors.RED}[get_pr_diff]${LogColors.RESET} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const prData = await prResponse.json();

        // 2. Fetch the list of changed files with patches
        const filesResponse = await fetch(
            `${githubBaseUrl}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
            {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                },
            }
        );

        if (!filesResponse.ok) {
            const errMsg = `Failed to fetch PR files: ${filesResponse.status} ${filesResponse.statusText}`;
            console.log(`${LogColors.RED}[get_pr_diff]${LogColors.RESET} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const filesData = await filesResponse.json();

        const files = filesData.map((file: any) => ({
            filename: file.filename,
            status: file.status, // added, removed, modified, renamed
            additions: file.additions,
            deletions: file.deletions,
            changes: file.changes,
            previousFilename: file.previous_filename || null,
            patch: file.patch || null, // the actual diff
        }));

        // Trim patches if total is too large
        let totalPatchChars = files.reduce((sum: number, f: any) => sum + (f.patch?.length || 0), 0);
        if (totalPatchChars > MAX_DIFF_CHARS) {
            let remaining = MAX_DIFF_CHARS;
            for (const file of files) {
                if (file.patch) {
                    if (remaining <= 0) {
                        file.patch = '[TRUNCATED — diff too large]';
                    } else if (file.patch.length > remaining) {
                        file.patch = file.patch.slice(0, remaining) + '\n... [TRUNCATED]';
                        remaining = 0;
                    } else {
                        remaining -= file.patch.length;
                    }
                }
            }
        }

        const result = JSON.stringify({
            pr: {
                number: prData.number,
                title: prData.title,
                body: prData.body?.slice(0, 2000) || '',
                state: prData.state,
                author: prData.user?.login,
                baseBranch: prData.base?.ref,
                headBranch: prData.head?.ref,
                createdAt: prData.created_at,
                updatedAt: prData.updated_at,
                changedFiles: prData.changed_files,
                additions: prData.additions,
                deletions: prData.deletions,
            },
            files,
        });

        console.log(`${LogColors.RED}[get_pr_diff]${LogColors.RESET} OUTPUT: PR #${prData.number} '${prData.title}' — ${files.length} files changed`);
        return result;
    },
    {
        name: 'get_pr_diff',
        description: 'Fetch a Pull Request\'s metadata and file-level diffs (patches). Returns PR title, description, changed files list with their actual code diffs. Use this to understand what a PR changes before analyzing its impact.',
        schema: z.object({
            owner: z.string().describe('The repository owner (user or organization)'),
            repo: z.string().describe('The repository name'),
            prNumber: z.number().describe('The pull request number'),
        }),
    }
);
