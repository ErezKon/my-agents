import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {LogColors} from '../../../utils/log-colors.util';

export const createListSpacesTool = (confluenceToken: string, confluenceBaseUrl: string, instanceLabel: string = '') => {
    const suffix = instanceLabel ? `_${instanceLabel}` : '';
    const label = instanceLabel ? ` (${instanceLabel})` : '';
    const TAG = `${LogColors.BRIGHT_CYAN}[list_spaces${suffix}]${LogColors.RESET}`;

    return tool(
    async ({limit}) => {
        const effectiveLimit = limit ?? 100;
        console.log(`${TAG} INPUT: limit=${effectiveLimit}`);

        const url = `${confluenceBaseUrl}/rest/api/space?limit=${effectiveLimit}&expand=description.plain,metadata.labels`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${confluenceToken}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errMsg = `Failed to list spaces: ${response.status} ${response.statusText}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const data = await response.json();

        const spaces = (data.results || []).map((space: any) => ({
            key: space.key,
            name: space.name,
            type: space.type,
            description: space.description?.plain?.value?.slice(0, 300) || '',
            webUrl: `${confluenceBaseUrl.replace('/rest/api', '')}${space._links?.webui || ''}`,
        }));

        const result = JSON.stringify({
            totalSpaces: data.size || spaces.length,
            spaces,
        });

        console.log(`${TAG} OUTPUT: totalSpaces=${data.size || spaces.length}`);
        return result;
    },
    {
        name: `list_spaces${suffix}`,
        description: `List all available Confluence${label} spaces. Use this to discover what spaces exist and understand the organizational structure of the Confluence instance.`,
        schema: z.object({
            limit: z.number().optional().describe('Maximum number of spaces to return (default 100)'),
        }),
    }
);
};
