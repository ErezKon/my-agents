#!/usr/bin/env tsx
/**
 * Interactive CLI for all My-Agents.
 *
 * Usage:
 *   npm run cli
 *
 * On launch you pick an agent from a numbered menu, then chat with it
 * in a multi-turn conversational loop.
 *
 * Commands (available in every agent session):
 *   /help   — show available commands
 *   /new    — start a fresh session (clears conversation history)
 *   /switch — go back to the agent-selection menu
 *   /quit   — exit the CLI
 */
import 'dotenv/config';
import * as readline from 'readline';
import { getAccessToken } from './utils/oauth-auth.util';
import { LogColors, color256 } from './utils/log-colors.util';

// Agent factories
import { createBasicAgent } from './agents/basic-agent/basic.agent';
import { createChefAgent } from './agents/chef/chef.agent';
import { createStocksAgent } from './agents/stocks/stocks.agent';
import { createMG4Agent } from './agents/MG-4/mg4.agent';
import { createIONIQ6Agent } from './agents/IONIQ-6/ioniq6.agent';
import { createMortgageAgent } from './agents/mortgage/mortgage.agent';
import { createHouseAgent } from './agents/house/house.agent';
import { createAppliancesAgent } from './agents/appliances/appliances.agent';
import { createConfluenceAgent } from './agents/confluence/confluence.agent';
import { createGitHubAgent, createRepoQAAgent } from './agents/github/github.agent';
import { createSlideGeneratorAgent } from './agents/slide-generator/slide-generator.agent';
import { createOutputDir } from './utils/save-output-base';

// ─── Constants ────────────────────────────────────────────────────────────────

const TAG = `${color256(117)}[cli]${LogColors.RESET}`;
const PROMPT_COLOR = LogColors.BRIGHT_CYAN;
const AGENT_COLOR = color256(214);
const HEADING_COLOR = LogColors.BRIGHT_GREEN;
const DIM = LogColors.BRIGHT_BLACK;
const R = LogColors.RESET;

// ─── Agent registry ──────────────────────────────────────────────────────────

interface AgentEntry {
    id: string;
    name: string;
    description: string;
    /** Factory that creates the LangGraph agent given an API access token. */
    create: (token: string) => any;
    recursionLimit?: number;
}

const AGENTS: AgentEntry[] = [
    {
        id: 'chat',
        name: 'General Chat',
        description: 'General-purpose AI assistant (basic agent)',
        create: (token) => createBasicAgent(token),
    },
    {
        id: 'chef',
        name: 'Chef Jacque',
        description: 'Culinary expert — recipes, cooking tips, ingredient identification',
        create: (token) => createChefAgent(token),
    },
    {
        id: 'stocks',
        name: 'Stock Broker',
        description: 'Financial analyst — US & Israeli market data, quotes, comparisons',
        create: (token) => createStocksAgent(token),
    },
    {
        id: 'mg4',
        name: 'MG-4 Car Expert',
        description: 'MG-4 electric vehicle manual Q&A',
        create: (token) => createMG4Agent(token),
    },
    {
        id: 'ioniq6',
        name: 'IONIQ 6 Expert',
        description: 'Hyundai IONIQ 6 electric vehicle manual Q&A',
        create: (token) => createIONIQ6Agent(token),
    },
    {
        id: 'mortgage',
        name: 'Mortgage Advisor',
        description: 'Hebrew mortgage offers analysis, comparison & optimization',
        create: (token) => createMortgageAgent(token),
    },
    {
        id: 'house',
        name: 'House Agent',
        description: 'Hebrew real-estate contracts & construction diagrams analysis',
        create: (token) => createHouseAgent(token),
    },
    {
        id: 'appliances',
        name: 'Appliances Advisor',
        description: 'Hebrew home-appliance expert — brands, comparisons, Excel/PDF reports',
        create: (token) => {
            const outputDir = createOutputDir('appliances-cli', 'cli-session', 'cli');
            return createAppliancesAgent(token, outputDir);
        },
    },
    {
        id: 'confluence',
        name: 'Confluence Q&A',
        description: 'Search and answer questions from Confluence knowledge bases',
        create: (token) => createConfluenceAgent(token),
        recursionLimit: 30,
    },
    {
        id: 'github',
        name: 'GitHub Analyzer',
        description: 'Analyze GitHub repositories — structure, endpoints, dependencies',
        create: (token) => createGitHubAgent(token, process.env.GITHUB_TOKEN || ''),
    },
    {
        id: 'github-qa',
        name: 'GitHub Q&A',
        description: 'Ask questions about any GitHub repo (clones locally for deep analysis)',
        create: (token) => createRepoQAAgent(token),
    },
    {
        id: 'slidegen',
        name: 'Slide Generator',
        description: 'Generate PowerPoint or reveal.js presentations from any topic',
        create: (token) => {
            const outputDir = createOutputDir('slidegen-cli', 'cli-session', 'cli');
            return createSlideGeneratorAgent(token, {
                outputDir,
                githubToken: process.env.GITHUB_TOKEN || '',
                publicGithubToken: process.env.PUBLIC_GITHUB_TOKEN,
            });
        },
    },
];

