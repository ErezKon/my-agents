/**
 * ============================================================================
 * HOUSE GLOSSARY TOOL — Real Estate & Construction Terminology Explainer
 * ============================================================================
 *
 * A LangChain tool that provides simple Hebrew explanations for professional
 * real estate and construction terms. The House agent uses this when
 * encountering technical jargon in contracts or diagrams to help the user
 * understand complex terminology.
 *
 * The glossary covers two domains:
 *
 * LEGAL TERMS (real estate):
 * - Contract terminology: הסכם מכר, נספח, מפרט, ערבות, שעבוד, etc.
 * - Property rights: טאבו, רישום, זיקת הנאה, בעלות, חכירה, etc.
 * - Financial terms: היטל השבחה, מס רכישה, מס שבח, etc.
 * - Legal processes: איחור במסירה, פיצוי מוסכם, תקופת בדק, etc.
 *
 * CONSTRUCTION TERMS (engineering):
 * - Architectural: תוכנית אדריכלית, חתך, מפלס, קומת עמודים, etc.
 * - Structural: קונסטרוקציה, עמוד, קורה, יסוד, שלד, etc.
 * - Electrical: לוח חשמל, נקודת חשמל, מפסק, שקע, etc.
 * - Plumbing: ביוב, ניקוז, צנרת, ברז, שוחה, etc.
 * - Standards: תקן ישראלי, תב"ע, היתר בנייה, etc.
 *
 * SEARCH STRATEGY:
 * Uses fuzzy matching — the input term is searched against all glossary
 * keys using substring matching. This handles partial terms, variations,
 * and abbreviations. If no exact match is found, returns the closest
 * matches as suggestions.
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import { LogColors, color256 } from '../../../utils/log-colors.util';

/**
 * Comprehensive Hebrew glossary of real estate and construction terms.
 * Each entry has the term as key and a simple Hebrew explanation as value.
 */
