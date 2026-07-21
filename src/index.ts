import 'dotenv/config';
import express from 'express';
import multer from 'multer';

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import {createChefAgent} from './agents/chef/chef.agent';
import {createGitHubAgent, createPrImpactAgent, createRepoQAAgent} from './agents/github/github.agent';
import {createConfluenceAgent} from './agents/confluence/confluence.agent';
import {createStocksAgent} from './agents/stocks/stocks.agent';
import {createBasicAgent} from './agents/basic-agent/basic.agent';
import {createMG4Agent} from './agents/MG-4/mg4.agent';
import {createIONIQ6Agent} from './agents/IONIQ-6/ioniq6.agent';
import {saveAgentOutput} from './utils/save-output';
import {saveGitHubAgentOutput} from './utils/save-github-output';
import {saveMG4Output} from './utils/save-mg4-output';
import {saveIONIQ6Output} from './utils/save-ioniq6-output';
import {createMortgageAgent} from './agents/mortgage/mortgage.agent';
import {createHouseAgent} from './agents/house/house.agent';
import {createAppliancesAgent} from './agents/appliances/appliances.agent';
import {createSlideGeneratorAgent} from './agents/slide-generator/slide-generator.agent';
import {saveMortgageOutput} from './utils/save-mortgage-output';
import {saveHouseOutput} from './utils/save-house-output';
import {saveAppliancesOutput} from './utils/save-appliances-output';
import {saveSlideGeneratorOutput} from './utils/save-slide-generator-output';
import {createOutputDir} from './utils/save-output-base';
import {setupSwagger} from './swagger';
import {LogColors} from './utils/log-colors.util';
import {getAccessToken} from './utils/oauth-auth.util';
import {LLM_BASE_URL, PRIMARY_GITHUB} from './config';
import {startLogCapture, saveLogCapture} from './utils/log-capture.util';
import {produceUnifiedOutput, produceUnifiedOutputFromPaths} from './agents/appliances/merge/produce-unified-output';

const app = express();

app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

setupSwagger(app);

const PORT = 3000;

// ─── General Chat ────────────────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  const { message, model, apiKey, stream, temperature } = req.body;
  if (!message || !model || !apiKey) {
    res.status(400).json({
      error: 'Missing required parameters: message, model, and apiKey are required',
    });
    return;
  }

  try {
    const llm = new ChatOpenAI({
      model: model,
      temperature: temperature ?? 0.8,
      streaming: stream ?? false,
      openAIApiKey: apiKey,
      apiKey: apiKey,
      configuration: {
        baseURL: LLM_BASE_URL,
      },
    });

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const streamResponse = await llm.stream([new HumanMessage(message)]);

      for await (const chunk of streamResponse) {
        res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const response = await llm.invoke([new HumanMessage(message)]);

      res.json({
        content: response.content,
        model: model,
      });
    }
  } catch (error: any) {
    console.error('Error calling the LLM:', error);
    res.status(500).json({
      error: 'Failed to get response from LLM',
      details: error.message,
    });
  }
});

// ─── Chef ────────────────────────────────────────────────────────────────────

app.post('/api/chef/image', async (req, res) => {
  const { message, imageBase64 } = req.body;
  const capture = startLogCapture();

  console.log(`${LogColors.YELLOW}[chef-agent]${LogColors.RESET} Received request:`, message?.slice(0, 100));
  const apiToken = await getAccessToken();
  const chef = createChefAgent(apiToken, imageBase64);

  console.log(`${LogColors.YELLOW}[chef-agent]${LogColors.RESET} Starting chef agent...`);
  const ret = await chef.invoke({
    messages: [{role: 'user', content: message}]
  }, { configurable: { thread_id: `chef-${Date.now()}` } });

  console.log(`${LogColors.YELLOW}[chef-agent]${LogColors.RESET} Completed`);
  const outputDir = saveAgentOutput('chef', { message, imageBase64: imageBase64 ? '[base64 image]' : undefined }, ret);
  saveLogCapture(capture, outputDir);
  res.json({
    content: ret,
    model: 'gpt-oss-120b',
  });
});

// ─── GitHub ──────────────────────────────────────────────────────────────────

