/**
 * What Is My Time Worth? — Calculation Engine
 *
 * Pure functions with zero DOM dependencies.
 * All monetary values in USD. All time in the units specified.
 */

// ─── Types ───────────────────────────────────────────────────

export interface WageInputs {
  annualGrossSalary: number;
  filingStatus: "single" | "mfj";
  stateTaxRate: number;

  // Hidden money costs
  dailyCommuteCost: number;
  monthlyClothing: number;
  dailyMealCost: number;
  monthlyChildcare: number;
  monthlyOtherCosts: number;

  // Hidden time costs
  dailyCommuteMinutes: number;
  dailyGetReadyMinutes: number;
  dailyDecompressionMinutes: number;
  weeklyUnpaidOvertime: number;
  workDaysPerWeek: number;
  contractedHoursPerDay: number;
  vacationDays: number;
  holidays: number;
  sickDays: number;
}

export interface WageResult {
  // Income
  grossAnnual: number;
  federalTax: number;
  stateTax: number;
  ficaTax: number;
  totalTax: number;
  annualTakeHome: number;

  // Work costs
  annualCommuteCost: number;
  annualClothingCost: number;
  annualMealCost: number;
  annualChildcareCost: number;
  annualOtherCost: number;
  totalAnnualWorkCosts: number;
  actualAnnualEarnings: number;

  // Time
  workingDaysPerYear: number;
  contractedHoursPerYear: number;
  commuteHoursPerYear: number;
  getReadyHoursPerYear: number;
  decompressionHoursPerYear: number;
  overtimeHoursPerYear: number;
  totalWorkHoursPerYear: number;

  // The results
  realHourlyWage: number;
  advertisedHourlyWage: number;
  wageGapDollars: number;
  wageGapPercent: number;

  // Insights
  totalCommuteCostWithTime: number;
  hoursPer100Dollars: number;
  remoteWageBoost: number;
}

export interface DecisionInputs {
  realHourlyWage: number;
  taskDescription: string;
  hoursToComplete: number;
  costToHire: number;
  enjoyment: "avoid" | "dislike" | "neutral" | "enjoy" | "love";
}

export interface DecisionResult {
  diyTimeCost: number;
  enjoymentMultiplier: number;
  adjustedTimeCost: number;
  hireCost: number;
  netDifference: number;
  verdict: "hire" | "diy";
  savings: number;
  isCloseCull: boolean;
  explanation: string;
}

export interface JobInputs {
  label: string;
  annualSalary: number;
  stateTaxRate: number;
  dailyCommuteCost: number;
  dailyCommuteMinutes: number;
  monthlyClothing: number;
  dailyMealCost: number;
  monthlyChildcare: number;
  monthlyOtherCosts: number;
  dailyGetReadyMinutes: number;
  dailyDecompressionMinutes: number;
  weeklyUnpaidOvertime: number;
  workDaysPerWeek: number;
  contractedHoursPerDay: number;
  vacationDays: number;
  holidays: number;
  sickDays: number;
}

export interface JobComparisonResult {
  jobA: WageResult;
  jobB: WageResult;
  winner: "a" | "b" | "tie";
  wageDifference: number;
  annualEarningsDifference: number;
  hoursDifference: number;
  daysDifference: number;
}

// ─── Tax Constants ───────────────────────────────────────────

const SS_WAGE_BASE = 176_100;

const FEDERAL_BRACKETS_SINGLE: { limit: number; rate: number }[] = [
  { limit: 11_600, rate: 0.10 },
  { limit: 47_150, rate: 0.12 },
  { limit: 100_525, rate: 0.22 },
  { limit: 191_950, rate: 0.24 },
  { limit: 243_725, rate: 0.32 },
  { limit: 609_350, rate: 0.35 },
  { limit: Infinity, rate: 0.37 },
];

const FEDERAL_BRACKETS_MFJ: { limit: number; rate: number }[] = [
  { limit: 23_200, rate: 0.10 },
  { limit: 94_300, rate: 0.12 },
  { limit: 201_050, rate: 0.22 },
  { limit: 383_900, rate: 0.24 },
  { limit: 487_450, rate: 0.32 },
  { limit: 731_200, rate: 0.35 },
  { limit: Infinity, rate: 0.37 },
];

