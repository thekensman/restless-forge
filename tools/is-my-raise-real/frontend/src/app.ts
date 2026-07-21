// @ts-nocheck — UI glue lifted verbatim from the former inline <script>;
// CPI table now imported from the shared data layer. Typed data, untyped
// DOM code (same posture as petdose/engine.ts).
import { CPI_ANNUAL, LATEST_CPI_YEAR, LATEST_CPI } from "../../../../data/cpi";

// CPI annual averages now live in the shared data layer (data/cpi.ts).
const CPI = CPI_ANNUAL;
const LATEST_YEAR = LATEST_CPI_YEAR;

// ═══ Populate year dropdowns ═══
function populateYears(id, defaultYear) {
  const sel = document.getElementById(id);
  for (let y = LATEST_YEAR; y >= 2000; y--) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === defaultYear) opt.selected = true;
    sel.appendChild(opt);
  }
}
populateYears('c-year', LATEST_YEAR);
populateYears('e-start-year', 2018);

// ═══ Tab switching ═══
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => { t.classList.remove('tab--active'); t.setAttribute('aria-selected', 'false'); });
    document.querySelectorAll('.panel').forEach(p => { p.classList.remove('panel--active'); p.hidden = true; });
    tab.classList.add('tab--active');
    tab.setAttribute('aria-selected', 'true');
    const panel = document.getElementById('panel-' + tab.dataset.tab);
    panel.classList.add('panel--active');
    panel.hidden = false;
  });
});

// ═══ Formatting ═══
const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const fmtPctAbs = (n) => n.toFixed(1) + '%';

// ═══ TAB 1: Raise Reality Check ═══
function calcCheck() {
  const oldSal = parseFloat(document.getElementById('c-old').value) || 0;
  const newSal = parseFloat(document.getElementById('c-new').value) || 0;
  const year = parseInt(document.getElementById('c-year').value);
  const inflation = CPI[year] ?? LATEST_CPI;

  const nominalPct = oldSal > 0 ? ((newSal - oldSal) / oldSal) * 100 : 0;
  const realPct = ((1 + nominalPct / 100) / (1 + inflation / 100) - 1) * 100;
  const inflationAdjustedOld = oldSal * (1 + inflation / 100);
  const realDollars = newSal - inflationAdjustedOld;

  const hero = document.getElementById('check-hero');
  hero.className = 'result-card result-card--hero';
  if (realPct > 0.1) hero.classList.add('verdict-positive');
  else if (realPct < -0.1) hero.classList.add('verdict-negative');
  else hero.classList.add('verdict-neutral');

  document.getElementById('res-real-raise').textContent = fmtPct(realPct);

  let note = '';
  if (realPct < -0.1) note = `Your ${fmtPctAbs(nominalPct)} raise is a pay cut. Inflation was ${fmtPctAbs(inflation)}.`;
  else if (realPct < 0.1) note = `Your raise exactly matched inflation. You stayed flat.`;
  else note = `A genuine raise. You gained purchasing power.`;
  document.getElementById('res-raise-note').textContent = note;

  document.getElementById('res-nominal').textContent = fmtPct(nominalPct);
  document.getElementById('res-inflation').textContent = fmtPctAbs(inflation);
  document.getElementById('res-real-dollars').textContent = fmt(realDollars);

  // Bar visual
  const bar = document.getElementById('raise-bar');
  const maxPct = Math.max(Math.abs(nominalPct), 1);
  const fillPct = Math.min(Math.abs(realPct) / maxPct * 100, 100);
  bar.style.width = Math.max(fillPct, 3) + '%';
  bar.className = 'gap-visual__fill ' + (realPct >= 0 ? 'gap-visual__fill--gain' : 'gap-visual__fill--loss');
  document.getElementById('raise-label-real').textContent = 'Real: ' + fmtPct(realPct);
  document.getElementById('raise-label-nominal').textContent = 'Nominal: ' + fmtPct(nominalPct);
}

