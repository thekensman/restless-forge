/**
 * What Is My Time Worth? — Frontend Application
 *
 * Wires DOM inputs to the calculation engine with live recalculation.
 */

import {
  calculateRealWage,
  calculateDecision,
  calculateFinancialContext,
  calculateQueueTotals,
  normalizeToMonthly,
  compareJobs,
  STATE_TAX_RATES,
  DECISION_PRESETS,
  FREQUENCY_LABELS,
  fmtCurrency,
  fmtPercent,
  fmtHoursMinutes,
  fmtNumber,
  type WageInputs,
  type WageResult,
  type DecisionInputs,
  type DecisionQueueItem,
  type Frequency,
  type JobInputs,
  type FinancialContextInputs,
} from "./engine";

// ─── Helpers ─────────────────────────────────────────────────

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el;
}

function numVal(id: string): number {
  return parseFloat(($(id) as HTMLInputElement).value) || 0;
}

function strVal(id: string): string {
  const el = $(id) as HTMLInputElement | HTMLSelectElement;
  return el.value;
}

function setText(id: string, text: string): void {
  $(id).textContent = text;
}

// ─── Module-level shared state ────────────────────────────────

let calculatedRealWage: number = 0;
let calculatedWageResult: WageResult | null = null;
let calculatedMonthlyDiscretionary: number = 0;
let decisionWageManuallyEdited: boolean = false;
let decisionQueue: DecisionQueueItem[] = [];

// ─── State Dropdowns ─────────────────────────────────────────

function populateStates(): void {
  const selects = document.querySelectorAll<HTMLSelectElement>(
    "#w-state, #ja-state, #jb-state"
  );
  selects.forEach((sel) => {
    STATE_TAX_RATES.forEach((state) => {
      const opt = document.createElement("option");
      opt.value = state.id;
      opt.textContent =
        state.rate > 0
          ? `${state.name} (${(state.rate * 100).toFixed(1)}%)`
          : state.name;
      if (state.id === "IL") opt.selected = true;
      sel.appendChild(opt);
    });
  });
  const jbState = document.getElementById("jb-state") as HTMLSelectElement;
  if (jbState) jbState.value = "TX";
}

// ─── Tab Switching ───────────────────────────────────────────

function initTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
  const panels = document.querySelectorAll<HTMLElement>(".panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      if (!target) return;

      tabs.forEach((t) => {
        t.classList.remove("tab--active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("tab--active");
      tab.setAttribute("aria-selected", "true");

      panels.forEach((p) => {
        p.hidden = true;
        p.classList.remove("panel--active");
      });
      const panel = $(`panel-${target}`);
      panel.hidden = false;
      panel.classList.add("panel--active");

      // Cross-tab state: push real wage to decision tab
      if (target === "decision" && !decisionWageManuallyEdited) {
        if (calculatedRealWage > 0) {
          ($(  "d-wage") as HTMLInputElement).value = calculatedRealWage.toFixed(2);
          updateDecisionWageHint();
        }
      }

      recalculate(target);
    });
  });
}

// ─── Preset Tiles ────────────────────────────────────────────

function renderPresets(): void {
  const regularPresets = DECISION_PRESETS.filter((p) => p.defaultFrequency !== "one-time");
  const bigPresets = DECISION_PRESETS.filter((p) => p.defaultFrequency === "one-time");

  const grid = $("preset-grid");
  grid.innerHTML =
    regularPresets.map((p) => `<button class="preset-tile" data-preset="${p.id}"><span class="preset-tile__icon">${p.icon}</span>${p.label}</button>`).join("") +
    `<div class="preset-group-label">Big Decisions</div>` +
    bigPresets.map((p) => `<button class="preset-tile preset-tile--big" data-preset="${p.id}"><span class="preset-tile__icon">${p.icon}</span>${p.label}</button>`).join("");

  grid.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-preset]");
    if (!btn) return;
    const preset = DECISION_PRESETS.find((p) => p.id === btn.dataset.preset);
    if (!preset) return;

    ($(  "d-hours") as HTMLInputElement).value = String(preset.hours);
    ($(  "d-cost") as HTMLInputElement).value = String(preset.cost);
    ($(  "d-task") as HTMLInputElement).value = preset.label;
    ($(  "d-enjoyment") as HTMLSelectElement).value = preset.defaultEnjoyment;
    ($(  "d-frequency") as HTMLSelectElement).value = preset.defaultFrequency;

    recalculate("decision");
  });
}