const STANDARD_DEDUCTION_SINGLE = 14_600;
const STANDARD_DEDUCTION_MFJ = 29_200;

// ─── Tax Calculations ────────────────────────────────────────

export function calcFederalIncomeTax(
  grossIncome: number,
  filingStatus: "single" | "mfj"
): number {
  const brackets =
    filingStatus === "mfj" ? FEDERAL_BRACKETS_MFJ : FEDERAL_BRACKETS_SINGLE;
  const deduction =
    filingStatus === "mfj" ? STANDARD_DEDUCTION_MFJ : STANDARD_DEDUCTION_SINGLE;

  const taxableIncome = Math.max(0, grossIncome - deduction);

  let tax = 0;
  let remaining = taxableIncome;
  let prevLimit = 0;

  for (const bracket of brackets) {
    const bracketWidth = bracket.limit - prevLimit;
    const taxableInBracket = Math.min(remaining, bracketWidth);
    tax += taxableInBracket * bracket.rate;
    remaining -= taxableInBracket;
    prevLimit = bracket.limit;
    if (remaining <= 0) break;
  }

  return Math.round(tax * 100) / 100;
}

export function calcStateTax(grossIncome: number, rate: number): number {
  if (rate <= 0 || grossIncome <= 0) return 0;
  return Math.round(grossIncome * rate * 100) / 100;
}

export function calcFICA(grossIncome: number): number {
  if (grossIncome <= 0) return 0;

  // Social Security: 6.2% up to wage base
  const ssIncome = Math.min(grossIncome, SS_WAGE_BASE);
  const ssTax = ssIncome * 0.062;

  // Medicare: 1.45% on all income + additional 0.9% above $200k
  let medicareTax = grossIncome * 0.0145;
  if (grossIncome > 200_000) {
    medicareTax += (grossIncome - 200_000) * 0.009;
  }

  return Math.round((ssTax + medicareTax) * 100) / 100;
}

// ─── Real Hourly Wage Calculator ─────────────────────────────

