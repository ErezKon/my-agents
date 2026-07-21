import { tool } from 'langchain';
import { z } from 'zod';
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { tavilySearch } from '../../appliances/tools/tavily-client.util';
import { accumulateResearch } from '../../appliances/tools/research-accumulator.util';

const TAG = `${color256(45)}[research_topic]${LogColors.RESET}`;

/**
 * Deep-research tool for the slide generator. Runs a Tavily web search for a
 * single topic/sub-topic, appends the full results to research-data.json in the
 * output directory, and returns a compact summary for the LLM.
 */
export const createResearchTopicTool = (outputDir: string) => tool(
    async ({ query, maxResults }) => {
        const n = maxResults ?? 6;
        console.log(`${TAG} INPUT: query='${query}', maxResults=${n}`);

        const { answer, results, error } = await tavilySearch(query, {
            maxResults: n,
            searchDepth: 'advanced',
            includeAnswer: true,
        });

        if (error) {
            console.log(`${TAG} ERROR: ${error}`);
            return JSON.stringify({ error });
        }

        console.log(`${TAG} OUTPUT: ${results.length} results`);

        const { truncatedAnswer, truncatedResults } = accumulateResearch(
            outputDir,
            'research_topic',
            { query, maxResults: n },
            answer,
            results,
        );

        return JSON.stringify({
            query,
            answer: truncatedAnswer,
            results: truncatedResults,
            _note: `Full results (${results.length}) saved to research-data.json. Cite the most relevant URLs in the deck's sources.`,
        });
    },
    {
        name: 'research_topic',
        description:
            'Perform deep web research on a topic or sub-topic (via Tavily). Returns a concise answer plus source snippets with URLs. ' +
            'Call this MULTIPLE TIMES — once per distinct sub-topic, angle, statistic, or claim you want to put on a slide — so the deck is well-researched and accurate. ' +
            'Always collect the source URLs so they can be cited on the closing slide.',
        schema: z.object({
            query: z.string().describe('A focused search query for one sub-topic (e.g. "Kubernetes autoscaling best practices 2025", "market size electric vehicles 2024").'),
            maxResults: z.number().optional().describe('How many results to fetch. Defaults to 6.'),
        }),
    }
);