app.post('/api/github/analyze', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    res.status(400).json({
      error: 'Missing required parameters: message is required',
    });
    return;
  }

  const capture = startLogCapture();
  try {
    const apiToken = await getAccessToken();
    const github = createGitHubAgent(apiToken);

    console.log(`${LogColors.CYAN}[github-agent]${LogColors.RESET} Starting analysis...`);
    const stream = await github.stream({
      messages: [{role: 'user', content: message}]
    }, { configurable: { thread_id: `github-${Date.now()}` }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.CYAN}[github-agent]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(', ')}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.CYAN}[github-agent]${LogColors.RESET} Completed in ${stepCount} steps`);
    const outputDir = saveGitHubAgentOutput('github', { message }, lastState);
    saveLogCapture(capture, outputDir);

    res.json({
      content: lastState,
      model: 'gpt-oss-120b',
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[github-agent] Error:${LogColors.RESET}`, error);
    capture.stop();
    res.status(500).json({
      error: 'Failed to analyze repository',
      details: error.message,
    });
  }
});

app.post('/api/github/pr-impact', async (req, res) => {
  const { owner, repo, prNumber, message, summaryVersion } = req.body;

  console.log(`${LogColors.BRIGHT_MAGENTA}[pr-impact]${LogColors.RESET} Received request: owner=${owner}, repo=${repo}, PR=#${prNumber}`);

  if (!owner || !repo || !prNumber) {
    res.status(400).json({
      error: 'Missing required parameters: owner, repo, and prNumber are required',
    });
    return;
  }

  const capture = startLogCapture();
  try {
    const apiToken = await getAccessToken();
    const prImpact = createPrImpactAgent(apiToken, undefined, undefined, summaryVersion);

    const prContext = `Analyze the impact of PR #${prNumber} in ${owner}/${repo}. Fetch the PR diff using owner="${owner}", repo="${repo}", prNumber=${prNumber}, then cross-reference the changes against all known repository summaries, and identify which endpoints, databases, or services are affected and who their consumers are.`;
    const userMessage = message
      ? `${prContext}\n\nAdditional instructions: ${message}`
      : prContext;

    console.log(`${LogColors.BRIGHT_MAGENTA}[pr-impact]${LogColors.RESET} Starting PR impact analysis...`);
    const stream = await prImpact.stream({
      messages: [{role: 'user', content: userMessage}]
    }, { configurable: { thread_id: `pr-impact-${Date.now()}` }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.BRIGHT_MAGENTA}[pr-impact]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(', ')}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.BRIGHT_MAGENTA}[pr-impact]${LogColors.RESET} Completed in ${stepCount} steps`);
    const outputDir = saveGitHubAgentOutput('pr-impact', { owner, repo, prNumber, message }, lastState);
    saveLogCapture(capture, outputDir);

    res.json({
      content: lastState,
      model: 'gpt-oss-120b',
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[pr-impact] Error:${LogColors.RESET}`, error);
    capture.stop();
    res.status(500).json({
      error: 'Failed to analyze PR impact',
      details: error.message,
    });
  }
});

app.post('/api/github/ask', async (req, res) => {
  const { message } = req.body;

  console.log(`${LogColors.BRIGHT_CYAN}[github-qa]${LogColors.RESET} Received question:`, message?.slice(0, 100));

  if (!message) {
    res.status(400).json({
      error: 'Missing required parameter: message is required',
    });
    return;
  }

  const capture = startLogCapture();
  try {
    const apiToken = await getAccessToken();
    const qa = createRepoQAAgent(apiToken);

    console.log(`${LogColors.BRIGHT_CYAN}[github-qa]${LogColors.RESET} Starting repo Q&A agent...`);
    const stream = await qa.stream({
      messages: [{role: 'user', content: message}]
    }, { configurable: { thread_id: `github-qa-${Date.now()}` }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.BRIGHT_CYAN}[github-qa]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(', ')}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.BRIGHT_CYAN}[github-qa]${LogColors.RESET} Completed in ${stepCount} steps`);
    const outputDir = saveGitHubAgentOutput('github-qa', { message }, lastState);
    saveLogCapture(capture, outputDir);

    res.json({
      content: lastState,
      model: 'gpt-oss-120b',
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[github-qa] Error:${LogColors.RESET}`, error);
    capture.stop();
    res.status(500).json({
      error: 'Failed to answer question about repository',
      details: error.message,
    });
  }
});