export function calculateRealWage(inputs: WageInputs): WageResult {
  const {
    annualGrossSalary,
    filingStatus,
    stateTaxRate,
    dailyCommuteCost,
    monthlyClothing,
    dailyMealCost,
    monthlyChildcare,
    monthlyOtherCosts,
    dailyCommuteMinutes,
    dailyGetReadyMinutes,
    dailyDecompressionMinutes,
    weeklyUnpaidOvertime,
    workDaysPerWeek,
    contractedHoursPerDay: rawContractedHoursPerDay,
    vacationDays,
    holidays,
    sickDays,
  } = inputs;

  const contractedHoursPerDay = rawContractedHoursPerDay || 8;

  // Step 1: Annual take-home pay
  const grossAnnual = annualGrossSalary;
  const federalTax = calcFederalIncomeTax(grossAnnual, filingStatus);
  const stateTax = calcStateTax(grossAnnual, stateTaxRate);
  const ficaTax = calcFICA(grossAnnual);
  const totalTax = federalTax + stateTax + ficaTax;
  const annualTakeHome = grossAnnual - totalTax;

  // Step 2: Work-related money costs
  const totalWeeksPerYear = 52;
  const totalPotentialWorkDays = totalWeeksPerYear * workDaysPerWeek;
  const workingDaysPerYear = Math.max(
    0,
    totalPotentialWorkDays - vacationDays - holidays - sickDays
  );

  const annualCommuteCost = dailyCommuteCost * workingDaysPerYear;
  const annualClothingCost = monthlyClothing * 12;
  const annualMealCost = dailyMealCost * workingDaysPerYear;
  const annualChildcareCost = monthlyChildcare * 12;
  const annualOtherCost = monthlyOtherCosts * 12;

  const totalAnnualWorkCosts =
    annualCommuteCost +
    annualClothingCost +
    annualMealCost +
    annualChildcareCost +
    annualOtherCost;

  const actualAnnualEarnings = annualTakeHome - totalAnnualWorkCosts;

  // Step 3: Total work-related hours
  const workingWeeksPerYear =
    workDaysPerWeek > 0 ? workingDaysPerYear / workDaysPerWeek : 0;

  const contractedHoursPerYear = contractedHoursPerDay * workingDaysPerYear;
  const commuteHoursPerYear = (dailyCommuteMinutes / 60) * workingDaysPerYear;
  const getReadyHoursPerYear = (dailyGetReadyMinutes / 60) * workingDaysPerYear;
  const decompressionHoursPerYear =
    (dailyDecompressionMinutes / 60) * workingDaysPerYear;
  const overtimeHoursPerYear = weeklyUnpaidOvertime * workingWeeksPerYear;

  const totalWorkHoursPerYear =
    contractedHoursPerYear +
    commuteHoursPerYear +
    getReadyHoursPerYear +
    decompressionHoursPerYear +
    overtimeHoursPerYear;

  // Step 4: Real hourly wage
  const realHourlyWage =
    totalWorkHoursPerYear > 0
      ? actualAnnualEarnings / totalWorkHoursPerYear
      : 0;

  // Step 5: Advertised hourly wage (based on user's contracted schedule)
  const scheduledHoursPerWeek = contractedHoursPerDay * workDaysPerWeek;
  const advertisedHourlyWage =
    scheduledHoursPerWeek > 0 ? grossAnnual / (scheduledHoursPerWeek * 52) : 0;

  // Step 6: Gap
  const wageGapDollars = advertisedHourlyWage - realHourlyWage;
  const wageGapPercent =
    advertisedHourlyWage > 0 ? wageGapDollars / advertisedHourlyWage : 0;

  // Insights
  const totalCommuteCostWithTime =
    annualCommuteCost + commuteHoursPerYear * Math.max(0, realHourlyWage);

  const hoursPer100Dollars =
    realHourlyWage > 0 ? 100 / realHourlyWage : Infinity;

  // Remote wage boost: recalculate without commute
  const remoteEarnings = actualAnnualEarnings + annualCommuteCost;
  const remoteHours = totalWorkHoursPerYear - commuteHoursPerYear;
  const remoteWage = remoteHours > 0 ? remoteEarnings / remoteHours : 0;
  const remoteWageBoost = remoteWage - realHourlyWage;

  return {
    grossAnnual,
    federalTax,
    stateTax,
    ficaTax,
    totalTax,
    annualTakeHome,
    annualCommuteCost,
    annualClothingCost,
    annualMealCost,
    annualChildcareCost,
    annualOtherCost,
    totalAnnualWorkCosts,
    actualAnnualEarnings,
    workingDaysPerYear,
    contractedHoursPerYear,
    commuteHoursPerYear,
    getReadyHoursPerYear,
    decompressionHoursPerYear,
    overtimeHoursPerYear,
    totalWorkHoursPerYear,
    realHourlyWage,
    advertisedHourlyWage,
    wageGapDollars,
    wageGapPercent,
    totalCommuteCostWithTime,
    hoursPer100Dollars,
    remoteWageBoost,
  };
}

// ─── Decision Calculator ─────────────────────────────────────

const ENJOYMENT_MULTIPLIERS: Record<DecisionInputs["enjoyment"], number> = {
  avoid: 1.5,
  dislike: 1.2,
  neutral: 1.0,
  enjoy: 0.7,
  love: 0.3,
};