const glossary: Record<string, string> = {
    // ===== LEGAL / REAL ESTATE TERMS =====
    "הסכם מכר": "חוזה משפטי בין קונה למוכר המפרט את תנאי רכישת הנכס — מחיר, מועדי תשלום, מועד מסירה, ותנאים נוספים.",
    "נספח": "מסמך המצורף לחוזה הראשי ומהווה חלק בלתי נפרד ממנו. כולל פרטים נוספים כמו מפרט טכני, תוכניות, או תנאים מיוחדים.",
    "מפרט טכני": "מסמך המפרט את החומרים, הגימורים והאביזרים שייכללו בדירה — סוג ריצוף, חיפוי, כלים סניטריים, ארונות מטבח וכו'.",
    "ערבות": "התחייבות כספית של צד שלישי (בדרך כלל בנק) להבטיח את כספי הרוכש במקרה שהקבלן לא יעמוד בהתחייבויותיו.",
    "ערבות חוק מכר": "ערבות בנקאית שהקבלן חייב לתת לרוכש על פי חוק המכר (דירות), המבטיחה את כספי הרוכש.",
    "שעבוד": "רישום משכנתא או זכות אחרת על הנכס לטובת צד שלישי (בנק, גוף מממן). מגביל את יכולת המכירה של הנכס.",
    "טאבו": "רישום הזכויות בנכס בלשכת רישום המקרקעין — הרישום הרשמי ביותר של בעלות על קרקע או דירה בישראל.",
    "רישום בטאבו": "העברת הבעלות הרשמית על הנכס על שם הקונה בלשכת רישום המקרקעין.",
    "זיקת הנאה": "זכות שימוש מוגבלת בנכס של אדם אחר — למשל זכות מעבר דרך חצר שכנה.",
    "בעלות": "הזכות המלאה והמוחלטת בנכס — הכוללת שימוש, הנאה, ומכירה.",
    "חכירה": "שכירות לטווח ארוך (בדרך כלל 49-98 שנים) של קרקע מבעלי הקרקע (לרוב רשות מקרקעי ישראל).",
    "היטל השבחה": "תשלום לוועדה המקומית לתכנון ובנייה בגין עליית ערך הנכס כתוצאה מאישור תוכנית בניין עיר חדשה.",
    "מס רכישה": "מס שמשלם הקונה לרשות המסים בעת רכישת נכס. שיעור המס תלוי במחיר הנכס ובמעמד הרוכש (דירה ראשונה/נוספת).",
    "מס שבח": "מס שמשלם המוכר על הרווח (השבח) שנוצר ממכירת הנכס — ההפרש בין מחיר הרכישה למחיר המכירה.",
    "איחור במסירה": "מצב שבו הקבלן מוסר את הדירה לאחר המועד שנקבע בחוזה. לפי חוק המכר, הקונה זכאי לפיצוי.",
    "פיצוי מוסכם": "סכום פיצויים שנקבע מראש בחוזה למקרה של הפרה — למשל פיצוי על כל חודש איחור במסירה.",
    "תקופת בדק": "תקופה שלאחר מסירת הדירה שבה הקבלן אחראי לתיקון ליקויים. משתנה לפי סוג הליקוי (1-7 שנים).",
    "תקופת אחריות": "תקופה שלאחר תקופת הבדק שבה הקבלן עדיין אחראי לליקויים, אך נטל ההוכחה עובר לרוכש.",
    "מסירת חזקה": "הרגע שבו הקבלן מעביר את השליטה הפיזית בדירה לרוכש — מוסר מפתחות ופרוטוקול מסירה.",
    "פרוטוקול מסירה": "מסמך שנחתם במעמד קבלת הדירה ובו מתועדים כל הליקויים והחוסרים שהרוכש מזהה בדירה.",

    // ===== CONSTRUCTION / ARCHITECTURAL TERMS =====
    "תוכנית אדריכלית": "שרטוט טכני המציג את מבנה הדירה/בניין מלמעלה — חלוקת חדרים, קירות, דלתות, חלונות, מידות.",
    "חתך": "שרטוט המציג את המבנה כאילו נחתך אנכית — מראה את הגבהים, המפלסים, עובי הרצפות והתקרות.",
    "מפלס": "גובה של רצפה או משטח ביחס לנקודת ייחוס (בדרך כלל פני הקרקע או מפלס הכניסה). מסומן ±0.00.",
    "קומת עמודים": "קומת הקרקע של הבניין כשהיא פתוחה ומוגבהת על עמודים (פילוטיס) — משמשת לחניה או מעבר.",
    "פילוטיס": "שם נוסף לקומת עמודים — קומת קרקע פתוחה על עמודים.",
    "קונסטרוקציה": "השלד הנושא של המבנה — עמודים, קורות, תקרות ויסודות מבטון מזוין.",
    "עמוד": "אלמנט מבני אנכי מבטון מזוין הנושא את משקל המבנה ומעביר אותו ליסודות.",
    "קורה": "אלמנט מבני אופקי מבטון מזוין המחבר בין עמודים ונושא את משקל התקרה.",
    "יסוד": "בסיס המבנה — אלמנט בטון מזוין הנמצא מתחת לפני הקרקע ומעביר את משקל המבנה לאדמה.",
    "שלד": "מערכת השלד הנושאת של המבנה — כולל עמודים, קורות, תקרות ויסודות.",
    "תקרה": "משטח בטון מזוין האופקי המהווה את הרצפה של הקומה שמעל ואת התקרה של הקומה שמתחת.",
    "קיר גבס": "מחיצה פנימית העשויה מלוחות גבס על שלד מתכת — קלה, מהירת התקנה, אינה נושאת.",
    "קיר נושא": "קיר בטון או בלוקים שנושא משקל מהמבנה שמעל — אסור לפרק או לשנות ללא אישור מהנדס.",
    "קיר חיצוני": "הקיר החיצוני של המבנה — בדרך כלל עשוי מבלוקים עם בידוד תרמי.",

    // ===== ELECTRICAL TERMS =====
    "לוח חשמל": "ארון המכיל את מפסקי החשמל הראשיים ומפסקי הזרם של הדירה. ממוקם בדרך כלל ליד הכניסה.",
    "נקודת חשמל": "מיקום בקיר או בתקרה שאליו מגיעה חיווט חשמלי — שקע, מתג, נקודת תאורה.",
    "מפסק": "מתג חשמלי (בלוח או בקיר) המאפשר ניתוק או חיבור של מעגל חשמלי.",
    "שקע": "נקודת חיבור בקיר להתקני חשמל — שקע רגיל, שקע כוח (מזגן), שקע תקשורת.",
    "מפסק פחת": "מפסק בטיחות בלוח החשמל המנתק את הזרם כשמזהה זליגת זרם — מונע התחשמלות.",

    // ===== PLUMBING TERMS =====
    "ביוב": "מערכת הצנרת להובלת שפכים מהדירה למערכת הביוב העירונית.",
    "ניקוז": "מערכת להרחקת מי גשם מגג המבנה, מרפסות ושטחים חיצוניים.",
    "צנרת": "מערכת הצינורות המובילה מים (חמים וקרים), גז, או שפכים בתוך המבנה.",
    "שוחה": "בור בדיקה/גישה במערכת הביוב או הניקוז — מאפשר תחזוקה וניקוי.",

    // ===== PLANNING & STANDARDS =====
    "תב\"ע": "תוכנית בניין עיר — מסמך תכנוני המגדיר את ייעוד הקרקע, זכויות הבנייה, גובה מבנים, וצפיפות בנייה באזור מסוים.",
    "היתר בנייה": "אישור רשמי מהוועדה המקומית לתכנון ובנייה המתיר לבצע עבודות בנייה על פי תוכניות מאושרות.",
    "תקן ישראלי": "מסמך טכני המגדיר דרישות מינימום לחומרים, מוצרים, או ביצוע עבודות בנייה בישראל (ת\"י).",
    "קנה מידה": "היחס בין מידה בשרטוט למידה בפועל. למשל 1:50 פירושו שכל 1 מ\"מ בשרטוט = 50 מ\"מ (5 ס\"מ) במציאות.",
    "גוש כותרת": "תיבת מידע בפינת התוכנית הכוללת: שם הפרויקט, מספר תוכנית, קנה מידה, תאריך, שם המתכנן.",
    "שינויי דיירים": "שינויים שהרוכש מבקש לבצע בדירה לפני או במהלך הבנייה — שינוי מחיצות, נקודות חשמל, גימורים.",
};

