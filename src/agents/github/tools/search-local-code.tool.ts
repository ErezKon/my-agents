import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {execSync} from 'child_process';
import * as path from 'path';
import {LogColors} from '../../../utils/log-colors.util';

const MAX_RESULTS = 50;
const MAX_OUTPUT_CHARS = 15000;

export const createSearchLocalCodeTool = () => tool(
    async ({localPath, query, filePattern, caseSensitive}) => {
        console.log(`${LogColors.BLUE}[search_local_code]${LogColors.RESET} INPUT: localPath=${localPath}, query=${query}, filePattern=${filePattern || '*'}`);

        try {
            // Validate localPath is a temp directory (security check)
            const resolvedPath = path.resolve(localPath);
            if (!resolvedPath.startsWith('/tmp') && !resolvedPath.startsWith(require('os').tmpdir())) {
                return JSON.stringify({error: 'localPath must be inside a temp directory (created by clone_repo).'});
            }

            const caseFlag = caseSensitive ? '' : '-i';
            const includeFlag = filePattern ? `--include="${filePattern}"` : '';
            const cmd = `grep -rn ${caseFlag} ${includeFlag} --max-count=${MAX_RESULTS} -- "${query}" "${resolvedPath}" 2>/dev/null || true`;

            const output = execSync(cmd, {
                timeout: 30_000,
                maxBuffer: 1024 * 1024,
                encoding: 'utf-8',
            });

            if (!output.trim()) {
                const msg = `No matches found for '${query}' in ${resolvedPath}`;
                console.log(`${LogColors.BLUE}[search_local_code]${LogColors.RESET} ${msg}`);
                return JSON.stringify({found: false, message: msg});
            }

            // Parse grep output into structured results
            const lines = output.trim().split('\n').slice(0, MAX_RESULTS);
            const results = lines.map(line => {
                // Format: /path/to/file:lineNum:content
                const prefixEnd = resolvedPath.length + 1; // +1 for the trailing /
                const relativeLine = line.slice(prefixEnd);
                const colonIdx = relativeLine.indexOf(':');
                const secondColon = relativeLine.indexOf(':', colonIdx + 1);
                if (colonIdx === -1 || secondColon === -1) return {raw: relativeLine};
                return {
                    file: relativeLine.slice(0, colonIdx),
                    line: parseInt(relativeLine.slice(colonIdx + 1, secondColon), 10),
                    content: relativeLine.slice(secondColon + 1).trim(),
                };
            });

            let resultStr = JSON.stringify({found: true, count: results.length, results});
            if (resultStr.length > MAX_OUTPUT_CHARS) {
                resultStr = resultStr.slice(0, MAX_OUTPUT_CHARS) + '...[TRUNCATED]"}';
            }

            console.log(`${LogColors.BLUE}[search_local_code]${LogColors.RESET} OUTPUT: ${results.length} matches found`);
            return resultStr;
        } catch (error: any) {
            const errMsg = `Search failed: ${error.message}`;
            console.log(`${LogColors.BLUE}[search_local_code]${LogColors.RESET} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }
    },
    {
        name: 'search_local_code',
        description: 'Search for code patterns, function names, imports, or any text within a locally cloned repository. Use this after clone_repo to perform fast, powerful grep-based searches. Returns matching lines with file paths and line numbers.',
        schema: z.object({
            localPath: z.string().describe('The local path returned by clone_repo'),
            query: z.string().describe('The search pattern — can be a function name, class name, import, or any text'),
            filePattern: z.string().optional().describe('Optional file glob pattern to filter files (e.g. \'*.ts\', \'*.java\', \'*.py\')'),
            caseSensitive: z.boolean().optional().default(false).describe('Whether the search should be case-sensitive. Default: false.'),
        }),
    }
);