export function calculateDecision(inputs: DecisionInputs): DecisionResult {
  const { realHourlyWage, hoursToComplete, costToHire, enjoyment } = inputs;

  const diyTimeCost = hoursToComplete * realHourlyWage;
  const enjoymentMultiplier = ENJOYMENT_MULTIPLIERS[enjoyment];
  const adjustedTimeCost = diyTimeCost * enjoymentMultiplier;
  const hireCost = costToHire;
  const netDifference = adjustedTimeCost - hireCost;

  const isCloseCull = Math.abs(netDifference) < adjustedTimeCost * 0.15;

  let verdict: "hire" | "diy";
  let savings: number;
  let explanation: string;

  if (netDifference > 0) {
    verdict = "hire";
    savings = netDifference;
    if (isCloseCull) {
      explanation = `Close call — hiring costs $${hireCost.toFixed(0)} but frees ${hoursToComplete} hour${hoursToComplete !== 1 ? "s" : ""}. Since you ${enjoyment === "avoid" ? "prefer to avoid" : enjoyment === "dislike" ? "dislike" : "feel neutral about"} this task, hiring is the better choice.`;
    } else {
      explanation = `Hiring saves you $${savings.toFixed(0)} in life-energy value. You get ${hoursToComplete} hour${hoursToComplete !== 1 ? "s" : ""} of your life back.`;
    }
  } else {
    verdict = "diy";
    savings = Math.abs(netDifference);
    if (isCloseCull) {
      explanation = `Close call — DIY saves only $${savings.toFixed(0)}, but costs ${hoursToComplete} hour${hoursToComplete !== 1 ? "s" : ""} of your time.${enjoyment === "enjoy" || enjoyment === "love" ? " Since you enjoy it, DIY wins." : ""}`;
    } else {
      explanation = `DIY saves you $${savings.toFixed(0)}. ${enjoyment === "enjoy" || enjoyment === "love" ? "Plus, you enjoy doing it — bonus." : `It costs ${hoursToComplete} hour${hoursToComplete !== 1 ? "s" : ""} of your time.`}`;
    }
  }

  return {
    diyTimeCost,
    enjoymentMultiplier,
    adjustedTimeCost,
    hireCost,
    netDifference,
    verdict,
    savings,
    isCloseCull,
    explanation,
  };
}

// ─── Job Comparison ──────────────────────────────────────────

export function compareJobs(
  jobA: JobInputs,
  jobB: JobInputs,
  filingStatus: "single" | "mfj" = "single"
): JobComparisonResult {
  const toWageInputs = (job: JobInputs): WageInputs => ({
    annualGrossSalary: job.annualSalary,
    filingStatus,
    stateTaxRate: job.stateTaxRate,
    dailyCommuteCost: job.dailyCommuteCost,
    monthlyClothing: job.monthlyClothing,
    dailyMealCost: job.dailyMealCost,
    monthlyChildcare: job.monthlyChildcare,
    monthlyOtherCosts: job.monthlyOtherCosts,
    dailyCommuteMinutes: job.dailyCommuteMinutes,
    dailyGetReadyMinutes: job.dailyGetReadyMinutes,
    dailyDecompressionMinutes: job.dailyDecompressionMinutes,
    weeklyUnpaidOvertime: job.weeklyUnpaidOvertime,
    workDaysPerWeek: job.workDaysPerWeek || 5,
    contractedHoursPerDay: job.contractedHoursPerDay || 8,
    vacationDays: job.vacationDays,
    holidays: job.holidays,
    sickDays: job.sickDays,
  });

  const resultA = calculateRealWage(toWageInputs(jobA));
  const resultB = calculateRealWage(toWageInputs(jobB));

  const wageDiff = Math.abs(resultA.realHourlyWage - resultB.realHourlyWage);
  let winner: "a" | "b" | "tie";
  if (wageDiff < 0.5) {
    winner = "tie";
  } else {
    winner = resultA.realHourlyWage > resultB.realHourlyWage ? "a" : "b";
  }

  const hoursDifference = Math.abs(
    resultA.totalWorkHoursPerYear - resultB.totalWorkHoursPerYear
  );

  return {
    jobA: resultA,
    jobB: resultB,
    winner,
    wageDifference: resultA.realHourlyWage - resultB.realHourlyWage,
    annualEarningsDifference:
      resultA.actualAnnualEarnings - resultB.actualAnnualEarnings,
    hoursDifference,
    daysDifference: hoursDifference / 8,
  };
}

// ─── Financial Context ───────────────────────────────────────

export interface FinancialContextInputs {
  monthlyRent: number;
  monthlyDebtPayments: number;
  monthlyInsurance: number;
  monthlyUtilities: number;
  monthlySubscriptions: number;
  monthlyGroceries: number;
}

