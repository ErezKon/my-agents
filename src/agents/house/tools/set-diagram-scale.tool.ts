/**
 * ============================================================================
 * SET DIAGRAM SCALE TOOL — Configure Drawing Scale for Measurements
 * ============================================================================
 *
 * A LangChain tool that sets the drawing scale used for converting between
 * on-paper measurements (in millimeters) and real-world measurements (in
 * meters). This is a prerequisite for the `measure_on_diagram` tool.
 *
 * CONSTRUCTION DRAWING SCALES:
 * Architectural and construction drawings use standardized scales:
 * - **1:50** — Most common for floor plans. 1mm on paper = 50mm in reality.
 * - **1:100** — Used for site plans and larger layouts.
 * - **1:20** — Detail drawings (bathrooms, kitchens, sections).
 * - **1:200** — Site plans, building overviews.
 * - **1:500** — City-level plans, large sites.
 *
 * HOW IT WORKS:
 * The scale is stored as an in-memory module-level variable. When the agent
 * identifies the scale from a diagram's title block (e.g., "קנה מידה 1:50"),
 * it calls this tool to set it. Subsequent calls to `measure_on_diagram`
 * will use this scale for pixel-to-real-world conversion.
 *
 * The scale persists within the current session but resets on process restart.
 * The agent should re-identify and set the scale for each new diagram page.
 *
 * FORMULA CHAIN:
 * pixels → millimeters: mm = px × 25.4 / dpi
 * millimeters → real-world: real_mm = paper_mm × scale
 * real_mm → meters: m = real_mm / 1000
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import { LogColors, color256 } from '../../../utils/log-colors.util';

// Module-level state for the current diagram scale
let currentScale: number = 50; // Default 1:50
let currentScaleLabel: string = "1:50";

/**
 * Returns the currently set scale ratio.
 * Used by measure_on_diagram tool.
 */
export function getCurrentScale(): { ratio: number; label: string } {
    return { ratio: currentScale, label: currentScaleLabel };
}

/**
 * LangChain tool: set_diagram_scale
 *
 * Sets the drawing scale for subsequent measurement calculations.
 */
export const setDiagramScale = tool(
    ({ scale }) => {
        console.log(`${color256(118)}[set_diagram_scale]${LogColors.RESET} INPUT: scale="1:${scale}"`);

        if (scale <= 0) {
            return JSON.stringify({
                success: false,
                error: "Scale must be a positive number. Common values: 20, 50, 100, 200.",
            });
        }

        currentScale = scale;
        currentScaleLabel = `1:${scale}`;

        console.log(`${color256(118)}[set_diagram_scale]${LogColors.RESET} OUTPUT: scale set to ${currentScaleLabel}`);
        return JSON.stringify({
            success: true,
            scale: currentScaleLabel,
            ratio: currentScale,
            explanation: `Scale set to ${currentScaleLabel}. This means 1mm on the drawing = ${scale}mm in reality (${scale / 1000}m).`,
            commonScales: {
                "1:20": "Detail drawings — 1mm = 20mm (0.02m)",
                "1:50": "Floor plans — 1mm = 50mm (0.05m)",
                "1:100": "Site plans — 1mm = 100mm (0.1m)",
                "1:200": "Building overviews — 1mm = 200mm (0.2m)",
            },
        });
    },
    {
        name: "set_diagram_scale",
        description:
            "Set the drawing scale for construction diagram measurements. The scale is typically found in the title block of the diagram (e.g., 'קנה מידה 1:50'). Pass the denominator: for 1:50 pass 50, for 1:100 pass 100. This must be called before measure_on_diagram.",
        schema: z.object({
            scale: z.number().describe("Scale denominator — for 1:50 pass 50, for 1:100 pass 100, etc."),
        }),
    }
);
