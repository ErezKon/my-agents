import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {execSync} from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {LogColors} from '../../../utils/log-colors.util';
import {GITHUB_INSTANCES, PRIMARY_GITHUB} from '../../../config';

// Track cloned repos for cleanup on process exit
const clonedPaths: string[] = [];

process.on('exit', () => {
    for (const p of clonedPaths) {
        try {
            fs.rmSync(p, {recursive: true, force: true});
        } catch { /* best effort */ }
    }
});

export const createCloneRepoTool = (
    enterpriseToken?: string,
    publicToken?: string
) => tool(
    async ({repoUrl, shallow}) => {
        console.log(`${LogColors.BRIGHT_GREEN}[clone_repo]${LogColors.RESET} INPUT: repoUrl=${repoUrl}, shallow=${shallow}`);

        try {
            // Resolve the clone URL
            let cloneUrl: string;

            if (repoUrl.startsWith('http://') || repoUrl.startsWith('https://')) {
                // Full URL provided — find matching instance and inject token
                const url = new URL(repoUrl);
                const matchedInstance = GITHUB_INSTANCES.find(i => i.host === url.hostname);
                if (matchedInstance?.token) {
                    url.username = 'x-access-token';
                    url.password = matchedInstance.token;
                }
                cloneUrl = url.toString();
            } else if (repoUrl.includes('/')) {
                // owner/repo shorthand
                const [owner, repo] = repoUrl.split('/');
                const isPublic = repoUrl.startsWith('public:') || repoUrl.startsWith('github:');
                const cleanOwner = owner.replace(/^(public:|github:)/, '');

                if (isPublic) {
                    const pubInstance = GITHUB_INSTANCES.find(i => i.host === 'github.com');
                    const url = new URL(`https://github.com/${cleanOwner}/${repo}.git`);
                    const token = publicToken ?? pubInstance?.token;
                    if (token) {
                        url.username = 'x-access-token';
                        url.password = token;
                    }
                    cloneUrl = url.toString();
                } else {
                    // Default to primary (first non-public) instance
                    const primary = PRIMARY_GITHUB;
                    const host = primary?.host ?? 'github.com';
                    const url = new URL(`https://${host}/${owner}/${repo}.git`);
                    const token = enterpriseToken ?? primary?.token;
                    if (token) {
                        url.username = 'x-access-token';
                        url.password = token;
                    }
                    cloneUrl = url.toString();
                }
            } else {
                return JSON.stringify({error: `Invalid repoUrl: '${repoUrl}'. Provide a full URL or owner/repo shorthand.`});
            }

            // Create temp directory
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
            clonedPaths.push(tmpDir);

            // Build git clone command
            const depthFlag = shallow !== false ? '--depth 1' : '';
            const cmd = `git clone ${depthFlag} "${cloneUrl}" "${tmpDir}"`;

            // Mask the URL in logs to hide tokens
            const safeUrl = cloneUrl.replace(/\/\/[^@]+@/, '//***@');
            console.log(`${LogColors.BRIGHT_GREEN}[clone_repo]${LogColors.RESET} Cloning ${safeUrl} to ${tmpDir}...`);

            execSync(cmd, {
                stdio: 'pipe',
                timeout: 120_000,
                env: {...process.env, GIT_TERMINAL_PROMPT: '0'},
            });

            // Get basic info about the cloned repo
            const entries = fs.readdirSync(tmpDir).filter(e => e !== '.git');
            const result = JSON.stringify({
                localPath: tmpDir,
                fileCount: entries.length,
                topLevelEntries: entries.slice(0, 50),
                message: `Repository cloned successfully to ${tmpDir}. Use the local file tools (read_local_file, list_local_tree, search_local_code) with this localPath to explore the code.`,
            });

            console.log(`${LogColors.BRIGHT_GREEN}[clone_repo]${LogColors.RESET} OUTPUT: cloned to ${tmpDir} (${entries.length} top-level entries)`);
            return result;
        } catch (error: any) {
            const errMsg = `Failed to clone repository: ${error.message}`;
            console.log(`${LogColors.BRIGHT_GREEN}[clone_repo]${LogColors.RESET} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }
    },
    {
        name: 'clone_repo',
        description: `Clone a GitHub repository to a local temp directory for deep analysis. Supports:
- Full HTTPS URLs: "https://github.com/user/repo" or any configured GitHub instance URL
- Shorthand: "owner/repo" (defaults to the primary configured GitHub instance)
- Public GitHub shorthand: "public:owner/repo" or "github:owner/repo"
After cloning, use read_local_file, list_local_tree, and search_local_code with the returned localPath to explore the code.`,
        schema: z.object({
            repoUrl: z.string().describe('Repository URL or owner/repo shorthand. Prefix with "public:" or "github:" for public GitHub repos.'),
            shallow: z.boolean().optional().default(true).describe('Use shallow clone (--depth 1) for faster cloning. Default: true.'),
        }),
    }
);
