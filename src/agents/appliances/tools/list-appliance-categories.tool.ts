/**
 * ============================================================================
 * LIST APPLIANCE CATEGORIES TOOL — Browse All Supported Product Categories
 * ============================================================================
 *
 * A LangChain tool that returns a comprehensive catalog of home-appliance
 * categories supported by the Appliances agent. This is typically the first
 * tool called in a conversation — the agent uses it to orient itself when
 * the user asks a broad question like "what can you help me with?" or
 * "I need a new kitchen appliance."
 *
 * DATA SOURCE:
 * ────────────
 * The category data is hardcoded in a `CATEGORIES` constant rather than
 * fetched from the web. This is intentional:
 *   - Category structure rarely changes (washing machines don't become a
 *     new product type overnight)
 *   - Brands and price ranges are approximate, serving as orientation
 *     rather than authoritative pricing
 *   - Eliminates an API call for basic browsing, keeping responses fast
 *
 * Each category includes:
 *   - Hebrew name (primary) and English name
 *   - Subcategories (e.g., "front-load" vs "top-load" for washing machines)
 *   - Major brands available in Israel
 *   - Typical Israeli price range in NIS (₪)
 *
 * CATEGORIES COVERED (9 total):
 *   מכונות כביסה, מייבשי כביסה, מקררים, תנורים, כיריים,
 *   מדיחי כלים, מזגנים, שואבי אבק, טלוויזיות
 *
 * USAGE BY THE AGENT:
 * - Called with `category="all"` (or no argument) → returns all 9 categories
 * - Called with a specific Hebrew name → returns details for that one category
 * - The agent uses this to narrow down the user's needs before calling
 *   `search_appliances` with more targeted queries
 *
 * LANGCHAIN TOOL PATTERN:
 * Uses the `tool()` function from `"langchain"` with a Zod input schema.
 * The LLM reads the `description` and `schema` to decide when and how to
 * call this tool. Returns a JSON string that the agent parses and
 * incorporates into its reasoning.
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(220)}[list_appliance_categories]${LogColors.RESET}`;

/**
 * Static catalog of home-appliance categories with Israeli market data.
 * Keys are Hebrew category names; values include English names, subcategories,
 * major brands, and typical price ranges in NIS.
 */
const CATEGORIES = {
    "מכונות כביסה": { nameEn: "Washing Machines", subcategories: ["פתח קדמי", "פתח עליון", "כביסה-ייבוש משולב"], brands: ["LG", "Samsung", "Bosch", "Electrolux", "Miele", "Whirlpool", "Beko", "AEG"], priceRange: "1,500-8,000 ₪" },
    "מייבשי כביסה": { nameEn: "Dryers", subcategories: ["קונדנסור", "משאבת חום", "אוורור"], brands: ["LG", "Samsung", "Bosch", "Electrolux", "Miele", "Beko", "AEG"], priceRange: "1,800-6,000 ₪" },
    "מקררים": { nameEn: "Refrigerators", subcategories: ["דו-דלתי", "צד-בצד", "פרנצ'", "מקרר-מקפיא עליון", "מקרר-מקפיא תחתון"], brands: ["LG", "Samsung", "Haier", "Amcor", "Hitachi", "Bosch", "Electrolux"], priceRange: "2,000-15,000 ₪" },
    "תנורים": { nameEn: "Ovens", subcategories: ["בנוי", "משולב", "תנור אדים"], brands: ["Bosch", "Siemens", "Electrolux", "AEG", "Miele", "Samsung", "LG"], priceRange: "1,500-10,000 ₪" },
    "כיריים": { nameEn: "Cooktops", subcategories: ["אינדוקציה", "גז", "קרמיים", "משולב"], brands: ["Bosch", "Siemens", "Electrolux", "Sauter", "Candy", "Gorenje"], priceRange: "800-6,000 ₪" },
    "מדיחי כלים": { nameEn: "Dishwashers", subcategories: ["רגיל (60 ס\"מ)", "צר (45 ס\"מ)", "שולחני"], brands: ["Bosch", "Siemens", "Electrolux", "LG", "Samsung", "Beko", "Miele"], priceRange: "1,500-6,000 ₪" },
    "מזגנים": { nameEn: "Air Conditioners", subcategories: ["עילי (ספליט)", "נייד", "מרכזי", "מיני מרכזי"], brands: ["Tadiran", "Electra", "Tornado", "Midea", "Daikin", "Mitsubishi", "Fujitsu"], priceRange: "2,000-8,000 ₪" },
    "שואבי אבק": { nameEn: "Vacuum Cleaners", subcategories: ["רובוטי", "אלחוטי מוט", "שקית", "ציקלון"], brands: ["Dyson", "iRobot", "Roborock", "Samsung", "Xiaomi", "Bosch", "Electrolux"], priceRange: "500-4,000 ₪" },
    "טלוויזיות": { nameEn: "Televisions", subcategories: ["OLED", "QLED", "LED/LCD", "Mini-LED"], brands: ["LG", "Samsung", "Sony", "TCL", "Hisense"], priceRange: "1,500-25,000 ₪" },
};

/**
 * LangChain tool: list_appliance_categories
 *
 * Returns all or a specific appliance category with subcategories, brands,
 * and price ranges. The LLM uses this to orient the conversation and
 * understand the user's product domain before performing targeted searches.
 */
export const listApplianceCategories = tool(
    ({ category }) => {
        const cat = category || "all";
        console.log(`${TAG} INPUT: category="${cat}"`);

        if (cat !== "all" && CATEGORIES[cat as keyof typeof CATEGORIES]) {
            const info = CATEGORIES[cat as keyof typeof CATEGORIES];
            const result = { category: cat, ...info };
            console.log(`${TAG} OUTPUT: single category "${cat}"`);
            return JSON.stringify(result);
        }

        const allCategories = Object.entries(CATEGORIES).map(([name, info]) => ({
            categoryHebrew: name,
            categoryEnglish: info.nameEn,
            subcategories: info.subcategories,
            topBrands: info.brands,
            priceRange: info.priceRange,
        }));

        console.log(`${TAG} OUTPUT: ${allCategories.length} categories`);
        return JSON.stringify({ count: allCategories.length, categories: allCategories });
    },
    {
        name: "list_appliance_categories",
        description: "List all supported home appliance categories with subcategories, top brands, and typical price ranges in Israel. Optionally filter by a specific category name (in Hebrew).",
        schema: z.object({
            category: z.string().optional().describe("Optional category name in Hebrew to get details for a specific category. Leave empty for all categories."),
        }),
    }
);
