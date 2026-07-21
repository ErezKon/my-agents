import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {LogColors} from '../../../utils/log-colors.util';

export const createGetPageContentTool = (confluenceToken: string, confluenceBaseUrl: string, instanceLabel: string = '') => {
    const suffix = instanceLabel ? `_${instanceLabel}` : '';
    const label = instanceLabel ? ` (${instanceLabel})` : '';
    const TAG = `${LogColors.BRIGHT_YELLOW}[get_page_content${suffix}]${LogColors.RESET}`;

    return tool(
    async ({pageId}) => {
        console.log(`${TAG} INPUT: pageId=${pageId}`);

        const url = `${confluenceBaseUrl}/rest/api/content/${pageId}?expand=body.storage,space,version,ancestors,metadata.labels,children.page`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${confluenceToken}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errMsg = `Failed to fetch page content: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();

        // Strip HTML tags for readable text content
        const rawHtml = data.body?.storage?.value || '';
        let textContent = rawHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

        const MAX_CONTENT_CHARS = 8000;
        const wasTruncated = textContent.length > MAX_CONTENT_CHARS;
        if (wasTruncated) {
            textContent = textContent.slice(0, MAX_CONTENT_CHARS) + '\n\n... [TRUNCATED — showing first 8000 chars] ...';
        }

        const ancestors = (data.ancestors || []).map((a: any) => ({
            id: a.id,
            title: a.title,
        }));

        const childPages = (data.children?.page?.results || []).map((c: any) => ({
            id: c.id,
            title: c.title,
        }));

        const result = JSON.stringify({
            id: data.id,
            title: data.title,
            spaceKey: data.space?.key,
            spaceName: data.space?.name,
            version: data.version?.number,
            lastUpdated: data.version?.when,
            updatedBy: data.version?.by?.displayName,
            ancestors,
            childPages,
            labels: (data.metadata?.labels?.results || []).map((l: any) => l.name),
            truncated: wasTruncated,
            content: textContent,
            webUrl: `${confluenceBaseUrl.replace('/rest/api', '')}${data._links?.webui || ''}`,
        });

        console.log(`${TAG} OUTPUT: id=${data.id}, title='${data.title}', contentLength=${textContent.length}, truncated=${wasTruncated}`);
        return result;
    },
    {
        name: `get_page_content${suffix}`,
        description: `Fetch the full content of a specific Confluence${label} page by its ID. Returns the page text, metadata, ancestor hierarchy, child pages, and labels. Use this after searching to read the full content of relevant documents.`,
        schema: z.object({
            pageId: z.string().describe('The Confluence page ID to retrieve'),
        }),
    }
);
};