// ─── Readline setup ──────────────────────────────────────────────────────────

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
});

function ask(prompt: string): Promise<string> {
    return new Promise((resolve) => rl.question(prompt, resolve));
}

// ─── Response extraction ─────────────────────────────────────────────────────

function extractContent(lastState: any): string | null {
    const messages =
        lastState?.model_request?.messages ??
        lastState?.messages ??
        lastState?.agent?.messages;

    if (Array.isArray(messages)) {
        return extractFromMessages(messages);
    }

    for (const key of Object.keys(lastState ?? {})) {
        const nested = lastState[key];
        if (nested?.messages && Array.isArray(nested.messages)) {
            return extractFromMessages(nested.messages);
        }
    }

    // Try structuredResponse
    const sr = lastState?.structuredResponse ??
        lastState?.model_request?.structuredResponse;
    if (sr) {
        if (sr.answer) return sr.answer;
        if (sr.summary) return sr.summary;
        return JSON.stringify(sr, null, 2);
    }

    return null;
}

function extractFromMessages(messages: any[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (typeof msg?.content === 'string' && msg.content.trim()) {
            return msg.content;
        }
        if (msg?.kwargs?.content && typeof msg.kwargs.content === 'string' && msg.kwargs.content.trim()) {
            return msg.kwargs.content;
        }
    }
    return null;
}

// ─── Pretty-printing ─────────────────────────────────────────────────────────

function printBanner() {
    console.log('');
    console.log(`${HEADING_COLOR}${'='.repeat(60)}${R}`);
    console.log(`${HEADING_COLOR}  My Agents — Interactive CLI${R}`);
    console.log(`${HEADING_COLOR}${'='.repeat(60)}${R}`);
    console.log(`${DIM}  Multi-turn conversations with any agent.${R}`);
    console.log(`${DIM}  Commands:  /help  /new  /switch  /quit${R}`);
    console.log('');
}

function printAgentMenu() {
    console.log(`${HEADING_COLOR}Available agents:${R}`);
    console.log('');
    AGENTS.forEach((agent, i) => {
        const num = `${PROMPT_COLOR}${String(i + 1).padStart(2)}${R}`;
        console.log(`  ${num}. ${LogColors.BRIGHT_WHITE}${agent.name}${R}  ${DIM}— ${agent.description}${R}`);
    });
    console.log('');
}

function printHelp() {
    console.log('');
    console.log(`${HEADING_COLOR}Commands:${R}`);
    console.log(`  ${PROMPT_COLOR}/help${R}     — show this help`);
    console.log(`  ${PROMPT_COLOR}/new${R}      — start a fresh session (clears history)`);
    console.log(`  ${PROMPT_COLOR}/switch${R}   — switch to a different agent`);
    console.log(`  ${PROMPT_COLOR}/quit${R}     — exit the CLI`);
    console.log('');
}

// ─── Agent session ───────────────────────────────────────────────────────────

interface Session {
    agent: any;
    entry: AgentEntry;
    threadId: string;
    turnCount: number;
}

