/* ============================================================
   Moonee — Graphiques Chart.js
   ============================================================ */

const _charts = {};

function chartAvailable() {
  return typeof Chart !== "undefined";
}

function ensureChart(id, config) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!chartAvailable()) return;
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  _charts[id] = new Chart(el, config);
}

function setupChartDefaults() {
  if (!chartAvailable()) return;
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', Inter, 'Segoe UI', Roboto, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = "#86868b";
  Chart.defaults.borderColor = "rgba(0,0,0,0.06)";
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
  Chart.defaults.plugins.legend.labels.boxHeight = 12;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = "circle";
  Chart.defaults.plugins.legend.labels.padding = 14;
  Chart.defaults.plugins.tooltip.backgroundColor = "rgba(29,29,31,0.94)";
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.titleFont = { weight: "600" };
}

const eurTick = v => eurFmt0.format(v);

const tooltipEUR = {
  callbacks: {
    label: ctx => " " + eurFmt.format(ctx.parsed.y ?? ctx.parsed),
  },
};

/* ---------- Évolution du patrimoine net ---------- */
function renderNetWorth(id, state) {
  const series = netWorthSeries(state);
  const labels = series.map(s => monthLabel(s.key));
  const data = series.map(s => s.value);
  const grad = document.createElement("canvas").getContext("2d");
  const fill = grad.createLinearGradient(0, 0, 0, 260);
  fill.addColorStop(0, "rgba(59,109,240,0.22)");
  fill.addColorStop(1, "rgba(59,109,240,0)");
  ensureChart(id, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Patrimoine net",
        data,
        borderColor: "#3b6df0",
        backgroundColor: fill,
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: "#fff",
        pointBorderColor: "#3b6df0",
        pointBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: tooltipEUR,
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } },
        y: { ticks: { callback: eurTick }, grid: { color: "rgba(148,163,184,0.12)" } },
      },
    },
  });
}

/* ---------- Répartition du patrimoine ---------- */
function renderAllocation(id, state) {
  const totals = groupTotals(state);
  const labels = [], data = [], colors = [];
  Object.entries(GROUPS).forEach(([g, meta]) => {
    if ((totals[g] || 0) > 0) {
      labels.push(meta.label);
      data.push(totals[g]);
      colors.push(meta.color);
    }
  });
  ensureChart(id, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: "#fff", hoverOffset: 8 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              return " " + ctx.label + " : " + eurFmt.format(ctx.parsed) + " (" + ((ctx.parsed / total) * 100).toFixed(1) + " %)";
            },
          },
        },
      },
    },
  });
}

/* ---------- Revenus vs dépenses ---------- */
function renderCashflow(id, state) {
  const keys = lastNMonthKeys(12);
  const labels = [], inc = [], dep = [], ep = [];
  keys.forEach(k => {
    const s = monthlySums(state, k);
    labels.push(monthLabel(k));
    inc.push(s.income);
    dep.push(s.spending);
    ep.push(s.epargne);
  });
  ensureChart(id, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Revenus", data: inc, backgroundColor: "rgba(34,197,94,0.85)", borderRadius: 6, maxBarThickness: 26 },
        { label: "Dépenses (hors épargne)", data: dep, backgroundColor: "rgba(244,63,94,0.85)", borderRadius: 6, maxBarThickness: 26 },
        { label: "Épargne & invest.", data: ep, backgroundColor: "rgba(16,185,129,0.9)", borderRadius: 6, maxBarThickness: 26 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" }, tooltip: tooltipEUR },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: { ticks: { callback: eurTick }, grid: { color: "rgba(148,163,184,0.12)" } },
      },
    },
  });
}

/* ---------- Répartition des charges ---------- */
function renderExpenseSplit(id, state) {
  const split = necessitySplit(state);
  const order = ["obligatoire", "optionnelle", "ponctuelle", "epargne"];
  const labels = [], data = [], colors = [];
  order.forEach(n => {
    if (split[n] > 0) {
      labels.push(NECESSITY_META[n].label);
      data.push(split[n]);
      colors.push(NECESSITY_META[n].color);
    }
  });
  ensureChart(id, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: "#fff", hoverOffset: 8 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              return " " + ctx.label + " : " + eurFmt.format(ctx.parsed) + " (" + ((ctx.parsed / total) * 100).toFixed(1) + " %)";
            },
          },
        },
      },
    },
  });
}

/* ---------- Top catégories de dépenses ---------- */
function renderCategoryChart(id, state) {
  const totals = categoryTotals(state, "expense");
  const entries = Object.entries(totals)
    .filter(([c]) => c !== "epargne")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 9);
  const labels = entries.map(([c]) => CAT_BY_ID[c]?.label || c);
  const data = entries.map(([, v]) => Math.round(v));
  const colors = entries.map(([c]) => CAT_BY_ID[c]?.color || "#6b7280");
  ensureChart(id, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Total 12 mois", data, backgroundColor: colors, borderRadius: 6, maxBarThickness: 20 }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipEUR },
      scales: {
        x: { ticks: { callback: eurTick }, grid: { color: "rgba(148,163,184,0.12)" } },
        y: { grid: { display: false } },
      },
    },
  });
}

