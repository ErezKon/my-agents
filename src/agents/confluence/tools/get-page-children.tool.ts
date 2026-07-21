import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {LogColors} from '../../../utils/log-colors.util';

export const createGetPageChildrenTool = (confluenceToken: string, confluenceBaseUrl: string, instanceLabel: string = '') => {
    const suffix = instanceLabel ? `_${instanceLabel}` : '';
    const label = instanceLabel ? ` (${instanceLabel})` : '';
    const TAG = `${LogColors.BRIGHT_MAGENTA}[get_page_children${suffix}]${LogColors.RESET}`;

    return tool(
    async ({pageId, limit}) => {
        const effectiveLimit = limit ?? 25;
        console.log(`${TAG} INPUT: pageId=${pageId}, limit=${effectiveLimit}`);

        const url = `${confluenceBaseUrl}/rest/api/content/${pageId}/child/page?limit=${effectiveLimit}&expand=version,space,body.storage`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${confluenceToken}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errMsg = `Failed to fetch child pages: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();

        const children = (data.results || []).map((page: any) => {
            const rawHtml = page.body?.storage?.value || '';
            const textContent = rawHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            const snippet = textContent.slice(0, 500);

            return {
                id: page.id,
                title: page.title,
                spaceKey: page.space?.key,
                version: page.version?.number,
                lastUpdated: page.version?.when,
                updatedBy: page.version?.by?.displayName,
                contentSnippet: snippet,
                webUrl: `${confluenceBaseUrl.replace('/rest/api', '')}${page._links?.webui || ''}`,
            };
        });

        const result = JSON.stringify({
            parentPageId: pageId,
            totalChildren: data.size || children.length,
            children,
        });

        console.log(`${TAG} OUTPUT: parentPageId=${pageId}, totalChildren=${data.size || children.length}`);
        return result;
    },
    {
        name: `get_page_children${suffix}`,
        description: `Get all child pages of a specific Confluence${label} page. Use this to explore the page hierarchy and discover sub-documents under a parent page.`,
        schema: z.object({
            pageId: z.string().describe('The parent Confluence page ID to get children for'),
            limit: z.number().optional().describe('Maximum number of child pages to return (default 25)'),
        }),
    }
);
};
