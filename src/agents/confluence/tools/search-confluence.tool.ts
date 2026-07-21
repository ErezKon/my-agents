import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {LogColors} from '../../../utils/log-colors.util';

export const createSearchConfluenceTool = (confluenceToken: string, confluenceBaseUrl: string, instanceLabel: string = '') => {
    const suffix = instanceLabel ? `_${instanceLabel}` : '';
    const label = instanceLabel ? ` (${instanceLabel})` : '';
    const TAG = `${LogColors.BLUE}[search_confluence${suffix}]${LogColors.RESET}`;

    return tool(
    async ({query, limit}) => {
        const effectiveLimit = Math.min(limit ?? 5, 5);
        console.log(`${TAG} INPUT: query='${query}', limit=${effectiveLimit}`);

        const cql = encodeURIComponent(`text ~ "${query}" OR title ~ "${query}"`);
        const url = `${confluenceBaseUrl}/rest/api/content/search?cql=${cql}&limit=${effectiveLimit}&expand=space,version,body.storage,metadata.labels`;

        console.log(`${TAG} Fetching: ${url}`);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${confluenceToken}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errMsg = `Confluence search failed: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();

        const results = (data.results || []).map((page: any) => {
            // Strip HTML tags from body for a text summary
            const rawHtml = page.body?.storage?.value || '';
            const textContent = rawHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            const snippet = textContent.slice(0, 200);

            return {
                id: page.id,
                title: page.title,
                spaceKey: page.space?.key,
                spaceName: page.space?.name,
                version: page.version?.number,
                lastUpdated: page.version?.when,
                updatedBy: page.version?.by?.displayName,
                labels: (page.metadata?.labels?.results || []).map((l: any) => l.name),
                contentSnippet: snippet,
                webUrl: `${confluenceBaseUrl.replace('/rest/api', '')}${page._links?.webui || ''}`,
            };
        });

        const result = JSON.stringify({
            totalSize: data.totalSize || data.size || results.length,
            resultsShown: results.length,
            results,
        });

        console.log(`${TAG} OUTPUT: totalSize=${data.totalSize || data.size}, shown=${results.length}`);
        return result;
    },
    {
        name: `search_confluence${suffix}`,
        description: `Search all Confluence${label} documents by text content and title using CQL. Returns matching pages with content snippets. Use this to find all documents relevant to a topic or question.`,
        schema: z.object({
            query: z.string().describe('The search query — keywords, phrases, or topics to search for across all Confluence content and titles'),
            limit: z.number().optional().describe('Maximum number of results to return (default 10, max 50)'),
        }),
    }
);
};
