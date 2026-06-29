/**
 * ============================================================================
 * APPLIANCE GLOSSARY TOOL — Hebrew Technical Term Dictionary
 * ============================================================================
 *
 * A LangChain tool that provides definitions and simple explanations for
 * technical home-appliance terms in Hebrew. The agent calls this tool
 * whenever it introduces technical jargon in its response, ensuring the
 * user always gets an accessible explanation alongside the technical term.
 *
 * GLOSSARY DESIGN:
 * ────────────────
 * The glossary is a hardcoded `Record<string, { definition, simple }>` with
 * 13 entries covering the most commonly misunderstood appliance technologies:
 *
 *   - Inverter (אינוורטר) — Variable-speed motor technology
 *   - Energy Rating (דירוג אנרגטי) — A+++ to G efficiency scale
 *   - Induction (אינדוקציה) — Magnetic cooktop technology
 *   - Heat Pump (משאבת חום) — Energy-efficient dryer technology
 *   - No Frost — Frost-free refrigerator/freezer system
 *   - Condenser (קונדנסור) — Ventless dryer technology
 *   - Cyclone (ציקלון) — Bagless vacuum technology
 *   - OLED — Organic LED display technology
 *   - QLED — Quantum dot LED display technology
 *   - Direct Drive — Belt-free washing machine motor
 *   - Built-in (דגם built-in) — Cabinet-integrated appliances
 *   - Smart Diagnosis — Remote fault diagnosis via smartphone
 *   - AquaStop — Flood protection system
 *
 * Each entry has two explanations:
 *   - `definition` — Full technical definition in Hebrew
 *   - `simple` — Layman-friendly one-liner in Hebrew
 *
 * SEARCH BEHAVIOR:
 * - **Exact match**: Case-insensitive exact lookup (most common path)
 * - **Fuzzy match**: If no exact match, searches for partial substring
 *   matches in both directions (query ⊂ term or term ⊂ query)
 * - **Not found**: Returns the full list of available terms so the LLM
 *   can suggest the closest match to the user
 *
 * WHY HARDCODED (NOT WEB SEARCH)?
 * Glossary terms are stable technical definitions that don't change with
 * market conditions. Hardcoding avoids unnecessary API calls and ensures
 * consistent, curated explanations. The agent can always supplement with
 * web search if the user asks about a term not in the glossary.
 *
 * LANGCHAIN TOOL PATTERN:
 * This is a synchronous tool (no async) since it only accesses in-memory
 * data. The `tool()` function from `"langchain"` wraps it with the standard
 * name/description/schema metadata for LLM tool-calling.
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(172)}[appliance_glossary]${LogColors.RESET}`;

/**
 * Hebrew glossary of technical home-appliance terms.
 * Each entry provides a full technical definition and a simplified
 * one-sentence explanation suitable for non-technical users.
 */