// ─── Decision Wage Hint ───────────────────────────────────────

function updateDecisionWageHint(): void {
  const hint = document.getElementById("d-wage-hint");
  if (!hint) return;
  if (calculatedRealWage > 0) {
    hint.textContent = "Auto-filled from Tab 1. Decisions use your real wage; Financial Reality below sets your discretionary budget.";
  } else {
    hint.textContent = "Auto-filled from Tab 1 if you've calculated there.";
  }
}

// ─── Tab 1: Real Wage ────────────────────────────────────────

function updateWage(): void {
  const stateId = strVal("w-state");
  const stateRate = STATE_TAX_RATES.find((s) => s.id === stateId)?.rate ?? 0;

  const inputs: WageInputs = {
    annualGrossSalary: numVal("w-salary"),
    filingStatus: strVal("w-filing") as "single" | "mfj",
    stateTaxRate: stateRate,
    dailyCommuteCost: numVal("w-commute-cost"),
    monthlyClothing: numVal("w-clothing"),
    dailyMealCost: numVal("w-meals"),
    monthlyChildcare: numVal("w-childcare"),
    monthlyOtherCosts: numVal("w-other-cost"),
    dailyCommuteMinutes: numVal("w-commute-time"),
    dailyGetReadyMinutes: numVal("w-ready-time"),
    dailyDecompressionMinutes: numVal("w-decomp-time"),
    weeklyUnpaidOvertime: numVal("w-overtime"),
    workDaysPerWeek: numVal("w-workdays") || 5,
    contractedHoursPerDay: numVal("w-hours-per-day") || 8,
    vacationDays: numVal("w-vacation"),
    holidays: numVal("w-holidays"),
    sickDays: numVal("w-sick"),
  };

  const r = calculateRealWage(inputs);
  calculatedWageResult = r;
  calculatedRealWage = r.realHourlyWage;

  // ── Progressive disclosure summary labels ──
  const dailyMoneyCost = inputs.dailyCommuteCost + inputs.dailyMealCost;
  const monthlyMoneyCost = (inputs.monthlyClothing + inputs.monthlyChildcare + inputs.monthlyOtherCosts) / 22;
  const totalDailyMoney = dailyMoneyCost + monthlyMoneyCost;
  const moneySummaryEl = document.getElementById("section-money-summary");
  if (moneySummaryEl) {
    moneySummaryEl.textContent = totalDailyMoney > 0
      ? `${fmtCurrency(totalDailyMoney, 0)}/day`
      : "";
  }

  const totalDailyMinutes = inputs.dailyCommuteMinutes + inputs.dailyGetReadyMinutes + inputs.dailyDecompressionMinutes;
  const timeSummaryEl = document.getElementById("section-time-summary");
  if (timeSummaryEl) {
    timeSummaryEl.textContent = totalDailyMinutes > 0
      ? `+${fmtHoursMinutes(totalDailyMinutes / 60)}/day`
      : "";
  }

  const scheduleSummaryEl = document.getElementById("section-schedule-summary");
  if (scheduleSummaryEl) {
    scheduleSummaryEl.textContent =
      `${inputs.workDaysPerWeek}d × ${inputs.contractedHoursPerDay || 8}h/wk · ${fmtNumber(r.workingDaysPerYear)} working days`;
  }

  // Auto-push updated wage to decision tab if not manually edited
  if (!decisionWageManuallyEdited) {
    if (calculatedRealWage > 0) {
      const dWageEl = document.getElementById("d-wage") as HTMLInputElement | null;
      if (dWageEl) dWageEl.value = calculatedRealWage.toFixed(2);
      updateDecisionWageHint();
    }
  }

  // ── Life Energy Converter ──
  updateEnergyConverter();

  // ── Hero ──
  setText("res-real-wage", fmtCurrency(r.realHourlyWage, 2));
  setText(
    "res-wage-gap-note",
    `vs. ${fmtCurrency(r.advertisedHourlyWage, 2)} advertised — you're losing ${fmtPercent(r.wageGapPercent)} to hidden costs`
  );

  // ── Gap bar ──
  const pct =
    r.advertisedHourlyWage > 0
      ? Math.min(100, (r.realHourlyWage / r.advertisedHourlyWage) * 100)
      : 0;
  ($("gap-bar-real") as HTMLElement).style.width = `${pct}%`;
  setText("gap-label-real", `Real: ${fmtCurrency(r.realHourlyWage, 2)}/hr`);
  setText("gap-label-adv", `Advertised: ${fmtCurrency(r.advertisedHourlyWage, 2)}/hr`);

  // ── Insights ──
  setText("res-commute-total", fmtCurrency(r.totalCommuteCostWithTime));
  setText("res-commute-hours", `${fmtNumber(r.commuteHoursPerYear)} hours of life energy`);
  setText("res-100-hours", fmtHoursMinutes(r.hoursPer100Dollars));
  setText("res-remote-boost", `+${fmtCurrency(r.remoteWageBoost, 2)}/hr`);

  // ── Breakdown ──
  setText("bd-gross", fmtCurrency(r.grossAnnual));
  setText("bd-fed", `-${fmtCurrency(r.federalTax)}`);
  setText("bd-state", `-${fmtCurrency(r.stateTax)}`);
  setText("bd-fica", `-${fmtCurrency(r.ficaTax)}`);
  setText("bd-tax-total", `-${fmtCurrency(r.totalTax)}`);
  setText("bd-takehome", fmtCurrency(r.annualTakeHome));
  setText("bd-commute", `-${fmtCurrency(r.annualCommuteCost)}/yr`);
  setText("bd-clothing", `-${fmtCurrency(r.annualClothingCost)}/yr`);
  setText("bd-meals", `-${fmtCurrency(r.annualMealCost)}/yr`);
  setText("bd-childcare", `-${fmtCurrency(r.annualChildcareCost)}/yr`);
  setText("bd-other", `-${fmtCurrency(r.annualOtherCost)}/yr`);
  setText("bd-costs-total", `-${fmtCurrency(r.totalAnnualWorkCosts)}`);
  setText("bd-actual", fmtCurrency(r.actualAnnualEarnings));
  setText("bd-contracted-hrs", `${fmtNumber(r.contractedHoursPerYear)} hrs`);
  setText("bd-commute-hrs", `+${fmtNumber(r.commuteHoursPerYear)} hrs`);
  setText("bd-ready-hrs", `+${fmtNumber(r.getReadyHoursPerYear)} hrs`);
  setText("bd-decomp-hrs", `+${fmtNumber(r.decompressionHoursPerYear)} hrs`);
  setText("bd-ot-hrs", `+${fmtNumber(r.overtimeHoursPerYear)} hrs`);
  setText("bd-total-hrs", `${fmtNumber(r.totalWorkHoursPerYear)} hrs`);
}

