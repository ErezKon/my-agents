import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {LogColors} from '../../../utils/log-colors.util';

const MAX_TREE_ITEMS = 500;
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '__pycache__', '.venv', 'venv', '.idea', '.vscode', 'target', '.gradle', '.cache']);

interface TreeEntry {
    path: string;
    type: 'file' | 'directory';
    size: number;
}

function walkDir(basePath: string, subPath: string, maxDepth: number, currentDepth: number, entries: TreeEntry[]): void {
    if (currentDepth > maxDepth || entries.length >= MAX_TREE_ITEMS) return;

    const fullPath = path.join(basePath, subPath);
    let items: string[];
    try {
        items = fs.readdirSync(fullPath);
    } catch {
        return;
    }

    for (const item of items) {
        if (entries.length >= MAX_TREE_ITEMS) break;
        if (IGNORE_DIRS.has(item)) continue;

        const itemRelPath = subPath ? path.join(subPath, item) : item;
        const itemFullPath = path.join(basePath, itemRelPath);

        try {
            const stat = fs.statSync(itemFullPath);
            if (stat.isDirectory()) {
                entries.push({path: itemRelPath, type: 'directory', size: 0});
                walkDir(basePath, itemRelPath, maxDepth, currentDepth + 1, entries);
            } else {
                entries.push({path: itemRelPath, type: 'file', size: stat.size});
            }
        } catch {
            // Skip inaccessible entries
        }
    }
}

export const createListLocalTreeTool = () => tool(
    async ({localPath, subPath, maxDepth}) => {
        console.log(`${LogColors.MAGENTA}[list_local_tree]${LogColors.RESET} INPUT: localPath=${localPath}, subPath=${subPath || '.'}, maxDepth=${maxDepth}`);

        try {
            // Validate localPath is a temp directory (security check)
            const resolvedBase = path.resolve(localPath);
            if (!resolvedBase.startsWith('/tmp') && !resolvedBase.startsWith(os.tmpdir())) {
                return JSON.stringify({error: 'localPath must be inside a temp directory (created by clone_repo).'});
            }

            const startPath = subPath || '';
            const fullStartPath = path.join(resolvedBase, startPath);

            // Prevent path traversal
            if (!fullStartPath.startsWith(resolvedBase)) {
                return JSON.stringify({error: 'Invalid subPath: path traversal detected.'});
            }

            if (!fs.existsSync(fullStartPath)) {
                return JSON.stringify({error: `Path not found: ${startPath || '/'}`});
            }

            const entries: TreeEntry[] = [];
            const effectiveMaxDepth = maxDepth ?? 3;
            walkDir(resolvedBase, startPath, effectiveMaxDepth, 0, entries);

            const result = JSON.stringify({
                totalItems: entries.length,
                capped: entries.length >= MAX_TREE_ITEMS,
                ignoredDirs: [...IGNORE_DIRS].join(', '),
                tree: entries,
            });

            console.log(`${LogColors.MAGENTA}[list_local_tree]${LogColors.RESET} OUTPUT: ${entries.length} items, capped=${entries.length >= MAX_TREE_ITEMS}`);
            return result;
        } catch (error: any) {
            const errMsg = `Failed to list tree: ${error.message}`;
            console.log(`${LogColors.MAGENTA}[list_local_tree]${LogColors.RESET} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }
    },
    {
        name: 'list_local_tree',
        description: 'List the file and directory tree of a locally cloned repository. Returns up to 500 items. Automatically skips .git, node_modules, dist, build, and other common non-source directories. Use \'subPath\' to focus on a subdirectory and \'maxDepth\' to control depth.',
        schema: z.object({
            localPath: z.string().describe('The local path returned by clone_repo'),
            subPath: z.string().optional().describe('Optional subdirectory path to start from (e.g. \'src\' or \'src/components\')'),
            maxDepth: z.number().optional().describe('Maximum directory depth to traverse (default 3). Use 1 for top-level only.'),
        }),
    }
);
