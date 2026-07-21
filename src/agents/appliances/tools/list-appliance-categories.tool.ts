import { tool } from 'langchain';
import { z } from 'zod';
import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(27)}[list_appliance_categories]${LogColors.RESET}`;

const CATEGORIES: { key: string; hebrew: string; examples: string }[] = [
    { key: 'refrigerator', hebrew: 'מקרר', examples: 'מקרר מקפיא תחתון, סייד-ביי-סייד, נו-פרוסט' },
    { key: 'oven', hebrew: 'תנור אפייה', examples: 'תנור בנוי, משולב, פירוליטי' },
    { key: 'microwave', hebrew: 'מיקרוגל', examples: 'מיקרוגל סולו, גריל, משולב' },
    { key: 'washing_machine', hebrew: 'מכונת כביסה', examples: 'פתח חזית, פתח עליון' },
    { key: 'dryer', hebrew: 'מייבש כביסה', examples: 'מסנן קונדנסר, משאבת חום' },
    { key: 'dishwasher', hebrew: 'מדיח כלים', examples: 'רחב 60 ס"מ, צר 45 ס"מ' },
    { key: 'cooktop', hebrew: 'כיריים', examples: 'גז, אינדוקציה, קרמיות' },
    { key: 'air_conditioner', hebrew: 'מזגן', examples: 'עילי, מיני מרכזי, אינוורטר' },
];

export const listApplianceCategories = tool(
    () => {
        console.log(`${TAG} INPUT: (no args)`);
        console.log(`${TAG} OUTPUT: ${CATEGORIES.length} categories`);
        return JSON.stringify({ count: CATEGORIES.length, categories: CATEGORIES });
    },
    {
        name: 'list_appliance_categories',
        description:
            'List the supported home-appliance categories this agent can compare (refrigerator, oven, microwave, washing machine, dryer, dishwasher, cooktop, air conditioner). Use this to disambiguate which appliance the user means. Returns each category with its Hebrew name and examples.',
        schema: z.object({}),
    }
);