// ─── Life Energy Converter ────────────────────────────────────

function updateEnergyConverter(): void {
  const priceEl = document.getElementById("energy-price-input") as HTMLInputElement | null;
  const outputEl = document.getElementById("energy-hours-output");
  if (!priceEl || !outputEl) return;

  const price = parseFloat(priceEl.value) || 100;
  if (calculatedRealWage > 0) {
    outputEl.textContent = fmtHoursMinutes(price / calculatedRealWage);
  } else {
    outputEl.textContent = "—";
  }
}

function initEnergyConverter(): void {
  const priceEl = document.getElementById("energy-price-input");
  if (!priceEl) return;
  priceEl.addEventListener("input", updateEnergyConverter);
}

// ─── Tab 2: Decision ─────────────────────────────────────────

function updateFinancialReality(): void {
  const finContext: FinancialContextInputs = {
    monthlyRent: numVal("w-rent"),
    monthlyDebtPayments: numVal("w-debt"),
    monthlyInsurance: numVal("w-insurance"),
    monthlyUtilities: numVal("w-utilities"),
    monthlySubscriptions: numVal("w-subscriptions"),
    monthlyGroceries: numVal("w-groceries"),
    monthlySavings: numVal("w-savings"),
  };
  const hasFinancialContext = Object.values(finContext).some((v) => v > 0);
  const finResultEl = document.getElementById("financial-result");
  const stressCallout = document.getElementById("stress-callout");

  if (hasFinancialContext && calculatedWageResult && finResultEl) {
    const fin = calculateFinancialContext(calculatedWageResult, finContext);
    calculatedMonthlyDiscretionary = fin.monthlyAfterFixed;

    if (fin.monthlyAfterFixed > 0) {
      setText("res-discretionary-wage", fmtCurrency(fin.discretionaryHourlyWage, 2) + "/hr");
      setText("res-discretionary-budget", fmtCurrency(fin.monthlyAfterFixed) + "/mo");
      setText(
        "res-financial-context",
        `${fmtPercent(fin.discretionaryPercentOfReal)} of your real wage remains after obligations`
      );
    } else {
      setText("res-discretionary-wage", "—");
      setText("res-discretionary-budget", "—");
      setText(
        "res-financial-context",
        "Obligations currently exceed take-home. Your hourly wage is unchanged — knowing it matters more, not less."
      );
    }

    if (stressCallout) {
      stressCallout.style.display = "block";
      stressCallout.className = `financial-stress financial-stress--${fin.financialStressLevel}`;
      const statusEl = document.getElementById("stress-status");
      const msgEl = document.getElementById("stress-message");
      const stressMessages: Record<typeof fin.financialStressLevel, [string, string]> = {
        comfortable: ["✓ Comfortable", "You have flexibility. Real wage improvements become real choices."],
        stable:      ["◎ Stable", "Your obligations match your income. You're breaking even after bills."],
        stressed:    ["◎ Tight", "Obligations are close to take-home. Your real wage is your most powerful tool right now — knowing it helps prioritize."],
        critical:    ["→ Under pressure", "Obligations exceed current take-home. That doesn't lower your time's value — it raises the stakes of spending it well."],
      };
      const [status, msg] = stressMessages[fin.financialStressLevel];
      if (statusEl) statusEl.textContent = status;
      if (msgEl) msgEl.textContent = msg;
    }
    finResultEl.style.display = "block";
  } else {
    calculatedMonthlyDiscretionary = 0;
    if (finResultEl) finResultEl.style.display = "none";
    if (stressCallout) stressCallout.style.display = "none";
  }
}

