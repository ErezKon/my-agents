import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'My Agents REST API',
    description:
      'Multi-agent REST server powering GitHub analysis, PR impact assessment, Confluence Q&A, Chef vision, and general LLM chat.',
    version: '1.0.0',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local / Docker',
    },
  ],
  tags: [
    { name: 'GitHub', description: 'GitHub repository analysis & PR impact' },
    { name: 'Confluence', description: 'Confluence knowledge-base Q&A' },
    { name: 'Chef', description: 'Chef vision agent (image → recipe)' },
    { name: 'Stocks', description: 'Stock broker assistant — historic data, quotes & analysis' },
    { name: 'Chat', description: 'General LLM chat' },
    { name: 'MG-4', description: 'MG-4 car manual Q&A agent' },
    { name: 'IONIQ-6', description: 'Hyundai IONIQ 6 car manual Q&A agent' },
    { name: 'Mortgage', description: 'Hebrew mortgage advisor — offers analysis, comparison & optimization' },
    { name: 'House', description: 'Hebrew real-estate lawyer + construction engineer agent for contracts and diagrams' },
    { name: 'Appliances', description: 'Hebrew home-appliance expert — compares brands/models and generates Excel & PDF comparison files' },
    { name: 'Slide Generator', description: 'Deep-research slide generator — creates professional or fun presentations (PowerPoint .pptx or reveal.js HTML) from topics, markdown files, or existing decks' },
  ],
  paths: {
    '/api/github/analyze': {
      post: {
        tags: ['GitHub'],
        summary: 'Analyze a GitHub repository',
        description:
          'Runs the GitHub agent to analyze repositories, cross-reference summaries, and return a structured analysis.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: {
                    type: 'string',
                    example:
                      'Analyze the asm-deployer repository and list its main endpoints',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Structured analysis result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'object' },
                    model: { type: 'string', example: 'gpt-oss-120b' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameters' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/github/pr-impact': {
      post: {
        tags: ['GitHub'],
        summary: 'Analyze the impact of a pull request',
        description:
          'Fetches the PR diff, cross-references against repository summaries, and identifies affected endpoints, databases, services, and consumers.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['owner', 'repo', 'prNumber'],
                properties: {
                  owner: {
                    type: 'string',
                    example: 'my-org',
                  },
                  repo: {
                    type: 'string',
                    example: 'asm-deployer',
                  },
                  prNumber: {
                    type: 'integer',
                    example: 42,
                  },
                  message: {
                    type: 'string',
                    description: 'Optional additional instructions for the analysis',
                  },
                  summaryVersion: {
                    type: 'string',
                    description: 'Optional subdirectory to read summaries from (e.g. \'v7\'). If omitted, reads all summaries from the root directory.',
                    example: 'v7',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'PR impact analysis result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'object' },
                    model: { type: 'string', example: 'gpt-oss-120b' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameters' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/github/ask': {
      post: {
        tags: ['GitHub'],
        summary: 'Ask questions about a GitHub repository',
        description:
          'Runs the GitHub Q&A agent to answer questions about any repository. Can clone repos locally for deep analysis or use the GitHub API for quick lookups. Supports both enterprise and public GitHub instances.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: {
                    type: 'string',
                    example:
                      'How does the authentication flow work in the asm-deployer repo?',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Q&A response with answer, sources, and follow-up suggestions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'object' },
                    model: { type: 'string', example: 'gpt-oss-120b' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameters' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/confluence/ask': {
      post: {
        tags: ['Confluence'],
        summary: 'Ask a question against Confluence',
        description:
          'Runs the Confluence agent to search and answer questions from the knowledge base.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: {
                    type: 'string',
                    example: 'How do I configure Roo Code in VS Code?',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Confluence answer',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'object' },
                    model: { type: 'string', example: 'gpt-oss-120b' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameter' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/chef/image': {
      post: {
        tags: ['Chef'],
        summary: 'Analyze a food image and get a recipe',
        description:
          'Sends an image (base64) to the Chef vision agent which identifies the dish and returns a recipe.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['apiKey', 'message'],
                properties: {
                  apiKey: { type: 'string' },
                  message: {
                    type: 'string',
                    example: 'What dish is this and how do I make it?',
                  },
                  imageBase64: {
                    type: 'string',
                    description: 'Base64-encoded image data',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Chef agent response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'object' },
                    model: { type: 'string', example: 'gpt-oss-120b' },
                  },
                },
              },
            },
          },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/stocks/chat': {
      post: {
        tags: ['Stocks'],
        summary: 'Chat with the stock broker agent',
        description:
          'Runs the stocks agent to fetch historic stock data, current quotes, comparisons, and insights for US and Israeli (TASE) markets. Dates use dd/MM/yyyy format.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['apiKey', 'message'],
                properties: {
                  apiKey: { type: 'string' },
                  message: {
                    type: 'string',
                    example:
                      'Show me Apple stock opening and closing prices between 01/01/2025 and 31/01/2025',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Stocks agent response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'object' },
                    model: { type: 'string', example: 'gpt-oss-120b' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameters' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/mg4/ask': {
      post: {
        tags: ['MG-4'],
        summary: 'Ask a question about the MG-4 car',
        description:
          'Runs the MG-4 agent to search through car manuals (PDF) and answer questions about the MG-4 electric vehicle. Returns answers with quotes and references to the source manuals.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: {
                    type: 'string',
                    example: 'How do I charge the MG-4?',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'MG-4 agent response with quotes and references',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'object' },
                    model: { type: 'string', example: 'gpt-oss-120b' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameters' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/ioniq6/ask': {
      post: {
        tags: ['IONIQ-6'],
        summary: 'Ask a question about the Hyundai IONIQ 6',
        description:
          'Runs the IONIQ 6 agent to search through car manuals (PDF) and answer questions about the Hyundai IONIQ 6 electric vehicle. Supports English and Hebrew. Returns answers with quotes and references to the source manuals.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: {
                    type: 'string',
                    example: 'How do I charge the IONIQ 6?',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'IONIQ 6 agent response with quotes and references',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'object' },
                    model: { type: 'string', example: 'gpt-oss-120b' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameter' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/mortgage/ask': {
      post: {
        tags: ['Mortgage'],
        summary: 'Ask a question about mortgage offers',
        description:
          'Runs the mortgage advisor agent to analyze Hebrew mortgage offer PDFs, compare rates, calculate payments, explain terminology, and suggest improvements. Answers in Hebrew.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: {
                    type: 'string',
                    example:
                      '\u05d4\u05e1\u05d1\u05e8 \u05dc\u05d9 \u05d0\u05ea \u05d4\u05e6\u05e2\u05ea \u05d4\u05de\u05e9\u05db\u05e0\u05ea\u05d0 \u05e9\u05dc \u05d1\u05e0\u05e7 \u05d3\u05d9\u05e1\u05e7\u05d5\u05e0\u05d8 \u05db\u05d0\u05d9\u05dc\u05d5 \u05d0\u05e0\u05d9 \u05dc\u05d0 \u05de\u05d1\u05d9\u05df \u05db\u05dc\u05d5\u05dd',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Mortgage agent response with analysis and recommendations in Hebrew',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'object' },
                    model: { type: 'string', example: 'gpt-oss-120b' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameter' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/house/ask': {
      post: {
        tags: ['House'],
        summary: 'Ask a question about house contracts or construction diagrams',
        description:
          'Runs the house agent to analyze Hebrew real-estate contracts (\u05d4\u05e1\u05db\u05dd \u05de\u05db\u05e8, \u05e0\u05e1\u05e4\u05d7\u05d9\u05dd, \u05de\u05e4\u05e8\u05d8) and construction diagrams (architecture, electrical, structural plans). Can measure distances and areas from diagrams. Answers in Hebrew.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: {
                    type: 'string',
                    example:
                      '\u05de\u05d4 \u05de\u05d5\u05e2\u05d3 \u05d4\u05de\u05e1\u05d9\u05e8\u05d4 \u05dc\u05e4\u05d9 \u05d4\u05e1\u05db\u05dd \u05d4\u05de\u05db\u05e8?',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'House agent response with legal analysis or technical measurements in Hebrew',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'object' },
                    model: { type: 'string', example: 'gpt-oss-120b' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameter' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/appliances/ask': {
      post: {
        tags: ['Appliances'],
        summary: 'Compare home appliances across brands and generate comparison files',
        description:
          'Runs the appliances agent. Give it a list of brands per appliance; it finds 2-3 leading models per brand, compares features/reliability/price/value, searches the web (Tavily) for similar alternatives from other brands, and generates Excel + PDF comparison files per appliance. Answers in Hebrew.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: {
                    type: 'string',
                    example:
                      '\u05d4\u05e9\u05d5\u05d5\u05d4 \u05de\u05e7\u05e8\u05e8\u05d9\u05dd \u05de\u05d4\u05de\u05d5\u05ea\u05d2\u05d9\u05dd Bosch \u05d5-Samsung, \u05d5\u05de\u05e6\u05d0 \u05d7\u05dc\u05d5\u05e4\u05d5\u05ea \u05de\u05de\u05d5\u05ea\u05d2\u05d9\u05dd \u05d0\u05d7\u05e8\u05d9\u05dd',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Appliances agent response with comparisons and generated file paths, in Hebrew',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'object' },
                    model: { type: 'string', example: 'gpt-oss-120b' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameter' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/appliances/merge': {
      post: {
        tags: ['Appliances'],
        summary: 'Merge multiple appliance output files into a unified comparison',
        description:
          'Upload multiple appliance output files (.xlsx, .pdf, .md — any mix) produced by the appliances agent. The endpoint parses all files, merges models (deduplicating by brand+model and filling in missing data), generates a new unified summary and recommendations via LLM, and produces new Excel, PDF, and Markdown output files.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['files'],
                properties: {
                  files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                    description: 'One or more appliance output files (.xlsx, .pdf, .md)',
                  },
                  category: {
                    type: 'string',
                    description: 'Optional appliance category override in Hebrew (e.g. מקרר). If omitted, auto-detected from files.',
                    example: '\u05de\u05e7\u05e8\u05e8',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Merged output with file paths and unified summary',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    outputDir: { type: 'string' },
                    excelPath: { type: 'string' },
                    pdfPath: { type: 'string' },
                    mdPath: { type: 'string' },
                    modelCount: { type: 'integer' },
                    category: { type: 'string' },
                    summary: { type: 'string' },
                    warnings: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required files' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/appliances/merge-local': {
      post: {
        tags: ['Appliances'],
        summary: 'Merge appliance output files by local file paths',
        description:
          'Provide local file paths to appliance output files (.xlsx, .pdf, .md — any mix). The endpoint reads them from disk, parses, merges models, generates a unified summary via LLM, and produces new Excel, PDF, and Markdown output files.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['paths'],
                properties: {
                  paths: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of absolute file paths to appliance output files',
                    example: ['/home/user/outputs/comparison.xlsx', '/home/user/outputs/response.md'],
                  },
                  category: {
                    type: 'string',
                    description: 'Optional appliance category override in Hebrew',
                    example: '\u05de\u05e7\u05e8\u05e8',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Merged output with file paths and unified summary',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    outputDir: { type: 'string' },
                    excelPath: { type: 'string' },
                    pdfPath: { type: 'string' },
                    mdPath: { type: 'string' },
                    modelCount: { type: 'integer' },
                    category: { type: 'string' },
                    summary: { type: 'string' },
                    warnings: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameter: paths' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/slidegen/ask': {
      post: {
        tags: ['Slide Generator'],
        summary: 'Generate a presentation on any topic (PowerPoint or HTML)',
        description:
          'Runs the slide-generator agent. Provide a topic (or topics) and it performs deep web research, optionally analyzes a code repository or attached files (markdown, pptx, pdf, txt), ' +
          'and produces a professional .pptx PowerPoint file (default) or a self-contained reveal.js HTML file. ' +
          'Supports multi-turn conversations via an optional threadId — on the first call the agent may ask clarifying questions; send follow-up answers with the same threadId to continue. ' +
          'For markdown files: headings become slide titles/sections, bullet lists become slide bullets, code blocks become code slides. ' +
          'For existing .pptx files: extracts structure, content, and themes as inspiration or merge material.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: {
                    type: 'string',
                    example: 'Create a 10-slide professional presentation about Kubernetes autoscaling best practices',
                  },
                  threadId: {
                    type: 'string',
                    description: 'Optional thread ID for multi-turn conversations. Omit on the first call; reuse the returned threadId for follow-ups.',
                  },
                  repoUrl: {
                    type: 'string',
                    description: 'Optional URL of a Git repository to analyze and integrate into the deck.',
                    example: 'https://github.com/kubernetes/autoscaler',
                  },
                  attachedFiles: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional array of file paths to parse and use as input for the deck. Supports .md, .pptx, .pdf, .txt, .json, .csv, .xml, .yaml.',
                    example: ['/home/user/notes.md', '/home/user/template.pptx'],
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Slide generator response with deck content, output file path (pptx or html), and threadId for follow-ups',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'object' },
                    threadId: { type: 'string', description: 'Thread ID to reuse for follow-up messages' },
                    model: { type: 'string', example: 'gpt-oss-120b' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameter' },
          '500': { description: 'Internal server error' },
        },
      },
    },
    '/api/chat': {
      post: {
        tags: ['Chat'],
        summary: 'Send a message to the LLM',
        description:
          'General-purpose chat endpoint. Supports both streaming (SSE) and non-streaming responses.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message', 'model', 'apiKey'],
                properties: {
                  message: { type: 'string', example: 'Hello, who are you?' },
                  model: { type: 'string', example: 'gpt-oss-120b' },
                  apiKey: { type: 'string' },
                  stream: {
                    type: 'boolean',
                    default: false,
                    description: 'Enable Server-Sent Events streaming',
                  },
                  temperature: {
                    type: 'number',
                    default: 0.8,
                    description: 'Sampling temperature (0-2)',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'LLM response (JSON or SSE stream)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'string' },
                    model: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required parameters' },
          '500': { description: 'Internal server error' },
        },
      },
    },
  },
};

export function setupSwagger(app: Express): void {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  app.get('/', (_req, res) => {
    res.redirect('/api-docs');
  });
}