// ─── Confluence ──────────────────────────────────────────────────────────────

app.post('/api/confluence/ask', async (req, res) => {
  const { message } = req.body;

  console.log(`${LogColors.BRIGHT_GREEN}[confluence-agent]${LogColors.RESET} Received question:`, message);

  if (!message) {
    res.status(400).json({
      error: 'Missing required parameter: message is required',
    });
    return;
  }

  const capture = startLogCapture();
  try {
    const apiToken = await getAccessToken();
    const confluence = createConfluenceAgent(apiToken);

    console.log(`${LogColors.BRIGHT_GREEN}[confluence-agent]${LogColors.RESET} Starting Confluence search...`);
    const stream = await confluence.stream({
      messages: [{role: 'user', content: message}]
    }, { configurable: { thread_id: `confluence-${Date.now()}` }, recursionLimit: 30 });

    let lastState: any = null;
    let stepCount = 0;
    let hitRecursionLimit = false;
    try {
      for await (const chunk of stream) {
        stepCount++;
        const nodeNames = Object.keys(chunk);
        console.log(`${LogColors.BRIGHT_GREEN}[confluence-agent]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(', ')}]`);
        lastState = chunk;
      }
    } catch (streamError: any) {
      if (streamError?.lc_error_code === 'GRAPH_RECURSION_LIMIT') {
        hitRecursionLimit = true;
        console.warn(`${LogColors.BRIGHT_GREEN}[confluence-agent]${LogColors.RESET} Hit recursion limit at step ${stepCount}, returning partial results`);
      } else {
        throw streamError;
      }
    }
    console.log(`${LogColors.BRIGHT_GREEN}[confluence-agent]${LogColors.RESET} Completed in ${stepCount} steps${hitRecursionLimit ? ' (hit recursion limit)' : ''}`);
    const outputDir = saveAgentOutput('confluence', { message }, lastState);
    saveLogCapture(capture, outputDir);

    res.json({
      content: lastState,
      model: 'gpt-oss-120b',
      ...(hitRecursionLimit && { warning: 'Agent hit recursion limit; response may be incomplete' }),
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[confluence-agent] Error:${LogColors.RESET}`, error);
    capture.stop();
    res.status(500).json({
      error: 'Failed to query Confluence',
      details: error.message,
    });
  }
});

// ─── Stocks ──────────────────────────────────────────────────────────────────

app.post('/api/stocks/chat', async (req, res) => {
  const { apiKey, message } = req.body;

  console.log(`${LogColors.BRIGHT_YELLOW}[stocks-agent]${LogColors.RESET} Received request:`, message?.slice(0, 100));

  if (!apiKey || !message) {
    res.status(400).json({
      error: 'Missing required parameters: apiKey and message are required',
    });
    return;
  }

  const capture = startLogCapture();
  try {
    const stocks = createStocksAgent(apiKey);

    console.log(`${LogColors.BRIGHT_YELLOW}[stocks-agent]${LogColors.RESET} Starting stocks agent...`);
    const stream = await stocks.stream({
      messages: [{role: 'user', content: message}]
    }, { configurable: { thread_id: `stocks-${Date.now()}` }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.BRIGHT_YELLOW}[stocks-agent]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(', ')}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.BRIGHT_YELLOW}[stocks-agent]${LogColors.RESET} Completed in ${stepCount} steps`);
    const outputDir = saveAgentOutput('stocks', { message }, lastState);
    saveLogCapture(capture, outputDir);

    res.json({
      content: lastState,
      model: 'gpt-oss-120b',
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[stocks-agent] Error:${LogColors.RESET}`, error);
    capture.stop();
    res.status(500).json({
      error: 'Failed to get response from stocks agent',
      details: error.message,
    });
  }
});

// ─── MG-4 ────────────────────────────────────────────────────────────────────

app.post('/api/mg4/ask', async (req, res) => {
  const { message } = req.body;

  console.log(`${LogColors.MAGENTA}[mg4-agent]${LogColors.RESET} Received question:`, message?.slice(0, 100));

  if (!message) {
    res.status(400).json({
      error: 'Missing required parameters: message is required',
    });
    return;
  }

  const capture = startLogCapture();
  try {
    const apiToken = await getAccessToken();
    const mg4 = createMG4Agent(apiToken);

    console.log(`${LogColors.MAGENTA}[mg4-agent]${LogColors.RESET} Starting MG-4 agent...`);
    const stream = await mg4.stream({
      messages: [{role: 'user', content: message}]
    }, { configurable: { thread_id: `mg4-${Date.now()}` }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.MAGENTA}[mg4-agent]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(', ')}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.MAGENTA}[mg4-agent]${LogColors.RESET} Completed in ${stepCount} steps`);
    const mg4Result = saveMG4Output({ message }, lastState);
    saveLogCapture(capture, mg4Result?.outputDir ?? null);

    res.json({
      content: lastState,
      model: 'gpt-oss-120b',
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[mg4-agent] Error:${LogColors.RESET}`, error);
    capture.stop();
    res.status(500).json({
      error: 'Failed to get response from MG-4 agent',
      details: error.message,
    });
  }
});

// ─── IONIQ 6 ─────────────────────────────────────────────────────────────────

app.post('/api/ioniq6/ask', async (req, res) => {
  const { message } = req.body;

  console.log(`${LogColors.GREEN}[ioniq6-agent]${LogColors.RESET} Received question:`, message?.slice(0, 100));

  if (!message) {
    res.status(400).json({
      error: 'Missing required parameter: message is required',
    });
    return;
  }

  const capture = startLogCapture();
  try {
    const apiToken = await getAccessToken();
    const ioniq6 = createIONIQ6Agent(apiToken);

    console.log(`${LogColors.GREEN}[ioniq6-agent]${LogColors.RESET} Starting IONIQ 6 agent...`);
    const stream = await ioniq6.stream({
      messages: [{role: 'user', content: message}]
    }, { configurable: { thread_id: `ioniq6-${Date.now()}` }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.GREEN}[ioniq6-agent]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(', ')}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.GREEN}[ioniq6-agent]${LogColors.RESET} Completed in ${stepCount} steps`);
    const ioniq6Result = saveIONIQ6Output({ message }, lastState);
    saveLogCapture(capture, ioniq6Result?.outputDir ?? null);

    res.json({
      content: lastState,
      model: 'gpt-oss-120b',
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[ioniq6-agent] Error:${LogColors.RESET}`, error);
    capture.stop();
    res.status(500).json({
      error: 'Failed to get response from IONIQ 6 agent',
      details: error.message,
    });
  }
});

// ─── Mortgage ────────────────────────────────────────────────────────────────

app.post('/api/mortgage/ask', async (req, res) => {
  const { message } = req.body;

  console.log(`${LogColors.BRIGHT_CYAN}[mortgage-agent]${LogColors.RESET} Received question:`, message?.slice(0, 100));

  if (!message) {
    res.status(400).json({
      error: 'Missing required parameter: message is required',
    });
    return;
  }

  const capture = startLogCapture();
  try {
    const apiToken = await getAccessToken();
    const mortgage = createMortgageAgent(apiToken);

    console.log(`${LogColors.BRIGHT_CYAN}[mortgage-agent]${LogColors.RESET} Starting mortgage agent...`);
    const stream = await mortgage.stream({
      messages: [{role: 'user', content: message}]
    }, { configurable: { thread_id: `mortgage-${Date.now()}` }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.BRIGHT_CYAN}[mortgage-agent]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(', ')}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.BRIGHT_CYAN}[mortgage-agent]${LogColors.RESET} Completed in ${stepCount} steps`);
    const outputDir = saveMortgageOutput({ message }, lastState);
    saveLogCapture(capture, outputDir);

    res.json({
      content: lastState,
      model: 'gpt-oss-120b',
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[mortgage-agent] Error:${LogColors.RESET}`, error);
    capture.stop();
    res.status(500).json({
      error: 'Failed to get response from mortgage agent',
      details: error.message,
    });
  }
});

// ─── House ───────────────────────────────────────────────────────────────────

app.post('/api/house/ask', async (req, res) => {
  const { message } = req.body;

  console.log(`${LogColors.BRIGHT_BLUE}[house-agent]${LogColors.RESET} Received question:`, message?.slice(0, 100));

  if (!message) {
    res.status(400).json({
      error: 'Missing required parameter: message is required',
    });
    return;
  }

  const capture = startLogCapture();
  try {
    const apiToken = await getAccessToken();
    const house = createHouseAgent(apiToken);

    console.log(`${LogColors.BRIGHT_BLUE}[house-agent]${LogColors.RESET} Starting house agent...`);
    const stream = await house.stream({
      messages: [{role: 'user', content: message}]
    }, { configurable: { thread_id: `house-${Date.now()}` }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.BRIGHT_BLUE}[house-agent]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(', ')}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.BRIGHT_BLUE}[house-agent]${LogColors.RESET} Completed in ${stepCount} steps`);
    const outputDir = saveHouseOutput({ message }, lastState);
    saveLogCapture(capture, outputDir);

    res.json({
      content: lastState,
      model: 'gpt-oss-120b',
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[house-agent] Error:${LogColors.RESET}`, error);
    capture.stop();
    res.status(500).json({
      error: 'Failed to get response from house agent',
      details: error.message,
    });
  }
});

// ─── Appliances ──────────────────────────────────────────────────────────────

app.post('/api/appliances/ask', async (req, res) => {
  const { message } = req.body;

  console.log(`${LogColors.BLUE}[appliances-agent]${LogColors.RESET} Received question:`, message?.slice(0, 100));

  if (!message) {
    res.status(400).json({
      error: 'Missing required parameter: message',
    });
    return;
  }

  const capture = startLogCapture();
  try {
    const apiToken = await getAccessToken();
    const outputDir = createOutputDir('appliances', message, 'save-appliances-output');
    const appliances = createAppliancesAgent(apiToken, outputDir);

    console.log(`${LogColors.BLUE}[appliances-agent]${LogColors.RESET} Starting appliances agent...`);
    const stream = await appliances.stream({
      messages: [{role: 'user', content: message}]
    }, { configurable: { thread_id: `appliances-${Date.now()}` }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.BLUE}[appliances-agent]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(', ')}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.BLUE}[appliances-agent]${LogColors.RESET} Completed in ${stepCount} steps`);
    saveAppliancesOutput({ message }, lastState, outputDir);
    saveLogCapture(capture, outputDir);

    res.json({
      content: lastState,
      model: 'gpt-oss-120b',
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[appliances-agent] Error:${LogColors.RESET}`, error);
    capture.stop();
    res.status(500).json({
      error: 'Failed to get response from appliances agent',
      details: error.message,
    });
  }
});

// ─── Appliances merge endpoints ─────────────────────────────────────────────

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/appliances/merge', upload.array('files', 20), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const category = req.body?.category as string | undefined;

  console.log(`${LogColors.BLUE}[appliances-merge]${LogColors.RESET} Received ${files?.length ?? 0} files for merge`);

  if (!files || files.length === 0) {
    res.status(400).json({ error: 'Missing required files. Send one or more .xlsx, .pdf, or .md files in the "files" field.' });
    return;
  }

  try {
    const apiToken = await getAccessToken();
    const inputs = files.map(f => ({ buffer: f.buffer, filename: f.originalname }));
    const result = await produceUnifiedOutput(inputs, apiToken, category || undefined);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[appliances-merge] Error:${LogColors.RESET}`, error);
    res.status(500).json({
      error: 'Failed to merge appliance files',
      details: error.message,
    });
  }
});

app.post('/api/appliances/merge-local', async (req, res) => {
  const { paths, category } = req.body;

  console.log(`${LogColors.BLUE}[appliances-merge-local]${LogColors.RESET} Received ${paths?.length ?? 0} file paths for merge`);

  if (!Array.isArray(paths) || paths.length === 0) {
    res.status(400).json({ error: 'Missing required parameter: paths (array of file paths)' });
    return;
  }

  try {
    const apiToken = await getAccessToken();
    const result = await produceUnifiedOutputFromPaths(paths, apiToken, category || undefined);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[appliances-merge-local] Error:${LogColors.RESET}`, error);
    res.status(500).json({
      error: 'Failed to merge appliance files',
      details: error.message,
    });
  }
});

// ─── Slide Generator ─────────────────────────────────────────────────────────

type SlideGenSession = { agent: ReturnType<typeof createSlideGeneratorAgent>; outputDir: string };
const slideGenSessions = new Map<string, SlideGenSession>();

app.post('/api/slidegen/ask', async (req, res) => {
  const { message, threadId, repoUrl, attachedFiles } = req.body;

  console.log(`${LogColors.BRIGHT_MAGENTA}[slidegen-agent]${LogColors.RESET} Received request:`, message?.slice(0, 100), threadId ? `(thread=${threadId})` : '', attachedFiles?.length ? `(${attachedFiles.length} file(s) attached)` : '');

  if (!message) {
    res.status(400).json({ error: 'Missing required parameter: message' });
    return;
  }

  const capture = startLogCapture();
  try {
    const existing = threadId ? slideGenSessions.get(threadId) : undefined;
    const thread = threadId || `slidegen-${Date.now()}`;

    let agent: ReturnType<typeof createSlideGeneratorAgent>;
    let outputDir: string;
    if (existing) {
      agent = existing.agent;
      outputDir = existing.outputDir;
      console.log(`${LogColors.BRIGHT_MAGENTA}[slidegen-agent]${LogColors.RESET} Resuming session for thread=${thread}`);
    } else {
      const apiToken = await getAccessToken();
      outputDir = createOutputDir('slidegen', message, 'save-slide-generator-output');
      agent = createSlideGeneratorAgent(apiToken, {
        outputDir,
        githubToken: process.env.GITHUB_TOKEN || '',
        githubBaseUrl: PRIMARY_GITHUB?.apiUrl,
        publicGithubToken: process.env.PUBLIC_GITHUB_TOKEN || undefined,
      });
      slideGenSessions.set(thread, { agent, outputDir });
    }

    let userContent = message;
    if (repoUrl) {
      userContent += `\n\n[Code base to analyze and integrate into the deck: ${repoUrl}]`;
    }
    if (Array.isArray(attachedFiles) && attachedFiles.length > 0) {
      const listing = attachedFiles.map((f: string) => `  - ${f}`).join('\n');
      userContent += `\n\n[Attached files (call parse_attached_file for each):\n${listing}\n]`;
    }
    userContent += `\n\n[SYSTEM: This is a one-shot REST API call — the caller CANNOT reply to follow-up questions. ` +
      `Do NOT set needsClarification=true. Use sensible defaults for anything not specified and build the deck immediately. ` +
      `You MUST call generate_pptx (or generate_revealjs) and return a completed presentation file.]`;

    console.log(`${LogColors.BRIGHT_MAGENTA}[slidegen-agent]${LogColors.RESET} Starting slide generator agent...`);
    const stream = await agent.stream({
      messages: [{role: 'user', content: userContent}]
    }, { configurable: { thread_id: thread }, recursionLimit: 100 });

    let lastState: any = null;
    let stepCount = 0;
    for await (const chunk of stream) {
      stepCount++;
      const nodeNames = Object.keys(chunk);
      console.log(`${LogColors.BRIGHT_MAGENTA}[slidegen-agent]${LogColors.RESET} Step ${stepCount}: nodes=[${nodeNames.join(', ')}]`);
      lastState = chunk;
    }
    console.log(`${LogColors.BRIGHT_MAGENTA}[slidegen-agent]${LogColors.RESET} Completed in ${stepCount} steps`);
    saveSlideGeneratorOutput({ message, threadId: thread, repoUrl, attachedFiles }, lastState, outputDir);
    saveLogCapture(capture, outputDir);

    res.json({
      content: lastState,
      threadId: thread,
      model: 'gpt-oss-120b',
    });
  } catch (error: any) {
    console.error(`${LogColors.BRIGHT_RED}[slidegen-agent] Error:${LogColors.RESET}`, error);
    capture.stop();
    res.status(500).json({
      error: 'Failed to generate slides',
      details: error.message,
    });
  }
});


// ─── Start server ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
});