function updateDecision(): void {
  // ── Financial Reality ──
  updateFinancialReality();

  // ── Single-item verdict ──
  const wage = numVal("d-wage");
  const heroEl = document.getElementById("decision-hero");
  const compBox = document.getElementById("decision-comparison-box");

  if (wage <= 0) {
    if (heroEl) {
      heroEl.className = "result-card result-card--hero";
      setText("res-verdict", "Enter your wage");
      setText("res-verdict-savings", "");
    }
    if (compBox) compBox.style.display = "none";
  } else {
    const inputs: DecisionInputs = {
      realHourlyWage: wage,
      taskDescription: strVal("d-task"),
      hoursToComplete: numVal("d-hours"),
      costToHire: numVal("d-cost"),
      enjoyment: strVal("d-enjoyment") as DecisionInputs["enjoyment"],
    };

    const r = calculateDecision(inputs);
    if (heroEl) {
      heroEl.className = "result-card result-card--hero";
      if (r.verdict === "hire") {
        setText("res-verdict", "Hire someone");
        heroEl.classList.add("verdict-hire");
      } else {
        setText("res-verdict", "Do it yourself");
        heroEl.classList.add("verdict-diy");
      }
      setText("res-verdict-savings", `You save ${fmtCurrency(r.savings, 2)} by ${r.verdict === "hire" ? "hiring" : "doing it yourself"}`);
    }
    if (compBox) compBox.style.display = "";
    setText("res-diy-time-cost", fmtCurrency(r.diyTimeCost, 2));
    setText("res-diy-multiplier", `×${r.enjoymentMultiplier}`);
    setText("res-diy-adjusted", fmtCurrency(r.adjustedTimeCost, 2));
    setText("res-hire-cost", fmtCurrency(r.hireCost, 2));
    setText("res-hire-time-saved", fmtHoursMinutes(inputs.hoursToComplete));
    setText("res-hire-total", fmtCurrency(r.hireCost, 2));
    setText("res-explanation", r.explanation);
  }

  // ── Queue ──
  renderQueueTable();
  renderQueueTotals();
}