export interface FinancialContextResult {
  totalMonthlyObligations: number;
  annualFixedCosts: number;
  monthlyAfterFixed: number;
  annualAfterFixed: number;
  discretionaryHourlyWage: number;
  discretionaryPercentOfReal: number;
  financialStressLevel: "comfortable" | "stable" | "stressed" | "critical";
  monthsOfSavingsAtCurrentRate: number;
}

export function calculateFinancialContext(
  wageResult: WageResult,
  context: FinancialContextInputs
): FinancialContextResult {
  const totalMonthlyObligations =
    context.monthlyRent +
    context.monthlyDebtPayments +
    context.monthlyInsurance +
    context.monthlyUtilities +
    context.monthlySubscriptions +
    context.monthlyGroceries;

  const annualFixedCosts = totalMonthlyObligations * 12;
  const monthlyTakeHome = wageResult.actualAnnualEarnings / 12;
  const monthlyAfterFixed = monthlyTakeHome - totalMonthlyObligations;
  const annualAfterFixed = wageResult.actualAnnualEarnings - annualFixedCosts;

  const discretionaryHourlyWage =
    wageResult.totalWorkHoursPerYear > 0
      ? annualAfterFixed / wageResult.totalWorkHoursPerYear
      : 0;

  const discretionaryPercentOfReal =
    wageResult.realHourlyWage > 0
      ? discretionaryHourlyWage / wageResult.realHourlyWage
      : 0;

  let financialStressLevel: "comfortable" | "stable" | "stressed" | "critical";
  if (monthlyAfterFixed >= monthlyTakeHome * 0.3) {
    financialStressLevel = "comfortable";
  } else if (monthlyAfterFixed >= 0) {
    financialStressLevel = "stable";
  } else if (monthlyAfterFixed > -monthlyTakeHome * 0.1) {
    financialStressLevel = "stressed";
  } else {
    financialStressLevel = "critical";
  }

  const monthsOfSavingsAtCurrentRate =
    monthlyAfterFixed > 0 ? monthlyTakeHome / monthlyAfterFixed : 0;

  return {
    totalMonthlyObligations,
    annualFixedCosts,
    monthlyAfterFixed,
    annualAfterFixed,
    discretionaryHourlyWage,
    discretionaryPercentOfReal,
    financialStressLevel,
    monthsOfSavingsAtCurrentRate,
  };
}

// ─── Decision Presets ────────────────────────────────────────

export interface DecisionPreset {
  id: string;
  icon: string;
  label: string;
  hours: number;
  cost: number;
  defaultEnjoyment: DecisionInputs["enjoyment"];
}

export const DECISION_PRESETS: DecisionPreset[] = [
  { id: "mow", icon: "🌿", label: "Mow the lawn", hours: 1.5, cost: 50, defaultEnjoyment: "dislike" },
  { id: "clean", icon: "🏠", label: "Clean the house", hours: 3, cost: 120, defaultEnjoyment: "dislike" },
  { id: "cook", icon: "🍳", label: "Cook vs. order", hours: 1.5, cost: 35, defaultEnjoyment: "neutral" },
  { id: "taxes", icon: "📋", label: "DIY taxes", hours: 8, cost: 250, defaultEnjoyment: "avoid" },
  { id: "oil", icon: "🚗", label: "Oil change", hours: 1, cost: 45, defaultEnjoyment: "neutral" },
  { id: "grocery", icon: "🛒", label: "Grocery pickup", hours: 1, cost: 5, defaultEnjoyment: "neutral" },
  { id: "laundry", icon: "👔", label: "Laundry service", hours: 2, cost: 30, defaultEnjoyment: "dislike" },
  { id: "carwash", icon: "🚿", label: "Hand car wash", hours: 1, cost: 25, defaultEnjoyment: "neutral" },
  { id: "dogwalk", icon: "🐕", label: "Dog walker", hours: 0.75, cost: 20, defaultEnjoyment: "enjoy" },
  { id: "assemble", icon: "🔧", label: "Furniture assembly", hours: 3, cost: 80, defaultEnjoyment: "avoid" },
  { id: "shovel", icon: "❄️", label: "Snow removal", hours: 1, cost: 40, defaultEnjoyment: "avoid" },
  { id: "tutor", icon: "📚", label: "Tutor your kid", hours: 2, cost: 60, defaultEnjoyment: "neutral" },
];