/* ---------- Évolution des dettes David / Tommy ---------- */
function renderSplitDebt(id, state) {
  const labels = lastNMonthKeys(12).map(k => monthLabel(k));
  const seriesD = splitDebtSeries(state, "david");
  const seriesT = splitDebtSeries(state, "tommy");
  const dataD = seriesD.map(s => s.value);
  const dataT = seriesT.map(s => s.value);
  const grad = document.createElement("canvas").getContext("2d");
  const fill = grad.createLinearGradient(0, 0, 0, 260);
  fill.addColorStop(0, "rgba(220,38,38,0.18)");
  fill.addColorStop(1, "rgba(220,38,38,0)");
  ensureChart(id, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Dette de David",
          data: dataD,
          borderColor: "#dc2626",
          backgroundColor: fill,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: "#fff",
          pointBorderColor: "#dc2626",
          pointBorderWidth: 2,
        },
        {
          label: "Dette de Tommy",
          data: dataT,
          borderColor: "#f59e0b",
          borderWidth: 2.5,
          fill: false,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: "#fff",
          pointBorderColor: "#f59e0b",
          pointBorderWidth: 2,
          borderDash: [5, 4],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 14, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label} : ${eurFmt.format(ctx.parsed.y)} (${ctx.parsed.y < 0 ? "la personne doit" : "créditeur"})`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } },
        y: { ticks: { callback: eurTick }, grid: { color: "rgba(148,163,184,0.12)" } },
      },
    },
  });
}

/* ---------- Répartition du loyer Davout (doughnut) ---------- */
function renderSplitShare(id, state) {
  const cfg = splitConfig(state);
  ensureChart(id, {
    type: "doughnut",
    data: {
      labels: ["Part Tommy " + fmtPct(cfg.shareTommy / (cfg.rent || 1), 2), "Part David " + fmtPct(cfg.shareDavid / (cfg.rent || 1), 2)],
      datasets: [{
        data: [cfg.shareTommy, cfg.shareDavid],
        backgroundColor: ["#10b981", "#3b6df0"],
        borderWidth: 3,
        borderColor: "#fff",
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              return " " + ctx.label + " : " + eurFmt.format(ctx.parsed) + " (" + ((ctx.parsed / total) * 100).toFixed(1) + " %)";
            },
          },
        },
      },
    },
  });
}

/* ---------- Versements mensuels David / Tommy ---------- */
function renderSplitPayments(id, state) {
  const keys = lastNMonthKeys(12);
  const labels = [], david = [], tommy = [];
  keys.forEach(k => {
    const m = splitMonth(state, k);
    labels.push(monthLabel(k));
    david.push(m.davidPaid);
    tommy.push(m.tommyPaid);
  });
  ensureChart(id, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "David a versé", data: david, backgroundColor: "rgba(59,109,240,0.85)", borderRadius: 6, maxBarThickness: 26 },
        { label: "Tommy a versé", data: tommy, backgroundColor: "rgba(16,185,129,0.85)", borderRadius: 6, maxBarThickness: 26 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" }, tooltip: tooltipEUR },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: { ticks: { callback: eurTick }, grid: { color: "rgba(148,163,184,0.12)" } },
      },
    },
  });
}

/* ---------- Valeur nette par entité (holdings) ---------- */
function renderHoldingBars(id, state) {
  const summaries = holdingSummaries(state);
  const labels = summaries.map(s => s.entity.name);
  const data = summaries.map(s => Math.round(s.value));
  const colors = data.map(v => v < 0 ? "rgba(239,68,68,0.8)" : "rgba(16,185,129,0.85)");
  ensureChart(id, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Valeur nette", data, backgroundColor: colors, borderRadius: 6, maxBarThickness: 46 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipEUR },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: eurTick }, grid: { color: "rgba(148,163,184,0.12)" } },
      },
    },
  });
}

/* ---------- Propriété effective par personne (barres horizontales) ---------- */
function renderHoldingOwners(id, state) {
  const per = personHoldingsValue(state);
  const labels = [], data = [], colors = [];
  PERSONS.forEach(p => {
    labels.push(p.name);
    const v = Math.round(per[p.id] || 0);
    data.push(v);
    colors.push(p.color); // couleur propre à chaque personne, même si la valeur est négative
  });
  ensureChart(id, {
    type: "bar",
    data: { labels, datasets: [{ label: "Valeur nette effective", data, backgroundColor: colors, borderRadius: 6, maxBarThickness: 40 }] },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipEUR },
      scales: {
        x: { ticks: { callback: eurTick }, grid: { color: "rgba(148,163,184,0.12)" } },
        y: { grid: { display: false } },
      },
    },
  });
}

/* ---------- Dividendes mère-fille remontés (12 mois) ---------- */
function renderDividendChart(id, state) {
  const keys = lastNMonthKeys(12);
  const labels = [], data = [];
  keys.forEach(k => {
    labels.push(monthLabel(k));
    data.push(holdingDividends(state)
      .filter(d => d.month === k)
      .reduce((s, d) => s + (Number(d.amount) || 0), 0));
  });
  ensureChart(id, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Dividendes remontés",
        data,
        backgroundColor: "rgba(236,72,153,0.85)",
        borderRadius: 6,
        maxBarThickness: 30,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipEUR },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: { ticks: { callback: eurTick }, grid: { color: "rgba(148,163,184,0.12)" } },
      },
    },
  });
}

/* ---------- Projection des flux récurrents (12 mois) ---------- */
function renderProjection(id, state) {
  const proj = recurringProjection(state, 12);
  const labels = proj.map(p => monthLabel(p.key));
  const balances = proj.map(p => Math.round(p.balance));
  const zeros = proj.map(() => 0);
  const grad = document.createElement("canvas").getContext("2d");
  const fill = grad.createLinearGradient(0, 0, 0, 260);
  fill.addColorStop(0, "rgba(59,109,240,0.22)");
  fill.addColorStop(1, "rgba(59,109,240,0)");
  ensureChart(id, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Solde projeté",
          data: balances,
          borderColor: "#3b6df0",
          backgroundColor: fill,
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: "#fff",
          pointBorderColor: "#3b6df0",
          pointBorderWidth: 2,
        },
        {
          label: "Seuil zéro",
          data: zeros,
          borderColor: "rgba(220,38,38,0.5)",
          borderDash: [6, 6],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipEUR },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } },
        y: { ticks: { callback: eurTick }, grid: { color: "rgba(148,163,184,0.12)" } },
      },
    },
  });
}

/* ---------- Biens immobiliers : valeur vs dette ---------- */
function renderRealEstateChart(id, state) {
  const biens = biensConfig(state);
  const labels = biens.map(b => b.name);
  const valeurs = biens.map(b => Math.round(bienValue(state, b)));
  const dettes = biens.map(b => Math.round(bienDebt(state, b)));
  ensureChart(id, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Valeur estimée", data: valeurs, backgroundColor: "rgba(20,184,166,0.85)", borderRadius: 6, maxBarThickness: 46 },
        { label: "Dette liée", data: dettes, backgroundColor: "rgba(239,68,68,0.8)", borderRadius: 6, maxBarThickness: 46 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" }, tooltip: tooltipEUR },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: eurTick }, grid: { color: "rgba(148,163,184,0.12)" } },
      },
    },
  });
}

/* ---------- Performance annuelle par bien (barres groupées) ---------- */
function renderRealEstateAnnualChart(id, state) {
  const biens = biensConfig(state);
  const ann = biens.map(b => bienAnnualFlows(state, b));
  ensureChart(id, {
    type: "bar",
    data: {
      labels: biens.map(b => b.name),
      datasets: [
        { label: "Revenus annuels", data: ann.map(x => Math.round(x.income)), backgroundColor: "rgba(52,199,89,0.85)", borderRadius: 6, maxBarThickness: 40 },
        { label: "Charges + prêts", data: ann.map(x => Math.round(x.charges + x.loans)), backgroundColor: "rgba(255,59,48,0.75)", borderRadius: 6, maxBarThickness: 40 },
        { label: "Cashflow net annuel", data: ann.map(x => Math.round(x.cashflowNet)), backgroundColor: "rgba(99,102,241,0.85)", borderRadius: 6, maxBarThickness: 40 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" }, tooltip: tooltipEUR },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: eurTick }, grid: { color: "rgba(148,163,184,0.12)" } },
      },
    },
  });
}

/* ---------- Taux d'épargne ---------- */
function renderSavingsRate(id, state) {
  const keys = lastNMonthKeys(12);
  const labels = [], data = [];
  keys.forEach(k => {
    const s = monthlySums(state, k);
    labels.push(monthLabel(k));
    data.push(s.income > 0 ? Math.round((s.epargne / s.income) * 1000) / 10 : 0);
  });
  ensureChart(id, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Taux d'épargne",
        data,
        borderColor: "#10b981",
        backgroundColor: "rgba(16,185,129,0.12)",
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: "#fff",
        pointBorderColor: "#10b981",
        pointBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => " " + ctx.parsed.y + " %" } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } },
        y: { ticks: { callback: v => v + " %" }, grid: { color: "rgba(148,163,184,0.12)" } },
      },
    },
  });
}