function addToQueue(): void {
  const wage = numVal("d-wage");
  if (wage <= 0) return;

  const inputs: DecisionInputs = {
    realHourlyWage: wage,
    taskDescription: strVal("d-task") || "Task",
    hoursToComplete: numVal("d-hours"),
    costToHire: numVal("d-cost"),
    enjoyment: strVal("d-enjoyment") as DecisionInputs["enjoyment"],
  };
  const frequency = strVal("d-frequency") as Frequency;
  const result = calculateDecision(inputs);

  decisionQueue.push({ id: Date.now().toString(), inputs, frequency, result });

  // Reset form to defaults
  ($(  "d-task") as HTMLInputElement).value = "";
  ($(  "d-hours") as HTMLInputElement).value = "2";
  ($(  "d-cost") as HTMLInputElement).value = "75";
  ($(  "d-frequency") as HTMLSelectElement).value = "monthly";
  ($(  "d-enjoyment") as HTMLSelectElement).value = "neutral";

  updateDecision();
}

function renderQueueTable(): void {
  const section = document.getElementById("decision-queue-section");
  const tbody = document.getElementById("queue-tbody");
  if (!section || !tbody) return;

  if (decisionQueue.length === 0) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";

  tbody.innerHTML = decisionQueue.map((item) => {
    const { inputs, frequency, result } = item;
    const monthlyCost = normalizeToMonthly(inputs.costToHire, frequency);
    const monthlyAdj = normalizeToMonthly(result.adjustedTimeCost, frequency);
    const enjoymentLabels: Record<DecisionInputs["enjoyment"], string> = {
      avoid: "😩 Avoid", dislike: "😕 Dislike", neutral: "😐 Neutral", enjoy: "😊 Enjoy", love: "😍 Love",
    };
    const costCell = monthlyCost !== null
      ? fmtCurrency(monthlyCost) + "<small>/mo</small>"
      : fmtCurrency(inputs.costToHire);
    const adjCell = monthlyAdj !== null
      ? fmtCurrency(monthlyAdj) + "<small>/mo</small>"
      : fmtCurrency(result.adjustedTimeCost);

    return `<tr class="queue-row queue-row--${result.verdict}">
      <td class="queue-row__task">${inputs.taskDescription}</td>
      <td>${FREQUENCY_LABELS[frequency]}</td>
      <td>${inputs.hoursToComplete}h</td>
      <td>${enjoymentLabels[inputs.enjoyment]}</td>
      <td><span class="verdict-badge verdict-badge--${result.verdict}">${result.verdict === "hire" ? "Hire" : "DIY"}</span></td>
      <td>${adjCell}</td>
      <td>${costCell}</td>
      <td><button class="queue-remove" data-id="${item.id}" aria-label="Remove">✕</button></td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll<HTMLButtonElement>(".queue-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      decisionQueue = decisionQueue.filter((item) => item.id !== btn.dataset.id);
      updateDecision();
    });
  });
}

function renderQueueTotals(): void {
  if (decisionQueue.length === 0) return;

  const totals = calculateQueueTotals(decisionQueue);
  const hasMonthly = decisionQueue.some((i) => i.frequency !== "one-time");
  const hasOneTime = decisionQueue.some((i) => i.frequency === "one-time");

  const monthlySection = document.getElementById("queue-totals-monthly");
  if (monthlySection) monthlySection.style.display = hasMonthly ? "block" : "none";

  if (hasMonthly) {
    setText("qt-hire-all-cost", fmtCurrency(totals.monthly.hireAllCost) + "/mo");
    setText("qt-hire-all-hours", fmtHoursMinutes(totals.monthly.hireAllHours) + " freed");
    setText("qt-verdict-cost", fmtCurrency(totals.monthly.verdictCost) + "/mo");
    setText("qt-verdict-hours", fmtHoursMinutes(totals.monthly.verdictHours) + " freed");

    const remainingRow = document.getElementById("qt-remaining-row");
    if (remainingRow) {
      if (calculatedMonthlyDiscretionary > 0) {
        const remaining = calculatedMonthlyDiscretionary - totals.monthly.verdictCost;
        const remEl = document.getElementById("qt-remaining");
        if (remaining >= 0) {
          setText("qt-remaining", fmtCurrency(remaining) + "/mo");
          if (remEl) remEl.className = "qt-remaining--positive";
        } else {
          setText("qt-remaining", "Hiring costs exceed your discretionary budget");
          if (remEl) remEl.className = "qt-remaining--over-budget";
        }
        remainingRow.style.display = "";
      } else {
        remainingRow.style.display = "none";
      }
    }
  }

  const oneTimeSection = document.getElementById("queue-totals-one-time");
  if (oneTimeSection) oneTimeSection.style.display = hasOneTime ? "block" : "none";

  if (hasOneTime) {
    setText("qt-ot-hire-all", fmtCurrency(totals.oneTime.hireAllCost));
    setText("qt-ot-hire-all-hours", fmtHoursMinutes(totals.oneTime.hireAllHours) + " freed");
    setText("qt-ot-verdict", fmtCurrency(totals.oneTime.verdictCost));
    setText("qt-ot-verdict-hours", fmtHoursMinutes(totals.oneTime.verdictHours) + " freed");
  }
}

function initAddToQueue(): void {
  const btn = document.getElementById("add-to-queue-btn");
  if (!btn) return;
  btn.addEventListener("click", addToQueue);
}

// ─── Tab 3: Compare ──────────────────────────────────────────

function readJobInputs(prefix: string): JobInputs {
  const stateId = strVal(`${prefix}-state`);
  const stateRate = STATE_TAX_RATES.find((s) => s.id === stateId)?.rate ?? 0;
  return {
    label: strVal(`${prefix}-label`),
    annualSalary: numVal(`${prefix}-salary`),
    stateTaxRate: stateRate,
    dailyCommuteCost: numVal(`${prefix}-commute-cost`),
    dailyCommuteMinutes: numVal(`${prefix}-commute-time`),
    monthlyClothing: numVal(`${prefix}-clothing`),
    dailyMealCost: numVal(`${prefix}-meals`),
    monthlyChildcare: numVal(`${prefix}-childcare`),
    monthlyOtherCosts: numVal(`${prefix}-other`),
    dailyGetReadyMinutes: numVal(`${prefix}-ready`),
    dailyDecompressionMinutes: numVal(`${prefix}-decomp`),
    weeklyUnpaidOvertime: numVal(`${prefix}-overtime`),
    workDaysPerWeek: numVal(`${prefix}-workdays`) || 5,
    contractedHoursPerDay: numVal(`${prefix}-hours-per-day`) || 8,
    vacationDays: numVal(`${prefix}-vacation`),
    holidays: numVal(`${prefix}-holidays`),
    sickDays: numVal(`${prefix}-sick`),
  };
}

function updateCompare(): void {
  const jobA = readJobInputs("ja");
  const jobB = readJobInputs("jb");
  const r = compareJobs(jobA, jobB);

  setText("ct-label-a", jobA.label || "Job A");
  setText("ct-label-b", jobB.label || "Job B");

  const heroEl = $("compare-hero");
  heroEl.className = "result-card result-card--hero";

  if (r.winner === "tie") {
    setText("res-compare-winner", "It's a tie");
    setText("res-compare-note", "Both jobs pay roughly the same per hour of life energy");
  } else {
    const winnerJob = r.winner === "a" ? jobA : jobB;
    const loserJob = r.winner === "a" ? jobB : jobA;
    const salaryDiff = loserJob.annualSalary - winnerJob.annualSalary;

    setText("res-compare-winner", winnerJob.label || (r.winner === "a" ? "Job A" : "Job B"));
    if (salaryDiff > 0) {
      setText(
        "res-compare-note",
        `Pays ${fmtCurrency(Math.abs(r.wageDifference), 2)} more per hour of life energy despite a ${fmtCurrency(salaryDiff)} lower salary`
      );
    } else {
      setText("res-compare-note", `Pays ${fmtCurrency(Math.abs(r.wageDifference), 2)} more per hour of life energy`);
    }
    heroEl.classList.add("verdict-hire");
  }

  setText("ct-salary-a", fmtCurrency(r.jobA.grossAnnual));
  setText("ct-salary-b", fmtCurrency(r.jobB.grossAnnual));
  setText("ct-takehome-a", fmtCurrency(r.jobA.annualTakeHome));
  setText("ct-takehome-b", fmtCurrency(r.jobB.annualTakeHome));
  setText("ct-costs-a", `-${fmtCurrency(r.jobA.totalAnnualWorkCosts)}`);
  setText("ct-costs-b", `-${fmtCurrency(r.jobB.totalAnnualWorkCosts)}`);
  setText("ct-actual-a", fmtCurrency(r.jobA.actualAnnualEarnings));
  setText("ct-actual-b", fmtCurrency(r.jobB.actualAnnualEarnings));
  setText("ct-hours-a", fmtNumber(r.jobA.totalWorkHoursPerYear));
  setText("ct-hours-b", fmtNumber(r.jobB.totalWorkHoursPerYear));
  setText("ct-wage-a", fmtCurrency(r.jobA.realHourlyWage, 2));
  setText("ct-wage-b", fmtCurrency(r.jobB.realHourlyWage, 2));

  const highlightRow = document.querySelector(".compare-table__row--highlight");
  if (highlightRow) {
    highlightRow.classList.remove("winner-a", "winner-b");
    if (r.winner === "a") highlightRow.classList.add("winner-a");
    if (r.winner === "b") highlightRow.classList.add("winner-b");
  }

  if (r.winner !== "tie") {
    const winResult = r.winner === "a" ? r.jobA : r.jobB;
    const loseResult = r.winner === "a" ? r.jobB : r.jobA;
    const hoursSaved = loseResult.totalWorkHoursPerYear - winResult.totalWorkHoursPerYear;
    if (hoursSaved > 0) {
      setText(
        "res-compare-insight",
        `The winning job gives you back ${fmtNumber(hoursSaved)} hours per year. That's ${fmtNumber(hoursSaved / 8)} full days you get to live instead of work or commute.`
      );
    } else {
      setText(
        "res-compare-insight",
        `The winning job earns ${fmtCurrency(Math.abs(r.annualEarningsDifference))} more in actual take-home after all hidden costs.`
      );
    }
  } else {
    setText("res-compare-insight", "These jobs are functionally equivalent in terms of real hourly compensation.");
  }
}

