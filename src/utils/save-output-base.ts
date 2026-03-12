import * as fs from "fs";
import * as path from "path";
import {LogColors} from './log-colors.util';

export const OUTPUTS_DIR = path.resolve(__dirname, "../../outputs");

export function sanitizeFolderName(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9\u0590-\u05FF\s-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase()
        .slice(0, 80);
}

export function generateTitleSummary(query: string): string {
    const words = query.trim().split(/\s+/).slice(0, 8);
    return sanitizeFolderName(words.join(" ")) || `query-${Date.now()}`;
}

export function normalizeNewlines(text: string): string {
    return text.replace(/\\n/g, "\n");
}

export function createOutputDir(agentName: string, query: string, tag: string): string {
    const folderName = generateTitleSummary(query);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const uniqueFolder = `${agentName}-${folderName}-${timestamp}`;
    const outputDir = path.join(OUTPUTS_DIR, uniqueFolder);

    console.log(`${LogColors.BRIGHT_BLUE}[${tag}]${LogColors.RESET} Saving output to: ${outputDir}`);

    fs.mkdirSync(outputDir, { recursive: true });
    return outputDir;
}

export function saveRequestJson(outputDir: string, request: Record<string, any>, tag: string): void {
    const requestPath = path.join(outputDir, "request.json");
    fs.writeFileSync(requestPath, JSON.stringify(request, null, 2), "utf-8");
    console.log(`${LogColors.BRIGHT_BLUE}[${tag}]${LogColors.RESET} Saved request.json`);
}

export function saveResponseJson(outputDir: string, fullResponse: any, tag: string): void {
    const responsePath = path.join(outputDir, "full-response.json");
    fs.writeFileSync(responsePath, JSON.stringify(fullResponse, null, 2), "utf-8");
    console.log(`${LogColors.BRIGHT_BLUE}[${tag}]${LogColors.RESET} Saved full-response.json`);
}
