import { tool } from 'langchain';
import { z } from 'zod';
import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(70)}[appliance_glossary]${LogColors.RESET}`;

const GLOSSARY: Record<string, { definition: string; simple: string }> = {
    'דירוג אנרגטי': {
        definition: 'סיווג צריכת החשמל של המכשיר לפי תקן, מ-A (החסכוני ביותר) ועד G. בישראל מופיע על תווית אנרגיה רשמית.',
        simple: 'כמה חשמל המכשיר צורך. A זה הכי חסכוני, ולכן זול יותר להפעלה.',
    },
    'נו-פרוסט': {
        definition: 'טכנולוגיית קירור (No Frost) המונעת הצטברות קרח במקפיא באמצעות אוויר מאולץ, ומבטלת את הצורך בהפשרה ידנית.',
        simple: 'מקרר שלא צריך להפשיר ידנית — לא נוצר בו קרח.',
    },
    'אינוורטר': {
        definition: 'מנוע/מדחס בעל מהירות משתנה המתאים את הספק הפעולה לעומס בפועל, חוסך חשמל ומפחית רעש ובלאי.',
        simple: 'טכנולוגיה שחוסכת חשמל ומפחיתה רעש כי המנוע עובד רק כמה שצריך.',
    },
    'פירוליטי': {
        definition: 'תנור עם מערכת ניקוי עצמי בחום גבוה (כ-500°C) ההופכת שאריות מזון לאפר שניתן לנגב בקלות.',
        simple: 'תנור שמנקה את עצמו על ידי שריפת הלכלוך בחום גבוה.',
    },
    'אינדוקציה': {
        definition: 'כיריים המחממות את כלי הבישול ישירות באמצעות שדה מגנטי, במקום לחמם את משטח הכיריים. יעילות אנרגטית גבוהה ובקרת חום מדויקת.',
        simple: 'כיריים שמחממות רק את הסיר עצמו — מהיר, בטוח וחסכוני.',
    },
    'משאבת חום': {
        definition: 'טכנולוגיית ייבוש (Heat Pump) הממחזרת אוויר חם וחוסכת חשמל משמעותית לעומת מייבש קונדנסר רגיל, אך מייבשת לאט יותר.',
        simple: 'מייבש כביסה חסכוני בחשמל, אבל לוקח קצת יותר זמן.',
    },
    'תפוקת קירור': {
        definition: 'במזגן — כמות החום שהמערכת מסוגלת לפנות בשעה, נמדדת ב-BTU/h. ככל שגבוהה יותר, כך מתאים לחלל גדול יותר.',
        simple: 'כמה חזק המזגן מקרר — מספר גבוה יותר מתאים לחדר גדול יותר.',
    },
    'סייד-ביי-סייד': {
        definition: 'מבנה מקרר עם שתי דלתות אנכיות צמודות — מקרר בצד אחד ומקפיא בצד השני.',
        simple: 'מקרר רחב עם שתי דלתות זו לצד זו.',
    },
};

export const applianceGlossary = tool(
    ({ term }) => {
        console.log(`${TAG} INPUT: term='${term}'`);
        const entry = GLOSSARY[term.trim()];
        if (entry) {
            console.log(`${TAG} OUTPUT: found definition for '${term}'`);
            return JSON.stringify({ term, found: true, ...entry });
        }
        const available = Object.keys(GLOSSARY);
        console.log(`${TAG} OUTPUT: term '${term}' not found`);
        return JSON.stringify({ term, found: false, availableTerms: available });
    },
    {
        name: 'appliance_glossary',
        description:
            'Look up a Hebrew appliance term and get a professional definition plus a simple explanation. Use it when presenting technical terms (e.g. \'דירוג אנרגטי\', \'נו-פרוסט\', \'אינוורטר\', \'אינדוקציה\', \'משאבת חום\').',
        schema: z.object({
            term: z.string().describe('The appliance term in Hebrew to look up'),
        }),
    }
);