// ─── Tab 3: Copy from Job A ───────────────────────────────────

function initCopyFromA(): void {
  const btn = document.getElementById("copy-from-a");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const fields = [
      "salary", "state", "commute-cost", "commute-time",
      "clothing", "meals", "childcare", "other",
      "ready", "decomp", "overtime", "workdays", "hours-per-day",
      "vacation", "holidays", "sick",
    ];

    fields.forEach((field) => {
      const aEl = document.getElementById(`ja-${field}`) as HTMLInputElement | HTMLSelectElement | null;
      const bEl = document.getElementById(`jb-${field}`) as HTMLInputElement | HTMLSelectElement | null;
      if (aEl && bEl) bEl.value = aEl.value;
    });

    recalculate("compare");
  });
}

// ─── Tab 3: Scroll-to-results button ─────────────────────────

function initScrollButton(): void {
  const btn = document.getElementById("scroll-to-results-btn");
  const results = document.getElementById("compare-results");
  if (!btn || !results) return;

  btn.addEventListener("click", () => {
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function update(): void {
    const rect = results!.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
    const isCompareActive = document.querySelector(".tab--active")?.getAttribute("data-tab") === "compare";
    (btn as HTMLButtonElement).hidden = !isCompareActive || isVisible;
  }

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });

  // Re-run when tabs switch
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) =>
    t.addEventListener("click", () => setTimeout(update, 50))
  );
}

