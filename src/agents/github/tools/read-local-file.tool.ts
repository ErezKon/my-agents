import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {LogColors} from '../../../utils/log-colors.util';

const MAX_FILE_CHARS = 15000;

export const createReadLocalFileTool = () => tool(
    async ({localPath, filePath}) => {
        console.log(`${LogColors.YELLOW}[read_local_file]${LogColors.RESET} INPUT: localPath=${localPath}, filePath=${filePath}`);

        try {
            // Validate localPath is a temp directory (security check)
            const resolvedBase = path.resolve(localPath);
            if (!resolvedBase.startsWith('/tmp') && !resolvedBase.startsWith(os.tmpdir())) {
                return JSON.stringify({error: 'localPath must be inside a temp directory (created by clone_repo).'});
            }

            const fullPath = path.join(resolvedBase, filePath);

            // Prevent path traversal
            if (!fullPath.startsWith(resolvedBase)) {
                return JSON.stringify({error: 'Invalid filePath: path traversal detected.'});
            }

            if (!fs.existsSync(fullPath)) {
                return JSON.stringify({error: `File not found: ${filePath}`});
            }

            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                const entries = fs.readdirSync(fullPath).map(name => {
                    const entryPath = path.join(fullPath, name);
                    const entryStat = fs.statSync(entryPath);
                    return {
                        name,
                        type: entryStat.isDirectory() ? 'directory' : 'file',
                        size: entryStat.size,
                    };
                });
                const result = JSON.stringify({type: 'directory', path: filePath, items: entries});
                console.log(`${LogColors.YELLOW}[read_local_file]${LogColors.RESET} OUTPUT: directory with ${entries.length} items`);
                return result;
            }

            // Check for binary files
            const ext = path.extname(fullPath).toLowerCase();
            const binaryExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.pdf', '.zip', '.tar', '.gz', '.jar', '.war', '.class', '.so', '.dll', '.exe', '.woff', '.woff2', '.ttf', '.eot']);
            if (binaryExts.has(ext)) {
                const result = JSON.stringify({type: 'file', path: filePath, size: stats.size, content: '[Binary file — cannot display]'});
                console.log(`${LogColors.YELLOW}[read_local_file]${LogColors.RESET} OUTPUT: binary file, size=${stats.size}`);
                return result;
            }

            let content = fs.readFileSync(fullPath, 'utf-8');
            const wasTruncated = content.length > MAX_FILE_CHARS;
            if (wasTruncated) {
                content = content.slice(0, MAX_FILE_CHARS) + '\n\n... [TRUNCATED — file too large, showing first 15000 chars] ...';
            }

            const result = JSON.stringify({
                type: 'file',
                path: filePath,
                size: stats.size,
                truncated: wasTruncated,
                content,
            });

            console.log(`${LogColors.YELLOW}[read_local_file]${LogColors.RESET} OUTPUT: file=${filePath}, size=${stats.size}, truncated=${wasTruncated}`);
            return result;
        } catch (error: any) {
            const errMsg = `Failed to read file: ${error.message}`;
            console.log(`${LogColors.YELLOW}[read_local_file]${LogColors.RESET} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }
    },
    {
        name: 'read_local_file',
        description: 'Read the content of a file from a locally cloned repository, or list a directory. Use this after clone_repo to inspect source code, config files, READMEs, etc. Faster than the API-based read_repo_file.',
        schema: z.object({
            localPath: z.string().describe('The local path returned by clone_repo'),
            filePath: z.string().describe('Relative file or directory path within the cloned repo (e.g. \'src/index.ts\', \'package.json\')'),
        }),
    }
);