async function createSession(entry: AgentEntry, apiToken: string): Promise<Session> {
    const agent = entry.create(apiToken);
    return {
        agent,
        entry,
        threadId: `${entry.id}-cli-${Date.now()}`,
        turnCount: 0,
    };
}

async function invokeAgent(session: Session, userMessage: string): Promise<string | null> {
    session.turnCount++;

    console.log(`${TAG} Sending to ${session.entry.name} (turn ${session.turnCount})...`);
    console.log('');

    const stream = await session.agent.stream(
        { messages: [{ role: 'user', content: userMessage }] },
        {
            configurable: { thread_id: session.threadId },
            recursionLimit: session.entry.recursionLimit ?? 100,
        },
    );

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
        stepCount++;
        const nodeNames = Object.keys(chunk);
        console.log(`${DIM}  step ${stepCount}: [${nodeNames.join(', ')}]${R}`);
        lastState = chunk;
    }
    console.log(`${TAG} Completed in ${stepCount} steps`);

    return extractContent(lastState);
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function selectAgent(): Promise<AgentEntry> {
    printAgentMenu();
    while (true) {
        const input = await ask(`${PROMPT_COLOR}Select agent [1-${AGENTS.length}]:${R} `);
        const num = parseInt(input.trim(), 10);
        if (num >= 1 && num <= AGENTS.length) {
            return AGENTS[num - 1];
        }
        console.log(`${DIM}Please enter a number between 1 and ${AGENTS.length}.${R}`);
    }
}

async function main() {
    printBanner();

    console.log(`${TAG} Authenticating...`);
    let apiToken: string;
    try {
        apiToken = await getAccessToken();
    } catch (err: any) {
        console.warn(`${LogColors.BRIGHT_YELLOW}[cli]${R} OAuth auth failed (${err.message}). Some agents may not work without it.`);
        apiToken = '';
    }
    console.log(`${TAG} Ready.`);
    console.log('');

    let selectedAgent = await selectAgent();

    console.log(`\n${TAG} Starting ${HEADING_COLOR}${selectedAgent.name}${R}...`);
    let session = await createSession(selectedAgent, apiToken);
    console.log(`${TAG} ${selectedAgent.name} ready. Type your message.\n`);

    while (true) {
        const input = await ask(`${PROMPT_COLOR}You:${R} `);
        const trimmed = input.trim();

        if (!trimmed) continue;

        // ─── Handle commands ───────────────────────
        if (trimmed.startsWith('/')) {
            const cmd = trimmed.toLowerCase().split(/\s+/)[0];

            switch (cmd) {
                case '/quit':
                case '/exit':
                case '/q':
                    console.log(`\n${DIM}Goodbye!${R}\n`);
                    rl.close();
                    process.exit(0);

                case '/help':
                case '/h':
                    printHelp();
                    continue;

                case '/new':
                case '/reset':
                    console.log(`\n${TAG} Starting fresh ${selectedAgent.name} session...`);
                    session = await createSession(selectedAgent, apiToken);
                    console.log(`${TAG} New session ready.\n`);
                    continue;

                case '/switch':
                    console.log('');
                    selectedAgent = await selectAgent();
                    console.log(`\n${TAG} Starting ${HEADING_COLOR}${selectedAgent.name}${R}...`);
                    session = await createSession(selectedAgent, apiToken);
                    console.log(`${TAG} ${selectedAgent.name} ready. Type your message.\n`);
                    continue;

                default:
                    console.log(`\n${DIM}Unknown command: ${cmd}. Type /help for available commands.${R}\n`);
                    continue;
            }
        }

        // ─── Send to agent ─────────────────────────
        try {
            const response = await invokeAgent(session, trimmed);
            if (response) {
                console.log('');
                console.log(`${AGENT_COLOR}${selectedAgent.name}:${R} ${response}`);
                console.log('');
            } else {
                console.log(`\n${DIM}(No response content received)${R}\n`);
            }
        } catch (err: any) {
            console.error(`\n${LogColors.BRIGHT_RED}Error:${R} ${err.message}\n`);
        }
    }
}

main().catch((err) => {
    console.error(`${LogColors.BRIGHT_RED}Fatal error:${R}`, err);
    process.exit(1);
});