/**
 * LangChain tool: house_glossary
 *
 * Looks up a real estate or construction term in the glossary and returns
 * a simple Hebrew explanation.
 */
export const houseGlossary = tool(
    ({ term }) => {
        console.log(`${color256(183)}[house_glossary]${LogColors.RESET} INPUT: term="${term}"`);

        const termLower = term.toLowerCase();
        const results: { term: string; explanation: string }[] = [];

        // Exact match first
        for (const [key, value] of Object.entries(glossary)) {
            if (key === term || key.toLowerCase() === termLower) {
                results.push({ term: key, explanation: value });
            }
        }

        // Fuzzy match — term appears in key or key appears in term
        if (results.length === 0) {
            for (const [key, value] of Object.entries(glossary)) {
                const keyLower = key.toLowerCase();
                if (keyLower.includes(termLower) || termLower.includes(keyLower)) {
                    results.push({ term: key, explanation: value });
                }
            }
        }

        // Broader search — check if any word from the term appears in keys
        if (results.length === 0) {
            const words = termLower.split(/\s+/).filter(w => w.length > 1);
            for (const [key, value] of Object.entries(glossary)) {
                const keyLower = key.toLowerCase();
                if (words.some(w => keyLower.includes(w))) {
                    results.push({ term: key, explanation: value });
                }
            }
        }

        if (results.length === 0) {
            console.log(`${color256(183)}[house_glossary]${LogColors.RESET} OUTPUT: not found`);
            return JSON.stringify({
                found: false,
                message: `המונח "${term}" לא נמצא במילון. נסה מונח אחר או שאל שאלה ספציפית.`,
                availableCategories: ["משפטי/נדל\"ן", "אדריכלות", "קונסטרוקציה", "חשמל", "אינסטלציה", "תכנון ותקנים"],
            });
        }

        console.log(`${color256(183)}[house_glossary]${LogColors.RESET} OUTPUT: found ${results.length} match(es)`);
        return JSON.stringify({
            found: true,
            count: results.length,
            entries: results,
        });
    },
    {
        name: "house_glossary",
        description:
            "Look up a real estate or construction term in the Hebrew glossary. Returns a simple explanation of professional terminology found in house contracts and construction diagrams. Covers legal terms (הסכם מכר, טאבו, ערבות), architectural terms (חתך, מפלס, קנה מידה), electrical terms (לוח חשמל, מפסק), plumbing terms (ביוב, ניקוז), and planning standards (תב\"ע, היתר בנייה).",
        schema: z.object({
            term: z.string().describe("The term to look up in Hebrew — e.g., 'ערבות', 'קונסטרוקציה', 'היטל השבחה', 'קנה מידה'"),
        }),
    }
);
