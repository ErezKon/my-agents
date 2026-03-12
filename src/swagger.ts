import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const swaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "My Agents REST API",
    description:
      "Multi-agent REST server powering Chef vision, Stock broker, MG-4 car manual Q&A, and IONIQ 6 car manual Q&A agents.",
    version: "1.0.0",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local / Docker",
    },
  ],
  tags: [
    { name: "Chef", description: "Chef vision agent (image → recipe)" },
    { name: "Stocks", description: "Stock broker assistant — historic data, quotes & analysis" },
    { name: "MG-4", description: "MG-4 car manual Q&A agent" },
    { name: "IONIQ-6", description: "Hyundai IONIQ 6 car manual Q&A agent" },
  ],
  paths: {
    "/api/chef/image": {
      post: {
        tags: ["Chef"],
        summary: "Analyze a food image and get a recipe",
        description:
          "Sends an image (base64) to the Chef vision agent which identifies the dish and returns a recipe.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["apiKey", "message"],
                properties: {
                  apiKey: { type: "string" },
                  message: {
                    type: "string",
                    example: "What dish is this and how do I make it?",
                  },
                  imageBase64: {
                    type: "string",
                    description: "Base64-encoded image data",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Chef agent response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: { type: "object" },
                    model: { type: "string", example: "gpt-oss-120b" },
                  },
                },
              },
            },
          },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/api/stocks/chat": {
      post: {
        tags: ["Stocks"],
        summary: "Chat with the stock broker agent",
        description:
          "Runs the stocks agent to fetch historic stock data, current quotes, comparisons, and insights for US and Israeli (TASE) markets. Dates use dd/MM/yyyy format.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["apiKey", "message"],
                properties: {
                  apiKey: { type: "string" },
                  message: {
                    type: "string",
                    example:
                      "Show me Apple stock opening and closing prices between 01/01/2025 and 31/01/2025",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Stocks agent response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: { type: "object" },
                    model: { type: "string", example: "gpt-oss-120b" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing required parameters" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/api/mg4/ask": {
      post: {
        tags: ["MG-4"],
        summary: "Ask a question about the MG-4 car",
        description:
          "Runs the MG-4 agent to search through car manuals (PDF) and answer questions about the MG-4 electric vehicle. Returns answers with quotes and references to the source manuals.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  message: {
                    type: "string",
                    example: "How do I charge the MG-4?",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "MG-4 agent response with quotes and references",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: { type: "object" },
                    model: { type: "string", example: "gpt-oss-120b" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing required parameters" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/api/ioniq6/ask": {
      post: {
        tags: ["IONIQ-6"],
        summary: "Ask a question about the Hyundai IONIQ 6",
        description:
          "Runs the IONIQ 6 agent to search through car manuals (PDF) and answer questions about the Hyundai IONIQ 6 electric vehicle. Supports English and Hebrew. Returns answers with quotes and references to the source manuals.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  message: {
                    type: "string",
                    example: "How do I charge the IONIQ 6?",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "IONIQ 6 agent response with quotes and references",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: { type: "object" },
                    model: { type: "string", example: "gpt-oss-120b" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing required parameter" },
          "500": { description: "Internal server error" },
        },
      },
    },
  },
};

export function setupSwagger(app: Express): void {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  app.get("/", (_req, res) => {
    res.redirect("/api-docs");
  });
}