// ─── State Tax Rates ─────────────────────────────────────────

export const STATE_TAX_RATES: { id: string; name: string; rate: number }[] = [
  { id: "none", name: "No state tax", rate: 0 },
  { id: "AL", name: "Alabama", rate: 0.05 },
  { id: "AK", name: "Alaska", rate: 0 },
  { id: "AZ", name: "Arizona", rate: 0.025 },
  { id: "AR", name: "Arkansas", rate: 0.044 },
  { id: "CA", name: "California", rate: 0.093 },
  { id: "CO", name: "Colorado", rate: 0.044 },
  { id: "CT", name: "Connecticut", rate: 0.05 },
  { id: "DE", name: "Delaware", rate: 0.066 },
  { id: "FL", name: "Florida", rate: 0 },
  { id: "GA", name: "Georgia", rate: 0.055 },
  { id: "HI", name: "Hawaii", rate: 0.075 },
  { id: "ID", name: "Idaho", rate: 0.058 },
  { id: "IL", name: "Illinois", rate: 0.0495 },
  { id: "IN", name: "Indiana", rate: 0.0305 },
  { id: "IA", name: "Iowa", rate: 0.06 },
  { id: "KS", name: "Kansas", rate: 0.057 },
  { id: "KY", name: "Kentucky", rate: 0.04 },
  { id: "LA", name: "Louisiana", rate: 0.0425 },
  { id: "ME", name: "Maine", rate: 0.0715 },
  { id: "MD", name: "Maryland", rate: 0.0575 },
  { id: "MA", name: "Massachusetts", rate: 0.05 },
  { id: "MI", name: "Michigan", rate: 0.0425 },
  { id: "MN", name: "Minnesota", rate: 0.0785 },
  { id: "MS", name: "Mississippi", rate: 0.05 },
  { id: "MO", name: "Missouri", rate: 0.048 },
  { id: "MT", name: "Montana", rate: 0.059 },
  { id: "NE", name: "Nebraska", rate: 0.0584 },
  { id: "NV", name: "Nevada", rate: 0 },
  { id: "NH", name: "New Hampshire", rate: 0 },
  { id: "NJ", name: "New Jersey", rate: 0.0637 },
  { id: "NM", name: "New Mexico", rate: 0.049 },
  { id: "NY", name: "New York", rate: 0.0685 },
  { id: "NC", name: "North Carolina", rate: 0.045 },
  { id: "ND", name: "North Dakota", rate: 0.0195 },
  { id: "OH", name: "Ohio", rate: 0.035 },
  { id: "OK", name: "Oklahoma", rate: 0.0475 },
  { id: "OR", name: "Oregon", rate: 0.09 },
  { id: "PA", name: "Pennsylvania", rate: 0.0307 },
  { id: "RI", name: "Rhode Island", rate: 0.0599 },
  { id: "SC", name: "South Carolina", rate: 0.065 },
  { id: "SD", name: "South Dakota", rate: 0 },
  { id: "TN", name: "Tennessee", rate: 0 },
  { id: "TX", name: "Texas", rate: 0 },
  { id: "UT", name: "Utah", rate: 0.0465 },
  { id: "VT", name: "Vermont", rate: 0.066 },
  { id: "VA", name: "Virginia", rate: 0.0575 },
  { id: "WA", name: "Washington", rate: 0 },
  { id: "WV", name: "West Virginia", rate: 0.052 },
  { id: "WI", name: "Wisconsin", rate: 0.053 },
  { id: "WY", name: "Wyoming", rate: 0 },
];

// ─── Formatting Helpers ──────────────────────────────────────

export function fmtCurrency(value: number, decimals: number = 0): string {
  if (!isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function fmtPercent(value: number): string {
  if (!isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function fmtHoursMinutes(hours: number): string {
  if (!isFinite(hours) || hours < 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}hr${h !== 1 ? "s" : ""}`;
  return `${h}hr ${m}min`;
}

export function fmtNumber(value: number, decimals: number = 0): string {
  if (!isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
