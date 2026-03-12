import {tool} from "@langchain/core/tools";
import {z} from "zod";
import * as fs from "fs";
import * as path from "path";
import {LogColors, color256} from '../../../utils/log-colors.util';

const TAG = `${color256(117)}[get_capabilities]${LogColors.RESET}`;

const SAMPLES_DIR = path.join(__dirname, "..", "json response samples");

export const createGetCapabilitiesTool = () => tool(
    async () => {
        console.log(`${TAG} Loading capabilities from ${SAMPLES_DIR}`);

        if (!fs.existsSync(SAMPLES_DIR)) {
            const errMsg = `Samples directory not found: ${SAMPLES_DIR}`;
            console.log(`${TAG} ERROR: ${errMsg}`);
            return JSON.stringify({error: errMsg});
        }

        const files = fs.readdirSync(SAMPLES_DIR)
            .filter(f => f.endsWith(".json"))
            .sort();

        const capabilities = [];

        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(SAMPLES_DIR, file), "utf-8");
                const parsed = JSON.parse(content);
                capabilities.push({
                    name: parsed.name,
                    description: parsed.description,
                    exampleQuery: parsed.exampleQuery,
                    sampleResponse: JSON.stringify(parsed.sampleResponse, null, 2),
                });
            } catch (err) {
                console.log(`${TAG} WARNING: Failed to parse ${file}: ${err}`);
            }
        }

        const result = JSON.stringify({count: capabilities.length, capabilities});
        console.log(`${TAG} OUTPUT: loaded ${capabilities.length} capabilities`);
        return result;
    },
    {
        name: "get_capabilities",
        description: "List all available capabilities of the stock agent. Returns every ability with its name, description, an example user query, and a sample JSON response. Call this tool when the user asks what you can do, what operations are available, or requests help.",
        schema: z.object({}),
    }
);
