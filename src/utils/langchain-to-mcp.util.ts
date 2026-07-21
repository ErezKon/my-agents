import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {StructuredToolInterface} from '@langchain/core/tools';

/**
 * Registers a LangChain tool on an MCP server.
 * Bridges the invocation: MCP call → LangChain tool.invoke().
 *
 * Works with tools created via `tool()` from @langchain/core/tools
 * that use Zod v4 schemas.
 */
export function registerLangChainToolAsMcp(
    server: McpServer,
    lcTool: StructuredToolInterface,
): void {
    const schema = lcTool.schema;

    // Extract the raw shape from the Zod object schema
    // Zod v4: schema._zod.def.shape  |  Zod v3: schema.shape
    let shape: Record<string, any> | undefined;

    if (schema && typeof schema === 'object') {
        // Zod v4
        if ('_zod' in schema && (schema as any)._zod?.def?.shape) {
            const s = (schema as any)._zod.def.shape;
            shape = typeof s === 'function' ? s() : s;
        }
        // Zod v3 fallback
        else if ('shape' in schema) {
            const s = (schema as any).shape;
            shape = typeof s === 'function' ? s() : s;
        }
    }

    if (!shape) {
        // No shape extracted — register tool without input schema
        server.tool(
            lcTool.name,
            lcTool.description,
            async () => {
                const result = await lcTool.invoke({});
                return {content: [{type: 'text' as const, text: String(result)}]};
            },
        );
        return;
    }

    server.tool(
        lcTool.name,
        lcTool.description,
        shape,
        async (args: Record<string, unknown>) => {
            const result = await lcTool.invoke(args);
            return {content: [{type: 'text' as const, text: String(result)}]};
        },
    );
}

/**
 * Registers an array of LangChain tools on an MCP server.
 */
export function registerAllLangChainToolsAsMcp(
    server: McpServer,
    tools: StructuredToolInterface[],
): void {
    for (const tool of tools) {
        registerLangChainToolAsMcp(server, tool);
    }
}
