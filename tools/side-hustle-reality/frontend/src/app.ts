// @ts-nocheck — UI glue lifted verbatim from the former inline <script>;
// tax + mileage constants now imported from the shared data layer. Typed
// data, untyped DOM code (same posture as petdose/engine.ts).
import { MILEAGE } from "../../../../data/mileage";
import { TAX } from "../../../../data/tax";

document.querySelectorAll('.tab').forEach(tab=>{tab.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(t=>{t.classList.remove('tab--active');t.setAttribute('aria-selected','false')});document.querySelectorAll('.panel').forEach(p=>{p.classList.remove('panel--active');p.hidden=true});tab.classList.add('tab--active');tab.setAttribute('aria-selected','true');const panel=document.getElementById('panel-'+tab.dataset.tab);panel.classList.add('panel--active');panel.hidden=false})});
const fmt=n=>n.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const fmt0=n=>n.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:0});

const IRS_MILE = MILEAGE.rate;          // shared data/mileage.ts
const SE_TAX = TAX.selfEmploymentRate;   // shared data/tax.ts

function calcGig(){
  const gross=+(document.getElementById('g-gross').value)||0;
  const hours=+(document.getElementById('g-hours').value)||0;
  const miles=+(document.getElementById('g-miles').value)||0;
  const gasPrice=+(document.getElementById('g-gas-price').value)||0;
  const mpg=+(document.getElementById('g-mpg').value)||1;
  const phone=+(document.getElementById('g-phone').value)||0;
  const other=+(document.getElementById('g-other').value)||0;

  const gasCost = (miles / mpg) * gasPrice;
  const deprecCost = miles * IRS_MILE - gasCost; // IRS rate includes gas, so depreciation = IRS total minus gas
  const depreciationOnly = Math.max(deprecCost, 0);
  const phoneWeekly = phone / 4.33;
  // SE tax applies to 92.35% of NET earnings (gross minus deductible expenses),
  // not gross — taxing gross overstated the bite for every driver.
  const seNetBase = Math.max(gross - gasCost - depreciationOnly - phoneWeekly - other, 0);
  const seTax = seNetBase * TAX.selfEmploymentNetFactor * SE_TAX;
  const totalCosts = gasCost + depreciationOnly + seTax + phoneWeekly + other;
  const netPay = gross - totalCosts;
  const trueRate = hours > 0 ? netPay / hours : 0;
  const appRate = hours > 0 ? gross / hours : 0;

  document.getElementById('res-gig-rate').textContent = fmt(trueRate) + '/hr';
  const hero = document.getElementById('gig-hero');
  hero.className = 'result-card result-card--hero';
  if(trueRate < 10) { hero.style.borderColor='var(--red)'; document.getElementById('res-gig-rate').style.color='var(--red)'; }
  else if(trueRate < 15) { hero.style.borderColor='var(--orange)'; document.getElementById('res-gig-rate').style.color='var(--orange)'; }
  else { hero.style.borderColor='var(--green)'; document.getElementById('res-gig-rate').style.color='var(--green)'; }

  const pctLoss = gross > 0 ? ((gross - netPay) / gross * 100) : 0;
  document.getElementById('res-gig-note').textContent = `The app shows ${fmt(appRate)}/hr. You lose ${pctLoss.toFixed(0)}% to costs.`;
  document.getElementById('res-gig-app-rate').textContent = fmt(appRate)+'/hr';
  document.getElementById('res-gig-gas').textContent = fmt(gasCost);
  document.getElementById('res-gig-deprec').textContent = fmt(depreciationOnly);

  // Bar
  const keepPct = gross > 0 ? (netPay / gross * 100) : 50;
  document.getElementById('gig-bar-keep').style.width = Math.max(keepPct, 0) + '%';
  document.getElementById('gig-bar-costs').style.width = Math.max(100 - keepPct, 0) + '%';
  document.getElementById('gig-label-keep').textContent = 'You keep: ' + fmt0(netPay);
  document.getElementById('gig-label-costs').textContent = 'Costs: ' + fmt0(totalCosts);

  document.getElementById('bd-g-gross').textContent = fmt(gross);
  document.getElementById('bd-g-gas').textContent = '-'+fmt(gasCost);
  document.getElementById('bd-g-deprec').textContent = '-'+fmt(depreciationOnly);
  document.getElementById('bd-g-se').textContent = '-'+fmt(seTax);
  document.getElementById('bd-g-phone').textContent = '-'+fmt(phoneWeekly);
  document.getElementById('bd-g-other').textContent = '-'+fmt(other);
  document.getElementById('bd-g-net').textContent = fmt(netPay);
  document.getElementById('bd-g-net').style.color = netPay >= 0 ? 'var(--green)' : 'var(--red)';
}