const GLOSSARY: Record<string, { definition: string; simple: string }> = {
    "אינוורטר": { definition: "טכנולוגיית מנוע המשנה את מהירות הסיבוב בהתאם לעומס, במקום לעבוד במהירות קבועה. חוסך חשמל ומפחית רעש.", simple: "מנוע חכם שמתאים את העוצמה לפי הצורך — חוסך חשמל ושקט יותר." },
    "דירוג אנרגטי": { definition: "סולם מ-A+++ (הכי חסכוני) עד G (הכי בזבזני). בישראל נהוג הסולם האירופי. מוצר A+++ צורך כ-50% פחות חשמל מ-A.", simple: "כמה חשמל המוצר צורך. A+++ הכי חסכוני, G הכי בזבזני." },
    "אינדוקציה": { definition: "טכנולוגיית בישול שמחממת את הסיר ישירות באמצעות שדה מגנטי, ולא את משטח הכיריים. מהירה, בטוחה וחסכונית יותר מגז.", simple: "כיריים שמחממות את הסיר ישירות עם מגנט — לא את המשטח. מהיר ובטוח." },
    "משאבת חום": { definition: "טכנולוגיית ייבוש שמשתמשת במחזור חום סגור במקום התנגדות חשמלית. חוסכת עד 50% חשמל לעומת מייבש קונדנסור רגיל.", simple: "מייבש חסכוני שמשתמש בחום חכם — חוסך הרבה חשמל." },
    "No Frost": { definition: "מערכת שמונעת הצטברות קרח בתוך המקרר/מקפיא. אוויר קר מנופץ באופן אחיד כך שאין צורך בהפשרה ידנית.", simple: "מקרר שלא צריך להפשיר — אין קרח שמצטבר." },
    "קונדנסור": { definition: "מייבש שאוסף לחות מהבגדים ומעבה אותה למים במיכל (שצריך לרוקן) או מנקז לביוב. לא דורש פתח אוורור.", simple: "מייבש שהופך את הלחות למים ואוסף אותם במיכל. לא צריך חור בקיר." },
    "ציקלון": { definition: "טכנולוגיית שאיבה ללא שקית — השואב מסובב את האוויר במהירות גבוהה כדי להפריד אבק מאוויר באמצעות כוח צנטריפוגלי.", simple: "שואב אבק בלי שקית — מסובב את האוויר ומפריד את הלכלוך." },
    "OLED": { definition: "Organic Light Emitting Diode — טכנולוגיית מסך שבה כל פיקסל פולט אור בעצמו. שחור מושלם, ניגודיות אינסופית, וזוויות צפייה רחבות.", simple: "סוג מסך שכל נקודה דולקת בעצמה — צבעים מדהימים ושחור אמיתי." },
    "QLED": { definition: "Quantum dot LED — טכנולוגיית מסך של סמסונג. משתמשת בנקודות קוונטיות להגברת צבע ובהירות. בהירה יותר מ-OLED אך אין לה שחור מוחלט.", simple: "מסך LED משודרג עם צבעים חזקים יותר. בהיר מאוד אבל השחור לא מושלם כמו OLED." },
    "Direct Drive": { definition: "מנוע המחובר ישירות לתוף ללא רצועה. פחות רעידות, פחות רעש, פחות בלאי, ואחריות ארוכה יותר (עד 10 שנים על המנוע).", simple: "מנוע שמחובר ישירות לתוף בלי חלקים מיותרים — שקט יותר ומחזיק יותר זמן." },
    "דגם built-in": { definition: "מוצר שנבנה להתקנה בתוך ארון מטבח — משתלב עם קו הארונות. דורש מידות מדויקות ולעיתים התקנה מקצועית.", simple: "מוצר שמתחבא בתוך ארון המטבח — נראה חלק ויפה." },
    "Smart Diagnosis": { definition: "יכולת אבחון תקלות מרחוק באמצעות אפליקציה בסמארטפון. המכשיר שולח קודי שגיאה לטכנאי דרך הטלפון.", simple: "המכשיר יכול לספר לטכנאי מה התקלה דרך האפליקציה בטלפון." },
    "AquaStop": { definition: "מערכת הגנה מפני הצפות במכונות כביסה ומדיחי כלים. כוללת חיישנים וצינור כפול שמפסיקים את זרימת המים אם מזוהה דליפה.", simple: "הגנה מפני הצפה — אם יש דליפה, המים נעצרים אוטומטית." },
};

/**
 * Performs a fuzzy substring search against the glossary keys.
 * Matches if the search term is a substring of a key, or vice versa.
 *
 * @param term - The term to search for (case-insensitive).
 * @returns Array of matching glossary keys.
 */
function fuzzySearch(term: string): string[] {
    const lower = term.toLowerCase();
    return Object.keys(GLOSSARY).filter(key =>
        key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())
    );
}

/**
 * LangChain tool: appliance_glossary
 *
 * Looks up a Hebrew appliance term and returns both a technical definition
 * and a simple explanation. Supports exact and fuzzy matching.
 */
export const applianceGlossary = tool(
    ({ term }) => {
        console.log(`${TAG} INPUT: term="${term}"`);

        // Try exact match first (case-insensitive)
        const lower = term.toLowerCase();
        const exactKey = Object.keys(GLOSSARY).find(k => k.toLowerCase() === lower);
        if (exactKey) {
            const entry = GLOSSARY[exactKey];
            console.log(`${TAG} OUTPUT: found exact match for "${exactKey}"`);
            return JSON.stringify({ found: true, term: exactKey, definitionHebrew: entry.definition, simpleExplanationHebrew: entry.simple });
        }

        // Try fuzzy substring match
        const matches = fuzzySearch(term);
        if (matches.length > 0) {
            const bestMatch = matches[0];
            const entry = GLOSSARY[bestMatch];
            console.log(`${TAG} OUTPUT: fuzzy match "${bestMatch}" for "${term}"`);
            return JSON.stringify({ found: true, fuzzyMatch: true, term: bestMatch, definitionHebrew: entry.definition, simpleExplanationHebrew: entry.simple, otherMatches: matches.slice(1) });
        }

        // Not found — return available terms for the LLM to suggest alternatives
        console.log(`${TAG} OUTPUT: not found "${term}"`);
        return JSON.stringify({ found: false, term, availableTerms: Object.keys(GLOSSARY) });
    },
    {
        name: "appliance_glossary",
        description: "Look up the definition and simple explanation of a Hebrew home appliance term. Returns both a technical definition and a layman-friendly explanation in Hebrew. Use this whenever introducing technical appliance terminology to the user. Supports fuzzy matching.",
        schema: z.object({
            term: z.string().describe("The appliance term to look up in Hebrew (e.g. 'אינוורטר', 'אינדוקציה', 'OLED', 'No Frost')"),
        }),
    }
);
