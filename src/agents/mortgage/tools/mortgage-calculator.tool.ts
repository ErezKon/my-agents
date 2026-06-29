/**
 * ============================================================================
 * MORTGAGE CALCULATOR TOOL — Payment & Amortization Calculator
 * ============================================================================
 *
 * A LangChain tool that calculates mortgage payments for one or more tracks
 * (components). Supports two repayment methods:
 *
 *   - **Spitzer (שפיצר)**: Fixed monthly payment throughout the loan term.
 *     Early payments are mostly interest; later payments are mostly principal.
 *
 *   - **Equal Principal (קרן שווה)**: Fixed principal portion each month,
 *     with decreasing interest. Monthly payments decrease over time.
 *
 * For CPI-linked tracks (צמודה למדד), the calculator adds an assumed annual
 * CPI rate (default 2%) to the interest rate for effective calculation.
 *
 * Returns per-track and combined totals including:
 *   - Monthly payment (first month for equal principal)
 *   - Total interest paid over the loan term
 *   - Total payment (principal + interest)
 *   - Sparse amortization schedule (first 12 months + yearly snapshots)
 *
 * CRITICAL: The agent must ALWAYS use this tool for payment calculations
 * and never estimate or round numbers manually.
 * ============================================================================
 */
import { tool } from "langchain";
import { z } from "zod";
import { LogColors, color256 } from '../../../utils/log-colors.util';

const TAG = `${color256(75)}[mortgage_calculator]${LogColors.RESET}`;

interface TrackInput {
    principal: number;
    annualRatePct: number;
    years: number;
    type: "spitzer" | "equal_principal";
    linkedToCPI?: boolean;
    assumedCpiPct?: number;
}

interface AmortizationRow {
    month: number;
    principal: number;
    interest: number;
    balance: number;
}

interface TrackResult {
    principal: number;
    annualRatePct: number;
    years: number;
    type: string;
    linkedToCPI: boolean;
    assumedCpiPct: number;
    monthlyPayment: number;
    totalInterest: number;
    totalPayment: number;
    amortization: AmortizationRow[];
}

function calculateSpitzer(principal: number, annualRate: number, months: number): { monthlyPayment: number; schedule: AmortizationRow[] } {
    const monthlyRate = annualRate / 12;
    const schedule: AmortizationRow[] = [];

    if (monthlyRate === 0) {
        const monthlyPayment = principal / months;
        let balance = principal;
        for (let m = 1; m <= months; m++) {
            balance -= monthlyPayment;
            schedule.push({ month: m, principal: monthlyPayment, interest: 0, balance: Math.max(0, balance) });
        }
        return { monthlyPayment, schedule };
    }

    const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    let balance = principal;

    for (let m = 1; m <= months; m++) {
        const interestPart = balance * monthlyRate;
        const principalPart = monthlyPayment - interestPart;
        balance -= principalPart;
        schedule.push({
            month: m,
            principal: Math.round(principalPart * 100) / 100,
            interest: Math.round(interestPart * 100) / 100,
            balance: Math.max(0, Math.round(balance * 100) / 100),
        });
    }

    return { monthlyPayment: Math.round(monthlyPayment * 100) / 100, schedule };
}

function calculateEqualPrincipal(principal: number, annualRate: number, months: number): { monthlyPaymentFirst: number; monthlyPaymentLast: number; schedule: AmortizationRow[] } {
    const monthlyRate = annualRate / 12;
    const principalPerMonth = principal / months;
    const schedule: AmortizationRow[] = [];
    let balance = principal;

    for (let m = 1; m <= months; m++) {
        const interestPart = balance * monthlyRate;
        balance -= principalPerMonth;
        schedule.push({
            month: m,
            principal: Math.round(principalPerMonth * 100) / 100,
            interest: Math.round(interestPart * 100) / 100,
            balance: Math.max(0, Math.round(balance * 100) / 100),
        });
    }

    return {
        monthlyPaymentFirst: Math.round((principalPerMonth + principal * monthlyRate) * 100) / 100,
        monthlyPaymentLast: Math.round((principalPerMonth + (principal / months) * monthlyRate) * 100) / 100,
        schedule,
    };
}

