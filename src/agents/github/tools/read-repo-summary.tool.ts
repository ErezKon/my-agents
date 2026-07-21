import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import {LogColors} from '../../../utils/log-colors.util';

const BASE_SUMMARIES_DIR = path.resolve(__dirname, '../repositories-summary');

export const createReadRepoSummaryTool = (summaryVersion?: string) => {
    const SUMMARIES_DIR = summaryVersion
        ? path.join(BASE_SUMMARIES_DIR, summaryVersion)
        : BASE_SUMMARIES_DIR;

    return tool(
    async ({repoName}) => {
        console.log(`${LogColors.BRIGHT_BLUE}[read_repo_summary]${LogColors.RESET} INPUT: repoName=${repoName}`);

        try {
            const files = fs.readdirSync(SUMMARIES_DIR);
            const normalizedInput = repoName.toLowerCase().replace(/[-_\s]/g, '');

            const matchedFile = files.find((file) => {
                const normalizedFile = file.toLowerCase().replace(/[-_\s]/g, '').replace('.md', '');
                return normalizedFile.includes(normalizedInput) || normalizedInput.includes(normalizedFile.replace('reposummary', ''));
            });

            if (!matchedFile) {
                const availableRepos = files
                    .filter((f) => f.endsWith('.md'))
                    .map((f) => f.replace('_REPO_SUMMARY.md', '').replace(/_/g, '-').toLowerCase());
                const msg = `No summary found for repository '${repoName}'. Available summaries: ${availableRepos.join(', ')}`;
                console.log(`${LogColors.BRIGHT_BLUE}[read_repo_summary]${LogColors.RESET} ${msg}`);
                return JSON.stringify({found: false, message: msg});
            }

            const filePath = path.join(SUMMARIES_DIR, matchedFile);
            const content = fs.readFileSync(filePath, 'utf-8');
            console.log(`${LogColors.BRIGHT_BLUE}[read_repo_summary]${LogColors.RESET} Found summary: ${matchedFile} (${content.length} chars)`);
            return JSON.stringify({found: true, file: matchedFile, content});
        } catch (error: any) {
            const errMsg = `Error reading repo summary: ${error.message}`;
            console.log(`${LogColors.BRIGHT_BLUE}[read_repo_summary]${LogColors.RESET} ERROR: ${errMsg}`);
            return JSON.stringify({found: false, error: errMsg});
        }
    },
    {
        name: 'read_repo_summary',
        description: 'Read a pre-existing comprehensive summary/analysis of a known repository. Use this FIRST before any other tools when the user asks about a repository, to check if a detailed summary already exists. This saves tool calls and provides rich architectural context immediately.',
        schema: z.object({
            repoName: z.string().describe('The repository name to look up (e.g. \'block-legacy-gateway\', \'asm-deployer\')'),
        }),
    }
);
};
