/**
 * ============================================================================
 * MEASURE ON DIAGRAM TOOL — Distance & Area Calculator for Blueprints
 * ============================================================================
 *
 * A LangChain tool that calculates real-world distances and areas from
 * measurements taken on construction diagrams. Works in conjunction with
 * `set_diagram_scale` (which must be called first to establish the scale)
 * and `render_diagram_page` (which provides the visual image for the LLM
 * to identify measurement points).
 *
 * MEASUREMENT WORKFLOW:
 * 1. Agent renders a diagram page (render_diagram_page).
 * 2. Agent identifies the scale and sets it (set_diagram_scale).
 * 3. Agent identifies points on the image (e.g., corners of a room).
 * 4. Agent converts pixel distances to millimeters: mm = px × 25.4 / dpi.
 * 5. Agent calls THIS tool with the mm measurements.
 * 6. This tool applies the scale and returns real-world measurements.
 *
 * MODES:
 * - **distance**: Calculate distance between two points (input: mm on paper).
 *   Returns real-world distance in meters and centimeters.
 * - **area**: Calculate area of a rectangle (input: width_mm × height_mm).
 *   Returns real-world area in square meters.
 *
 * ACCURACY:
 * Visual measurements from rendered PDFs are approximate. The tool always
 * includes an uncertainty estimate based on typical rendering precision:
 * - Distance: ±5-10 cm
 * - Area: ±0.5-1.0 m²
 * ============================================================================
 */

import { tool } from "langchain";
import { z } from "zod";
import { LogColors, color256 } from '../../../utils/log-colors.util';
import { getCurrentScale } from './set-diagram-scale.tool';

/**
 * LangChain tool: measure_on_diagram
 *
 * Converts on-paper measurements (mm) to real-world dimensions using
 * the currently set diagram scale.
 */
export const measureOnDiagram = tool(
    ({ mode, measurement_mm, width_mm, height_mm }) => {
        const { ratio: scale, label: scaleLabel } = getCurrentScale();
        console.log(`${color256(82)}[measure_on_diagram]${LogColors.RESET} INPUT: mode="${mode}", scale=${scaleLabel}, measurement_mm=${measurement_mm}, width_mm=${width_mm}, height_mm=${height_mm}`);

        if (mode === "distance") {
            if (!measurement_mm || measurement_mm <= 0) {
                return JSON.stringify({
                    success: false,
                    error: "For distance mode, provide measurement_mm (positive number in millimeters on paper).",
                });
            }

            const realMm = measurement_mm * scale;
            const realM = realMm / 1000;
            const realCm = realMm / 10;

            console.log(`${color256(82)}[measure_on_diagram]${LogColors.RESET} OUTPUT: ${measurement_mm}mm on paper → ${realM.toFixed(2)}m real`);
            return JSON.stringify({
                success: true,
                mode: "distance",
                scale: scaleLabel,
                onPaper: { mm: measurement_mm },
                realWorld: {
                    mm: Math.round(realMm),
                    cm: Math.round(realCm * 10) / 10,
                    m: Math.round(realM * 100) / 100,
                },
                uncertainty: "±5-10 cm (visual measurement from rendered PDF)",
                formula: `${measurement_mm}mm × ${scale} = ${Math.round(realMm)}mm = ${realM.toFixed(2)}m`,
            });
        }

        if (mode === "area") {
            if (!width_mm || !height_mm || width_mm <= 0 || height_mm <= 0) {
                return JSON.stringify({
                    success: false,
                    error: "For area mode, provide both width_mm and height_mm (positive numbers in millimeters on paper).",
                });
            }

            const realWidthMm = width_mm * scale;
            const realHeightMm = height_mm * scale;
            const realWidthM = realWidthMm / 1000;
            const realHeightM = realHeightMm / 1000;
            const areaSqM = realWidthM * realHeightM;

            console.log(`${color256(82)}[measure_on_diagram]${LogColors.RESET} OUTPUT: ${width_mm}×${height_mm}mm on paper → ${areaSqM.toFixed(2)}m² real`);
            return JSON.stringify({
                success: true,
                mode: "area",
                scale: scaleLabel,
                onPaper: { width_mm, height_mm },
                realWorld: {
                    width_m: Math.round(realWidthM * 100) / 100,
                    height_m: Math.round(realHeightM * 100) / 100,
                    area_sqm: Math.round(areaSqM * 100) / 100,
                },
                uncertainty: "±0.5-1.0 m² (visual measurement from rendered PDF)",
                formula: `(${width_mm}mm × ${scale}) × (${height_mm}mm × ${scale}) = ${realWidthM.toFixed(2)}m × ${realHeightM.toFixed(2)}m = ${areaSqM.toFixed(2)}m²`,
            });
        }

        return JSON.stringify({
            success: false,
            error: `Unknown mode: "${mode}". Use "distance" or "area".`,
        });
    },
    {
        name: "measure_on_diagram",
        description:
            "Calculate real-world distances or areas from on-paper measurements (in mm) using the current diagram scale. Call set_diagram_scale first to set the scale. For distance: provide measurement_mm. For area: provide width_mm and height_mm. Convert pixels to mm first: mm = px × 25.4 / dpi.",
        schema: z.object({
            mode: z.enum(["distance", "area"]).describe("Measurement mode: 'distance' for point-to-point, 'area' for rectangular area"),
            measurement_mm: z.number().optional().describe("For distance mode: the measurement in millimeters on paper"),
            width_mm: z.number().optional().describe("For area mode: width in millimeters on paper"),
            height_mm: z.number().optional().describe("For area mode: height in millimeters on paper"),
        }),
    }
);
