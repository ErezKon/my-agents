/**
 * ============================================================================
 * MORTGAGE GLOSSARY TOOL — Hebrew Mortgage Term Definitions
 * ============================================================================
 *
 * A LangChain tool that provides definitions and simple explanations for
 * Hebrew mortgage terminology. Contains 30+ terms covering:
 *   - Repayment methods (שפיצר, קרן שווה, בולט)
 *   - Interest types (פריים, קבועה, משתנה, צמודה)
 *   - Financial concepts (LTV, מימון, ריבית אפקטיבית)
 *   - Index and rate terms (מדד, הצמדה, ריבית נומינלית)
 *   - Fees and penalties (עמלת פירעון, עמלת היוון)
 *
 * Each term has both a technical definition and a layman-friendly
 * explanation in Hebrew. Supports fuzzy matching for partial term lookups.
 *
 * The agent uses this tool whenever introducing mortgage terminology to
 * ensure the user understands the concepts being discussed.
 * ============================================================================
 */
import { tool } from "langchain";
import { z } from "zod";
import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(81)}[mortgage_glossary]${LogColors.RESET}`;

const GLOSSARY: Record<string, { definition: string; simple: string }> = {
    "שפיצר": {
        definition: "שיטת החזר הלוואה בה ההחזר החודשי קבוע לאורך כל תקופת ההלוואה. בתחילת התקופה רוב ההחזר הוא ריבית, ולקראת הסוף רוב ההחזר הוא קרן.",
        simple: "כל חודש משלמים אותו סכום. בהתחלה רוב הכסף הולך לריבית, ולקראת הסוף רוב הכסף מחזיר את ההלוואה עצמה.",
    },
    "קרן שפיצר": {
        definition: "שיטת החזר הלוואה בה ההחזר החודשי קבוע לאורך כל תקופת ההלוואה. בתחילת התקופה רוב ההחזר הוא ריבית, ולקראת הסוף רוב ההחזר הוא קרן.",
        simple: "כל חודש משלמים אותו סכום. בהתחלה רוב הכסף הולך לריבית, ולקראת הסוף רוב הכסף מחזיר את ההלוואה עצמה.",
    },
    "קרן שווה": {
        definition: "שיטת החזר בה חלק הקרן בכל תשלום קבוע, אך הריבית יורדת עם הזמן. לכן ההחזר החודשי יורד לאורך זמן.",
        simple: "כל חודש מחזירים אותו חלק מההלוואה, אבל הריבית קטנה כי החוב קטן. אז התשלומים יורדים עם הזמן.",
    },
    "ריבית פריים": {
        definition: "ריבית בנק ישראל בתוספת 1.5%. זו ריבית משתנה שמשתנה בכל פעם שבנק ישראל משנה את הריבית.",
        simple: "ריבית שעולה ויורדת לפי מה שבנק ישראל מחליט. כשבנק ישראל מוריד ריבית — ההחזר שלך יורד, וכשמעלה — ההחזר עולה.",
    },
    "פריים": {
        definition: "ריבית בנק ישראל בתוספת 1.5%. זו ריבית משתנה שמשתנה בכל פעם שבנק ישראל משנה את הריבית.",
        simple: "ריבית שעולה ויורדת לפי מה שבנק ישראל מחליט. כשבנק ישראל מוריד ריבית — ההחזר שלך יורד, וכשמעלה — ההחזר עולה.",
    },
    "צמודה למדד": {
        definition: "הלוואה שהקרן שלה צמודה למדד המחירים לצרכן. אם המדד עולה, גם יתרת החוב עולה בהתאם.",
        simple: "ההלוואה גדלה כשהמחירים במשק עולים. אם יש אינפלציה גבוהה, תשלמו יותר.",
    },
    "קבועה לא צמודה": {
        definition: "הלוואה בריבית קבועה שאינה צמודה למדד המחירים. ההחזר החודשי קבוע ולא משתנה לאורך כל התקופה. נקראת גם קל\"צ.",
        simple: "ההחזר החודשי נשאר בדיוק אותו דבר מההתחלה ועד הסוף. הכי צפוי וסולידי.",
    },
    "קל\"צ": {
        definition: "קבועה לא צמודה — הלוואה בריבית קבועה שאינה צמודה למדד המחירים.",
        simple: "ראשי תיבות של 'קבועה לא צמודה'. ההחזר לא משתנה לעולם.",
    },
    "קבועה צמודה": {
        definition: "הלוואה בריבית קבועה הצמודה למדד המחירים לצרכן. הריבית עצמה לא משתנה, אך הקרן מתעדכנת לפי המדד. נקראת גם ק\"צ.",
        simple: "הריבית קבועה אבל ההלוואה גדלה כשיש אינפלציה. הריבית בדרך כלל נמוכה יותר מקל\"צ כי הבנק מוגן מאינפלציה.",
    },
    "ק\"צ": {
        definition: "קבועה צמודה למדד — הלוואה בריבית קבועה הצמודה למדד המחירים לצרכן.",
        simple: "ראשי תיבות של 'קבועה צמודה'. ריבית קבועה אבל ההלוואה גדלה עם אינפלציה.",
    },
    "משתנה כל 5": {
        definition: "הלוואה שהריבית שלה משתנה כל 5 שנים. בכל נקודת שינוי הבנק קובע ריבית חדשה לפי תנאי השוק.",
        simple: "כל 5 שנים הבנק קובע מחדש מה הריבית. יכול לעלות או לרדת.",
    },
    "מדד המחירים לצרכן": {
        definition: "מדד שמפרסמת הלשכה המרכזית לסטטיסטיקה ומודד את השינוי במחירי מוצרים ושירותים. משמש כבסיס להצמדת הלוואות.",
        simple: "מספר שמראה כמה המחירים עלו או ירדו. כשהוא עולה זה אומר שהמחירים עלו (אינפלציה).",
    },
    "מדד": {
        definition: "מדד המחירים לצרכן — מדד שמפרסמת הלשכה המרכזית לסטטיסטיקה ומודד את השינוי במחירי מוצרים ושירותים.",
        simple: "מספר שמראה כמה המחירים עלו או ירדו בארץ.",
    },
    "LTV": {
        definition: "Loan To Value — יחס המימון. היחס בין סכום המשכנתא לשווי הנכס. למשל LTV של 70% אומר שההלוואה היא 70% משווי הדירה.",
        simple: "כמה אחוז מהדירה אתה ממן עם משכנתא. ככל שיותר — יותר סיכון לבנק ויותר ריבית.",
    },
    "מימון": {
        definition: "יחס המימון (LTV) — היחס בין סכום המשכנתא לשווי הנכס.",
        simple: "כמה אחוז מהדירה ממומן דרך המשכנתא.",
    },
    "החזר חודשי": {
        definition: "הסכום הכולל שמשלמים לבנק כל חודש עבור המשכנתא, כולל קרן וריבית.",
        simple: "כמה כסף יוצא כל חודש מהחשבון לטובת המשכנתא.",
    },
    "עמלת פירעון מוקדם": {
        definition: "עמלה שהבנק גובה כשמחזירים חלק מההלוואה או את כולה לפני תום התקופה. מוגבלת בחוק.",
        simple: "קנס שמשלמים אם רוצים לסגור את המשכנתא מוקדם. יש חוק שמגביל כמה הבנק יכול לגבות.",
    },
    "יחס החזר": {
        definition: "היחס בין ההחזר החודשי הכולל להכנסה נטו של הלווה. בנקים בדרך כלל דורשים שיחס זה לא יעלה על 30%-40%.",
        simple: "כמה אחוז מהמשכורת הולך להחזר המשכנתא. הבנק לא ייתן לך לקחת משכנתא שההחזר שלה יותר מ-30%-40% מהמשכורת.",
    },
    "מסלול": {
        definition: "רכיב בודד במשכנתא. משכנתא מורכבת בדרך כלל ממספר מסלולים (רכיבים) עם ריביות ותנאים שונים.",
        simple: "חלק אחד מהמשכנתא. המשכנתא בדרך כלל מחולקת למספר חלקים, כל אחד עם ריבית אחרת.",
    },
    "רכיב": {
        definition: "מסלול בודד במשכנתא — חלק מההלוואה עם סוג ריבית ותנאים ספציפיים.",
        simple: "חלק אחד מהמשכנתא עם הריבית שלו.",
    },
    "בולט": {
        definition: "תקופה בתחילת המשכנתא שבה משלמים רק ריבית ולא מחזירים קרן. נקרא גם 'גרייס חלקי'.",
        simple: "תקופה שמשלמים רק ריבית בלי להחזיר מהחוב. התשלום נמוך יותר אבל החוב לא קטן.",
    },
    "גרייס": {
        definition: "תקופת חסד — תקופה בתחילת ההלוואה עם תנאי תשלום מקלים. גרייס מלא = לא משלמים כלום, גרייס חלקי = משלמים רק ריבית.",
        simple: "תקופה שלא צריך לשלם הכל (או בכלל). טוב להתחלה אבל בסוף משלמים יותר.",
    },
    "הצמדה": {
        definition: "מנגנון שבו הקרן של ההלוואה מתעדכנת לפי מדד מסוים (בדרך כלל מדד המחירים לצרכן).",
        simple: "ההלוואה 'קשורה' למדד המחירים. אם המחירים עולים, גם החוב עולה.",
    },
    "ריבית נומינלית": {
        definition: "הריבית כפי שהיא רשומה בחוזה, לפני התחשבות בהצמדה למדד או עמלות.",
        simple: "הריבית שכתובה בחוזה. לא כוללת את ההשפעה של אינפלציה.",
    },
    "ריבית אפקטיבית": {
        definition: "הריבית בפועל שמשלמים, לאחר התחשבות בעמלות, הצמדה, ואופן חישוב הריבית (ריבית דריבית).",
        simple: "כמה באמת משלמים כשמחשבים הכל — עמלות, הצמדה, הכל. זה המספר האמיתי.",
    },
    "ריבית משתנה": {
        definition: "ריבית שמשתנה במהלך תקופת ההלוואה בהתאם לתנאי השוק או לפרמטר מוגדר (כמו ריבית בנק ישראל).",
        simple: "ריבית שיכולה לעלות או לרדת עם הזמן. זול בהתחלה אבל יש סיכון שיעלה.",
    },
    "ריבית קבועה": {
        definition: "ריבית שלא משתנה לאורך כל תקופת ההלוואה. נותנת ודאות מלאה לגבי ההחזר.",
        simple: "ריבית שנשארת אותו דבר מהיום הראשון ועד הסוף. אתה יודע בדיוק כמה תשלם.",
    },
    "עמלת היוון": {
        definition: "עמלה שנגבית בפירעון מוקדם של מסלול בריבית קבועה, מחושבת לפי ההפרש בין הריבית בהסכם לריבית הנוכחית בשוק.",
        simple: "קנס על סגירה מוקדם של חלק בריבית קבועה. אם הריבית בשוק ירדה מאז שלקחת — הקנס גבוה יותר.",
    },
};

function fuzzySearch(term: string): string[] {
    const lower = term.toLowerCase();
    return Object.keys(GLOSSARY).filter(key =>
        key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())
    );
}

export const mortgageGlossary = tool(
    ({ term }) => {
        console.log(`${TAG} INPUT: term="${term}"`);

        const lower = term.toLowerCase();
        // Exact match
        const exactKey = Object.keys(GLOSSARY).find(k => k.toLowerCase() === lower);
        if (exactKey) {
            const entry = GLOSSARY[exactKey];
            console.log(`${TAG} OUTPUT: found exact match for "${exactKey}"`);
            return JSON.stringify({
                found: true,
                term: exactKey,
                definitionHebrew: entry.definition,
                simpleExplanationHebrew: entry.simple,
            });
        }

        // Fuzzy match
        const matches = fuzzySearch(term);
        if (matches.length > 0) {
            const bestMatch = matches[0];
            const entry = GLOSSARY[bestMatch];
            console.log(`${TAG} OUTPUT: fuzzy match "${bestMatch}" for "${term}"`);
            return JSON.stringify({
                found: true,
                fuzzyMatch: true,
                term: bestMatch,
                definitionHebrew: entry.definition,
                simpleExplanationHebrew: entry.simple,
                otherMatches: matches.slice(1),
            });
        }

        console.log(`${TAG} OUTPUT: not found "${term}"`);
        return JSON.stringify({
            found: false,
            term,
            availableTerms: Object.keys(GLOSSARY),
        });
    },
    {
        name: "mortgage_glossary",
        description:
            "Look up the definition and simple explanation of a Hebrew mortgage term. Returns both a technical definition and a layman-friendly explanation in Hebrew. Use this whenever introducing or explaining mortgage terminology to the user. Supports fuzzy matching.",
        schema: z.object({
            term: z
                .string()
                .describe("The mortgage term to look up, in Hebrew (e.g. 'שפיצר', 'פריים', 'צמודה למדד', 'LTV')"),
        }),
    }
);