// ═══ TAB 2: What Should I Ask For? ═══
function calcAsk() {
  const salary = parseFloat(document.getElementById('a-salary').value) || 0;
  const targetReal = parseFloat(document.getElementById('a-target').value) || 0;
  const inflSel = document.getElementById('a-inflation').value;
  const inflation = inflSel === 'auto' ? LATEST_CPI : parseFloat(inflSel);

  const nominalNeeded = (1 + targetReal / 100) * (1 + inflation / 100) - 1;
  const nominalPct = nominalNeeded * 100;
  const newSalary = salary * (1 + nominalNeeded);
  const flatSalary = salary * (1 + inflation / 100);
  const flatPct = inflation;
  const deltaVsFlat = newSalary - flatSalary;

  document.getElementById('res-ask-pct').textContent = fmtPctAbs(nominalPct) + ' raise';
  document.getElementById('res-ask-note').textContent = `${fmtPctAbs(inflation)} for inflation + ${fmtPctAbs(targetReal)} real growth`;
  document.getElementById('res-ask-salary').textContent = fmt(newSalary);
  document.getElementById('res-ask-minimum').textContent = fmtPctAbs(flatPct);
  document.getElementById('res-ask-delta').textContent = fmt(deltaVsFlat) + '/yr';

  // Script
  const script = `Based on the current inflation rate of ${fmtPctAbs(inflation)}, a raise below ${fmtPctAbs(inflation)} would be a reduction in my real compensation. To maintain my purchasing power and reflect my contributions, I'd like to discuss a ${fmtPctAbs(nominalPct)} adjustment, bringing my salary to ${fmt(newSalary)}. This accounts for ${fmtPctAbs(inflation)} to keep pace with cost of living, plus a ${fmtPctAbs(targetReal)} real increase for the value I've added this year.`;
  document.getElementById('res-script').textContent = script;
}

// ═══ TAB 3: Salary Erosion ═══
function calcErosion() {
  const startSalary = parseFloat(document.getElementById('e-start-salary').value) || 0;
  const startYear = parseInt(document.getElementById('e-start-year').value);
  const currentSalary = parseFloat(document.getElementById('e-current-salary').value) || 0;

  let shouldBe = startSalary;
  let totalGap = 0;
  let rows = '';

  rows += `<div class="erosion-row erosion-row--header"><span>Year</span><span>Should Be (CPI-adjusted)</span><span>Gap vs. Your Salary</span></div>`;

  for (let y = startYear; y <= LATEST_YEAR; y++) {
    if (y > startYear && CPI[y] !== undefined) {
      shouldBe *= (1 + CPI[y] / 100);
    }
    // We assume linear interpolation of salary from start to current
    const yearsTotal = LATEST_YEAR - startYear;
    const yearsIn = y - startYear;
    const interpolated = yearsTotal > 0 ? startSalary + (currentSalary - startSalary) * (yearsIn / yearsTotal) : currentSalary;
    const gap = interpolated - shouldBe;
    if (y > startYear) totalGap += gap;

    rows += `<div class="erosion-row"><span>${y}</span><span class="should-be">${fmt(shouldBe)}</span><span class="${gap >= 0 ? 'actual' : 'gap'}">${fmt(gap)}</span></div>`;
  }

  document.getElementById('erosion-table').innerHTML = rows +
    `<div class="erosion-total"><span>Cumulative gap over ${LATEST_YEAR - startYear} years</span><span class="${totalGap >= 0 ? 'actual' : 'gap'}">${fmt(totalGap)}</span></div>`;

  const currentGap = currentSalary - shouldBe;
  const hero = document.getElementById('erosion-hero');
  hero.className = 'result-card result-card--hero';

  if (currentGap >= 0) {
    hero.classList.add('verdict-positive');
    document.getElementById('res-erosion-total').textContent = fmt(currentGap) + '/yr ahead';
    document.getElementById('res-erosion-note').textContent = 'Your raises have outpaced inflation. Well done.';
  } else {
    hero.classList.add('verdict-negative');
    document.getElementById('res-erosion-total').textContent = fmt(Math.abs(currentGap)) + '/yr behind';
    document.getElementById('res-erosion-note').textContent = 'You earn this much less than you should, adjusted for inflation.';
  }

  document.getElementById('res-erosion-should').textContent = fmt(shouldBe);
  document.getElementById('res-erosion-gap-note').textContent = `To have the same purchasing power as ${fmt(startSalary)} in ${startYear}`;
}

// ═══ Event listeners ═══
['c-old', 'c-new', 'c-year'].forEach(id => document.getElementById(id).addEventListener('input', calcCheck));
['a-salary', 'a-target', 'a-inflation'].forEach(id => document.getElementById(id).addEventListener('input', calcAsk));
['e-start-salary', 'e-start-year', 'e-current-salary'].forEach(id => document.getElementById(id).addEventListener('input', calcErosion));

// Initial calculations
calcCheck();
calcAsk();
calcErosion();