function sparseAmortization(schedule: AmortizationRow[]): AmortizationRow[] {
    // Return: first 12 months, then every 12th month, plus last month
    const sparse: AmortizationRow[] = [];
    const seen = new Set<number>();

    for (let i = 0; i < Math.min(12, schedule.length); i++) {
        sparse.push(schedule[i]);
        seen.add(i);
    }

    for (let i = 11; i < schedule.length; i += 12) {
        if (!seen.has(i)) {
            sparse.push(schedule[i]);
            seen.add(i);
        }
    }

    const lastIdx = schedule.length - 1;
    if (!seen.has(lastIdx) && lastIdx >= 0) {
        sparse.push(schedule[lastIdx]);
    }

    return sparse;
}

export const mortgageCalculator = tool(
    ({ tracks }) => {
        console.log(`${TAG} INPUT: ${tracks.length} track(s)`);

        const results: TrackResult[] = [];
        let grandTotalPayment = 0;
        let grandTotalInterest = 0;
        let grandMonthlyFirst = 0;

        for (const track of tracks) {
            const months = track.years * 12;
            const annualRate = track.annualRatePct / 100;
            const cpiRate = track.linkedToCPI ? (track.assumedCpiPct ?? 2) / 100 : 0;
            // For CPI-linked, we add assumed CPI to the annual rate for effective calculation
            const effectiveAnnualRate = annualRate + cpiRate;

            let monthlyPayment: number;
            let totalInterest: number;
            let totalPayment: number;
            let schedule: AmortizationRow[];

            if (track.type === "spitzer") {
                const calc = calculateSpitzer(track.principal, effectiveAnnualRate, months);
                monthlyPayment = calc.monthlyPayment;
                totalPayment = monthlyPayment * months;
                totalInterest = totalPayment - track.principal;
                schedule = calc.schedule;
            } else {
                const calc = calculateEqualPrincipal(track.principal, effectiveAnnualRate, months);
                monthlyPayment = calc.monthlyPaymentFirst;
                totalPayment = calc.schedule.reduce((sum, row) => sum + row.principal + row.interest, 0);
                totalInterest = totalPayment - track.principal;
                schedule = calc.schedule;
            }

            grandTotalPayment += totalPayment;
            grandTotalInterest += totalInterest;
            grandMonthlyFirst += monthlyPayment;

            results.push({
                principal: track.principal,
                annualRatePct: track.annualRatePct,
                years: track.years,
                type: track.type,
                linkedToCPI: track.linkedToCPI ?? false,
                assumedCpiPct: track.linkedToCPI ? (track.assumedCpiPct ?? 2) : 0,
                monthlyPayment: Math.round(monthlyPayment * 100) / 100,
                totalInterest: Math.round(totalInterest * 100) / 100,
                totalPayment: Math.round(totalPayment * 100) / 100,
                amortization: sparseAmortization(schedule),
            });
        }

        const output = {
            trackCount: results.length,
            tracks: results,
            totals: {
                totalPrincipal: results.reduce((s, t) => s + t.principal, 0),
                totalMonthlyPaymentFirst: Math.round(grandMonthlyFirst * 100) / 100,
                totalPayment: Math.round(grandTotalPayment * 100) / 100,
                totalInterest: Math.round(grandTotalInterest * 100) / 100,
            },
        };

        console.log(`${TAG} OUTPUT: ${results.length} tracks, totalMonthly=${output.totals.totalMonthlyPaymentFirst}, totalInterest=${output.totals.totalInterest}`);
        return JSON.stringify(output);
    },
    {
        name: "mortgage_calculator",
        description:
            "Calculate mortgage payments for one or more tracks/components. For each track, provide the principal amount, annual interest rate, years, and repayment type (spitzer or equal_principal). Optionally mark as CPI-linked with assumed annual CPI rate. Returns monthly payment, total interest, total payment, and a sparse amortization schedule for each track, plus combined totals. ALWAYS use this tool for payment calculations — never estimate manually.",
        schema: z.object({
            tracks: z
                .array(z.object({
                    principal: z.number().describe("Loan principal amount in NIS for this track"),
                    annualRatePct: z.number().describe("Annual interest rate as a percentage (e.g. 3.5 for 3.5%)"),
                    years: z.number().describe("Loan term in years for this track"),
                    type: z.enum(["spitzer", "equal_principal"]).describe("Repayment method: 'spitzer' (fixed monthly payment) or 'equal_principal' (fixed principal, decreasing payments)"),
                    linkedToCPI: z.boolean().optional().describe("Whether this track is linked to the Consumer Price Index (מדד)"),
                    assumedCpiPct: z.number().optional().describe("Assumed annual CPI increase percentage (default 2% if linkedToCPI is true)"),
                }))
                .describe("Array of mortgage tracks/components to calculate"),
        }),
    }
);
