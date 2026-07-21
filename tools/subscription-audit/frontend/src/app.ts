// @ts-nocheck — UI glue lifted verbatim from the former inline <script>;
// data now imported from the shared layer. Typed data, untyped DOM code
// (same posture as petdose/engine.ts) — full typing is a later pass.
import { SUBSCRIPTION_PRESETS } from "../../../../data/subscription-presets";

const fmt = (n) => "$" + n.toFixed(2);
const fmt0 = (n) => "$" + Math.round(n).toLocaleString();
let subs = SUBSCRIPTION_PRESETS.map((s) => ({ ...s }));
function toMonthly(cost, cycle) { return cycle === "annual" ? cost / 12 : cycle === "weekly" ? cost * 4.33 : cost; }

function render() {
  const wage = +(document.getElementById("s-wage").value) || 0;
  const body = document.getElementById("sub-body");
  let totalMonthly = 0;
  let html = "";
  let graveyardHtml = "";
  let graveyardCount = 0;

  subs.forEach((s, i) => {
    const monthly = toMonthly(s.cost, s.cycle);
    const annual = monthly * 12;
    const costPerUse = s.uses > 0 ? monthly / s.uses : Infinity;
    const hoursPerYear = wage > 0 ? annual / wage : 0;
    const isGraveyard = s.uses < 2;
    totalMonthly += monthly;

    const row = `<tr class="${isGraveyard ? "graveyard" : ""}">
      <td>${s.name}</td>
      <td class="cost">${fmt(monthly)}/mo</td>
      <td style="color:var(--text-muted)">${s.cycle}</td>
      <td>${s.uses}</td>
      <td class="${costPerUse > 5 ? "waste" : ""}">${costPerUse === Infinity ? "∞" : fmt(costPerUse)}</td>
      <td class="time">${hoursPerYear > 0 ? hoursPerYear.toFixed(1) + "h" : "—"}</td>
      <td><button class="btn btn--small btn--danger" onclick="removeSub(${i})">✕</button></td>
    </tr>`;
    html += row;

    if (isGraveyard) {
      graveyardCount++;
      graveyardHtml += `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:12px"><span>${s.name}</span><span style="color:var(--red)">${fmt(monthly)}/mo — used ${s.uses}x/mo — ${fmt(costPerUse)}/use</span></div>`;
    }
  });

  body.innerHTML = html;
  const annual = totalMonthly * 12;
  document.getElementById("res-monthly").textContent = fmt0(totalMonthly);
  document.getElementById("res-annual").textContent = fmt0(annual);
  document.getElementById("res-5yr").textContent = fmt0(annual * 5);

  if (wage > 0) {
    const hrs = annual / wage;
    document.getElementById("res-hours").textContent = hrs.toFixed(0) + "hrs";
    document.getElementById("res-hours-note").textContent = `At ${fmt(wage)}/hr real wage`;
  } else {
    document.getElementById("res-hours").textContent = "—";
    document.getElementById("res-hours-note").textContent = "Enter your wage to see this";
  }

  const gs = document.getElementById("graveyard-section");
  if (graveyardCount > 0) { gs.style.display = "block"; document.getElementById("graveyard-list").innerHTML = graveyardHtml; }
  else { gs.style.display = "none"; }
}

function addSub() {
  const name = document.getElementById("add-name").value.trim();
  const cost = +(document.getElementById("add-cost").value) || 0;
  const cycle = document.getElementById("add-cycle").value;
  const uses = +(document.getElementById("add-uses").value) || 0;
  if (!name || !cost) return;
  subs.push({ name, cost, cycle, uses });
  document.getElementById("add-name").value = "";
  document.getElementById("add-cost").value = "";
  document.getElementById("add-uses").value = "";
  render();
}

function removeSub(i) { subs.splice(i, 1); render(); }

// Exposed for the inline onclick handlers in index.html.
window.addSub = addSub;
window.removeSub = removeSub;

document.getElementById("s-wage").addEventListener("input", render);
render();
