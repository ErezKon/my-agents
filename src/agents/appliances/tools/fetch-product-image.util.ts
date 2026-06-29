/**
 * ============================================================================
 * FETCH PRODUCT IMAGE UTILITY — Download Appliance Images from the Web
 * ============================================================================
 *
 * This utility provides a single async function for downloading product images
 * from external URLs and returning them as Node.js `Buffer` objects.
 *
 * PURPOSE:
 * ────────
 * When the Appliances agent finds product listings on Israeli retail sites,
 * those listings often include product image URLs. This utility fetches those
 * images so they can be:
 *   - Embedded in exported PDF/Excel comparison documents
 *   - Sent to a vision model for visual product analysis
 *   - Displayed in a frontend chat UI alongside product details
 *
 * DESIGN DECISIONS:
 * - **10-second timeout**: Product image servers can be slow; 10s is generous
 *   but prevents hanging indefinitely on unreachable hosts.
 * - **Custom User-Agent**: Uses a descriptive UA string to avoid bot-blocking
 *   by retail sites that reject default `fetch` UA strings.
 * - **Null on failure**: Returns `null` instead of throwing on any error
 *   (HTTP errors, timeouts, network failures). This is safe for tool-chain
 *   usage — the caller can simply skip the image if it fails.
 * - **Buffer output**: Returns a raw `Buffer` which can be base64-encoded
 *   for LLM vision APIs or written directly to disk for exports.
 *
 * LOGGING:
 * Uses color256 ANSI code 135 (purple) for `[fetch-product-image]` log tags
 * to distinguish image-fetch logs from search/extract logs in console output.
 * ============================================================================
 */

import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(135)}[fetch-product-image]${LogColors.RESET}`;

/**
 * Download an image from a URL and return it as a Buffer.
 *
 * @param imageUrl - The full URL of the product image to fetch.
 * @returns A `Buffer` containing the image data, or `null` on any failure.
 */
export async function fetchProductImage(imageUrl: string): Promise<Buffer | null> {
    try {
        console.log(`${TAG} Fetching: ${imageUrl.slice(0, 80)}...`);
        const response = await fetch(imageUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; ApplianceAgent/1.0)",
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            console.log(`${TAG} HTTP ${response.status}`);
            return null;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        console.log(`${TAG} Downloaded ${Math.round(buffer.length / 1024)}KB`);
        return buffer;
    } catch (err: any) {
        console.log(`${TAG} ERROR: ${err.message}`);
        return null;
    }
}
