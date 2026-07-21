/**
 * Central configuration module.
 *
 * All external URLs, tokens, and instance lists are read from environment
 * variables here — nothing is hardcoded to a specific vendor.
 *
 * Multi-instance support (GitHub, Confluence):
 *   Set GITHUB_INSTANCES / CONFLUENCE_INSTANCES as a JSON array of
 *   { name, baseUrl, token } objects.  Legacy single-value env vars
 *   (GITHUB_TOKEN, etc.) are still supported as a shorthand for a single instance.
 */

// ─── LLM ────────────────────────────────────────────────────────────────────

/** OpenAI-compatible LLM base URL (no trailing slash). */
export const LLM_BASE_URL =
    process.env.LLM_BASE_URL;

/** Default chat model name. */
export const LLM_MODEL =
    process.env.LLM_MODEL ?? 'gpt-oss-120b';

/** Vision model name (used by Chef image recognition). */
export const VISION_MODEL =
    process.env.VISION_MODEL ?? 'pixtral-12b-2409';

/** Vision model base URL — may differ from the main LLM endpoint. */
export const VISION_BASE_URL =
    process.env.VISION_BASE_URL ?? process.env.LLM_BASE_URL;

// ─── OAuth2 (client-credentials) ────────────────────────────────────────────

/** OAuth2 token endpoint for client-credentials flow. */
export const OAUTH_TOKEN_URL =
    process.env.OAUTH_TOKEN_URL;

export const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID ?? process.env.DELL_CLIENT_ID ?? '';
export const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET ?? process.env.DELL_CLIENT_SECRET ?? '';

// ─── GitHub instances ───────────────────────────────────────────────────────

export interface GitHubInstance {
    /** Human-readable label, e.g. "enterprise" or "public". */
    name: string;
    /** GitHub API base URL, e.g. "https://github.example.com/api/v3". */
    apiUrl: string;
    /** Host portion used by clone-repo (e.g. "github.example.com"). */
    host: string;
    /** Personal access token for this instance. */
    token: string;
}

/**
 * Parse GITHUB_INSTANCES JSON, falling back to legacy single-value env vars.
 *
 * Example JSON:
 * ```json
 * [
 *   { "name": "enterprise", "apiUrl": "https://git.corp.com/api/v3", "host": "git.corp.com", "token": "ghp_xxx" },
 *   { "name": "public", "apiUrl": "https://api.github.com", "host": "github.com", "token": "ghp_yyy" }
 * ]
 * ```
 */
function parseGitHubInstances(): GitHubInstance[] {
    const raw = process.env.GITHUB_INSTANCES;
    if (raw) {
        try {
            return JSON.parse(raw) as GitHubInstance[];
        } catch (e) {
            console.warn('[config] GITHUB_INSTANCES is not valid JSON, falling back to legacy env vars');
        }
    }

    // Legacy fallback — build instances from individual env vars
    const instances: GitHubInstance[] = [];

    const enterpriseUrl = process.env.GITHUB_ENTERPRISE_API_URL;
    const enterpriseHost = process.env.GITHUB_ENTERPRISE_HOST;
    const enterpriseToken = process.env.GITHUB_TOKEN ?? '';
    if (enterpriseUrl || enterpriseHost) {
        instances.push({
            name: 'enterprise',
            apiUrl: enterpriseUrl ?? `https://${enterpriseHost}/api/v3`,
            host: enterpriseHost ?? new URL(enterpriseUrl!).hostname,
            token: enterpriseToken,
        });
    }

    const publicToken = process.env.PUBLIC_GITHUB_TOKEN ?? '';
    instances.push({
        name: 'public',
        apiUrl: 'https://api.github.com',
        host: 'github.com',
        token: publicToken,
    });

    return instances;
}

export const GITHUB_INSTANCES: GitHubInstance[] = parseGitHubInstances();

/** Convenience: first non-public instance, or the first instance. */
export const PRIMARY_GITHUB =
    GITHUB_INSTANCES.find(i => i.name !== 'public') ?? GITHUB_INSTANCES[0];

/** Convenience: public GitHub instance. */
export const PUBLIC_GITHUB =
    GITHUB_INSTANCES.find(i => i.name === 'public' || i.host === 'github.com');

// ─── Confluence instances ───────────────────────────────────────────────────

export interface ConfluenceInstance {
    /** Human-readable label used as tool-name suffix, e.g. "legacy" or "cloud". */
    name: string;
    /** Confluence base URL (no trailing slash), e.g. "https://confluence.example.com". */
    baseUrl: string;
    /** Personal access token / Bearer token. */
    token: string;
}

/**
 * Parse CONFLUENCE_INSTANCES JSON, falling back to legacy env vars.
 *
 * Example JSON:
 * ```json
 * [
 *   { "name": "legacy", "baseUrl": "https://confluence.corp.com", "token": "xxx" },
 *   { "name": "cloud",  "baseUrl": "https://confluence.example.com", "token": "yyy" }
 * ]
 * ```
 */
function parseConfluenceInstances(): ConfluenceInstance[] {
    const raw = process.env.CONFLUENCE_INSTANCES;
    if (raw) {
        try {
            return JSON.parse(raw) as ConfluenceInstance[];
        } catch (e) {
            console.warn('[config] CONFLUENCE_INSTANCES is not valid JSON, falling back to legacy env vars');
        }
    }

    // Legacy fallback
    const instances: ConfluenceInstance[] = [];

    const legacyUrl = process.env.LEGACY_CONFLUENCE_URL ?? process.env.LEGACY_CONFLUENCE_BASE_URL;
    const legacyToken = process.env.LEGACY_CONFLUENCE_TOKEN ?? '';
    if (legacyUrl) {
        instances.push({ name: 'legacy', baseUrl: legacyUrl, token: legacyToken });
    }

    const newUrl = process.env.NEW_CONFLUENCE_URL ?? process.env.NEW_CONFLUENCE_BASE_URL;
    const newToken = process.env.NEW_CONFLUENCE_TOKEN ?? '';
    if (newUrl) {
        instances.push({ name: 'new', baseUrl: newUrl, token: newToken });
    }

    return instances;
}

export const CONFLUENCE_INSTANCES: ConfluenceInstance[] = parseConfluenceInstances();

// ─── Misc ───────────────────────────────────────────────────────────────────

export const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? '';
export const GIPHY_API_KEY = process.env.GIPHY_API_KEY ?? '';