// ─── Dispatcher ──────────────────────────────────────────────

function recalculate(tab?: string): void {
  const active =
    tab ||
    document.querySelector<HTMLButtonElement>(".tab--active")?.dataset.tab ||
    "wage";

  switch (active) {
    case "wage":
      updateWage();
      break;
    case "decision":
      updateDecision();
      break;
    case "compare":
      updateCompare();
      break;
  }
}

// ─── Event Binding ───────────────────────────────────────────

function initInputListeners(): void {
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    "[data-calc]"
  ).forEach((el) => {
    const events = el.tagName === "SELECT" ? ["change"] : ["input", "change"];
    events.forEach((evt) => {
      el.addEventListener(evt, () => {
        if (el.id === "d-wage") decisionWageManuallyEdited = true;
        recalculate(el.dataset.calc as string);
      });
    });
  });
}

// ─── Breakdown: open by default on desktop ────────────────────

function initBreakdown(): void {
  const bd = document.getElementById("breakdown-section") as HTMLDetailsElement | null;
  if (!bd) return;
  if (window.innerWidth >= 769) bd.open = true;
}

// ─── Init ────────────────────────────────────────────────────

function init(): void {
  populateStates();
  initTabs();
  renderPresets();
  initInputListeners();
  initEnergyConverter();
  initCopyFromA();
  initScrollButton();
  initBreakdown();
  initAddToQueue();
  recalculate("wage");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