function calcCompare(){
  const gigRate=+(document.getElementById('c-gig-rate').value)||0;
  const gigHrs=+(document.getElementById('c-gig-hours').value)||0;
  const jobRate=+(document.getElementById('c-job-rate').value)||0;
  const jobHrs=+(document.getElementById('c-job-hours').value)||0;
  const health=+(document.getElementById('c-job-health').value)||0;
  const pto=+(document.getElementById('c-job-pto').value)||0;
  const match401k=+(document.getElementById('c-job-match').value)||0;

  const annualJobHrs = jobHrs * 52;
  const healthHourly = annualJobHrs > 0 ? (health * 12) / annualJobHrs : 0;
  const ficaHourly = jobRate * 0.0765; // Employer FICA match
  const matchHourly = annualJobHrs > 0 ? match401k / annualJobHrs : 0;
  const ptoHourly = annualJobHrs > 0 ? (pto * 8 * jobRate) / annualJobHrs : 0;
  const totalJobHourly = jobRate + healthHourly + ficaHourly + matchHourly + ptoHourly;
  const gap = totalJobHourly - gigRate;

  document.getElementById('res-cmp-gig').textContent = fmt(gigRate)+'/hr';
  document.getElementById('res-cmp-job').textContent = fmt(totalJobHourly)+'/hr';
  document.getElementById('res-cmp-gap').textContent = (gap >= 0 ? '+' : '') + fmt(gap);
  document.getElementById('res-cmp-gap').style.color = gap > 0 ? 'var(--green)' : 'var(--red)';

  const hero = document.getElementById('compare-hero');
  hero.className = 'result-card result-card--hero';
  if(gap > 1) {
    document.getElementById('res-cmp-verdict').textContent = 'Job wins by ' + fmt(gap)+'/hr';
    document.getElementById('res-cmp-verdict').style.color = 'var(--green)';
    document.getElementById('res-cmp-note').textContent = 'The job\'s total compensation exceeds your gig\'s true rate.';
  } else if(gap < -1) {
    document.getElementById('res-cmp-verdict').textContent = 'Gig wins by ' + fmt(Math.abs(gap))+'/hr';
    document.getElementById('res-cmp-verdict').style.color = 'var(--accent)';
    document.getElementById('res-cmp-note').textContent = 'Your gig pays more even after factoring in job benefits.';
  } else {
    document.getElementById('res-cmp-verdict').textContent = 'Roughly equal';
    document.getElementById('res-cmp-verdict').style.color = 'var(--orange)';
    document.getElementById('res-cmp-note').textContent = 'Factor in flexibility, stability, and what matters to you.';
  }

  document.getElementById('bd-c-base').textContent = fmt(jobRate)+'/hr';
  document.getElementById('bd-c-health').textContent = '+'+fmt(healthHourly);
  document.getElementById('bd-c-fica').textContent = '+'+fmt(ficaHourly);
  document.getElementById('bd-c-match').textContent = '+'+fmt(matchHourly);
  document.getElementById('bd-c-pto').textContent = '+'+fmt(ptoHourly);
  document.getElementById('bd-c-total').textContent = fmt(totalJobHourly)+'/hr';
}

function calcEquip(){
  const cost=+(document.getElementById('e-cost').value)||0;
  const revenue=+(document.getElementById('e-revenue').value)||0;
  const supply=+(document.getElementById('e-supply').value)||0;
  const timeHrs=+(document.getElementById('e-time').value)||0;
  const gigs=+(document.getElementById('e-gigs').value)||0;

  const profitPerGig = revenue - supply;
  const breakEvenGigs = profitPerGig > 0 ? Math.ceil(cost / profitPerGig) : Infinity;
  const breakEvenMonths = gigs > 0 ? (breakEvenGigs / gigs) : Infinity;
  const hourlyAfterBE = timeHrs > 0 ? profitPerGig / timeHrs : 0;
  const annualProfit = (profitPerGig * gigs * 12) - cost;

  if(breakEvenGigs === Infinity) {
    document.getElementById('res-equip-break').textContent = 'Never';
    document.getElementById('res-equip-note').textContent = 'Costs exceed revenue per gig. This doesn\'t work.';
  } else {
    document.getElementById('res-equip-break').textContent = breakEvenGigs + ' gigs';
    document.getElementById('res-equip-note').textContent = breakEvenMonths <= 12
      ? `That's about ${breakEvenMonths.toFixed(1)} months at ${gigs} gigs/month.`
      : `That's ${breakEvenMonths.toFixed(1)} months. Consider if you'll stick with it that long.`;
  }
  document.getElementById('res-equip-profit').textContent = fmt(profitPerGig);
  document.getElementById('res-equip-rate').textContent = fmt(hourlyAfterBE)+'/hr';
  document.getElementById('res-equip-annual').textContent = fmt0(Math.max(annualProfit, 0));
}

['g-type','g-gross','g-hours','g-miles','g-gas-price','g-mpg','g-phone','g-other'].forEach(id=>document.getElementById(id).addEventListener('input',calcGig));
['c-gig-rate','c-gig-hours','c-job-rate','c-job-hours','c-job-health','c-job-pto','c-job-match'].forEach(id=>document.getElementById(id).addEventListener('input',calcCompare));
['e-cost','e-revenue','e-supply','e-time','e-gigs'].forEach(id=>document.getElementById(id).addEventListener('input',calcEquip));

calcGig(); calcCompare(); calcEquip();
