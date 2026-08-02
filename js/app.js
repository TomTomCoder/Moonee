/* ============================================================
   Moonee — Application : rendu UI, navigation, formulaires
   ============================================================ */

const App = {
  state: null,
  page: "dashboard",
  txMonth: currentMonthKey(),
  txFilter: "all",
  txSelection: new Set(), /* ids des transactions sélectionnées (page Revenus & charges) */
  txAccounts: new Set(),  /* ids des comptes filtrés (vide = tous les comptes) */
  dashTab: "global",       /* onglet de détail actif du tableau de bord (persisté) */
};

/* ---------- Boot ---------- */
function boot() {
  setupChartDefaults();
  App.state = initState();
  /* Génère les occurrences manquantes des flux récurrents (mois suivant inclus) */
  propagateRecurring(App.state, 1);
  saveState(App.state);

  fillSelects();
  bindNavigation();
  bindGlobal();
  bindModals();
  bindForms();
  bindProfile();

  renderAll();
  showPage("dashboard");
}

function renderAll() {
  renderSidebar();
  renderDashboard();
  renderAccounts();
  renderTransactions();
  renderLoans();
  renderRealEstate();
  renderHoldings();
  renderSplit();
  renderAnalysis();
  renderAlerts();
  renderPractices();
}

/* ---------- Navigation ---------- */
function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });
  /* Délégation : les liens data-goto créés dynamiquement restent fonctionnels */
  document.addEventListener("click", e => {
    const link = e.target.closest("[data-goto]");
    if (link) { e.preventDefault(); showPage(link.dataset.goto); }
  });
}

function showPage(page) {
  App.page = page;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + page));
  window.scrollTo({ top: 0, behavior: "smooth" });
  // Rafraîchir les pages dynamiques
  if (page === "dashboard") renderDashboard();
  if (page === "analysis") renderAnalysis();
  if (page === "alerts") renderAlerts();
  if (page === "practices") renderPractices();
  if (page === "transactions") renderTransactions();
  if (page === "accounts") renderAccounts();
  if (page === "loans") renderLoans();
  if (page === "realestate") renderRealEstate();
  if (page === "holdings") renderHoldings();
  if (page === "split") renderSplit();
}

/* ---------- Sidebar ---------- */
function renderSidebar() {
  const nw = netWorth(App.state);
  document.getElementById("miniNetWorth").textContent = fmtEUR0(nw);

  const keys = lastNMonthKeys(2);
  const cur = monthlySums(App.state, keys[1]);
  const prev = monthlySums(App.state, keys[0]);
  const delta = (cur.income - cur.spending) - (prev.income - prev.spending);
  const el = document.getElementById("miniDelta");
  el.textContent = (delta >= 0 ? "+" : "") + fmtEUR0(delta) + " vs mois préc.";
  el.classList.toggle("neg", delta < 0);

  const alerts = computeAlerts(App.state);
  const active = alerts.filter(a => a.severity === "danger" || a.severity === "warning").length;
  const badge = document.getElementById("navAlertsBadge");
  if (active > 0) { badge.textContent = active; badge.hidden = false; }
  else badge.hidden = true;
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const s = App.state;
  const nw = netWorth(s);
  const assets = s.accounts.reduce((x, a) => x + (Number(a.balance) || 0), 0);
  const debts = totalDebt(s);
  const mos = monthsOfSafety(s);
  const pLiq = personalLiquidAssets(s);
  const cLiq = companyLiquidAssets(s);
  const sr = savingsRate(s);
  const avg = avgMonthly(s, 12);
  /* Coussin strict : liquidités perso / (dépenses + épargne) — épargne comptée comme sortie */
  const strictMos = avg.spending + avg.epargne > 0 ? pLiq / (avg.spending + avg.epargne) : null;
  const keys = lastNMonthKeys(2);
  const cur = monthlySums(s, keys[1]);
  const prev = monthlySums(s, keys[0]);
  const flowNet = cur.income - cur.spending;
  const flowDelta = flowNet - (prev.income - prev.spending);
  const dr = debtRatio(s);
  const nBiens = biensConfig(s).length;

  /* ---------- Segmentation perso / entreprise (données réelles) ---------- */
  const as = assetSplit(s);              // actifs comptes : perso / entreprise / total
  const ds = debtSplit(s);               // dettes + mensualités par détenteur
  const fs = monthlyFlowSplit(s, 12);    // revenus / dépenses / épargne mensuels moyens
  const gp = personalGroupTotals(s);     // totaux par groupe, perso
  const ge = companyGroupTotals(s);      // totaux par groupe, entreprises
  const gAll = groupTotals(s);
  const nwPerso = as.perso - ds.perso;
  const nwEnt = as.entreprise - ds.entreprise;
  /* Épargne personnelle = livrets perso (groupe épargne hors sociétés).
     Épargne/trésorerie entreprises = liquidités détenues par les sociétés
     (les comptes de société sont typés « pro », ils ne tombent pas dans le
     groupe épargne — c'est la trésorerie constituée dans les entités). */
  const epargnePerso = gp.epargne || 0;
  const epargneTotale = epargnePerso + cLiq;
  const investPerso = (gp.invest || 0) + (gp.crypto || 0) + (gp.terme || 0);
  const investEnt = (ge.invest || 0) + (ge.crypto || 0) + (ge.terme || 0);
  const investAll = (gAll.invest || 0) + (gAll.crypto || 0) + (gAll.terme || 0);

  const kpi = (accent, label, value, delta, cls = "") => `
    <div class="kpi" style="--kpi-accent:${accent}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value ${cls}">${value}</div>
      ${delta ? `<div class="kpi-delta">${delta}</div>` : ""}
    </div>`;
  /* KPI « hero » : rangée horizontale pleine largeur — icône + libellé à
     gauche, valeur + verdict à droite, barre de seuil dessous. Lisible à
     toutes les largeurs (fini les colonnes étroites qui tronquent les valeurs). */
  const hero = (accent, icon, label, sub, value, delta, cls = "", bar = null) => `
    <div class="hero-row" style="--kpi-accent:${accent}">
      <span class="hero-row-ico" style="background:${accent}1a">${icon}</span>
      <div class="hero-row-main">
        <div class="hero-row-label">${label}</div>
        ${sub ? `<div class="hero-row-sub">${sub}</div>` : ""}
      </div>
      <div class="hero-row-val">
        <div class="hero-row-value">${value}</div>
        ${delta ? `<div class="hero-row-delta ${cls}">${delta}</div>` : ""}
      </div>
      ${bar ? `
      <div class="hero-row-barline">
        <div class="bar hero-row-bar"><div class="bar-fill" style="width:${bar.pct}%;--bar-c:${bar.color}"></div></div>
        <span class="hero-row-threshold">${bar.caption}</span>
      </div>` : ""}
    </div>`;

  /* Remplissage des barres : progression vers la cible / le seuil */
  const pctToward = (val, target) => Math.max(0, Math.min(100, Math.round((val / target) * 100)));
  const mosBar = mos !== null ? pctToward(mos, 6) : 0;
  const srBar = sr !== null ? pctToward(sr, 0.2) : 0;
  const drBar = dr !== null ? pctToward(dr, 0.35) : 0;

  document.getElementById("dashSubtitle").textContent =
    "Vue d'ensemble au " + new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  /* Onglet de détail persistant (survit aux re-rendus du dashboard) */
  const dashTab = App.dashTab || "global";

  /* Sélection d'un onglet : met à jour l'état App, les classes actives et le
     roving tabindex (pattern ARIA tabs — un seul onglet dans l'ordre de tab). */
  const selectDashTab = name => {
    App.dashTab = name;
    const wrap = document.querySelector("#dashKpis .dash-details");
    if (!wrap) return;
    wrap.querySelectorAll(".tab[data-dtab]").forEach(t => {
      const on = t.dataset.dtab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
    });
    wrap.querySelectorAll(".dash-pane").forEach(p => { p.hidden = p.dataset.pane !== name; });
  };

  document.getElementById("dashKpis").innerHTML = `
    <div class="kpi-hero" role="group" aria-label="Indicateurs clés">
      ${hero("#3b6df0", "💎", "Patrimoine net", `Actifs ${fmtEUR0(assets)} − dettes ${fmtEUR0(debts)}`, fmtEUR0(nw),
        `${flowDelta >= 0 ? "+" : ""}${fmtEUR0(flowDelta)} vs mois précédent`,
        flowDelta < 0 ? "neg" : "pos")}
      ${hero("#8b5cf6", "💧", "Trésorerie totale", "Liquidités mobilisables", fmtEUR0(pLiq + cLiq),
        `perso ${fmtEUR0(pLiq)} · sociétés ${fmtEUR0(cLiq)}`, "neutral")}
      ${hero("#34c759", "🛡️", "Coussin de sécurité",
        `${fmtEUR0(pLiq)} de liquidités · strict ${strictMos !== null ? strictMos.toFixed(1) + " mois" : "—"}`,
        mos !== null ? mos.toFixed(1) + " mois" : "—",
        mos !== null && mos >= 6 ? "Objectif de 6 mois atteint" : "Sous l'objectif de 6 mois",
        mos !== null && mos < 6 ? "neg" : "pos",
        { pct: mosBar, color: mos !== null && mos >= 6 ? "#34c759" : "#e07d00", caption: "Cible : 6 mois de dépenses" })}
      ${hero("#0a84ff", "📈", "Taux d'épargne", `Épargne moyenne ${fmtEUR0(avg.epargne)}/mois`, sr !== null ? fmtPct(sr, 1) : "—",
        sr !== null && sr >= 0.2 ? "Objectif de 20 % atteint" : "Sous l'objectif de 20 %",
        sr !== null && sr < 0.2 ? "neg" : "pos",
        { pct: srBar, color: sr !== null && sr >= 0.2 ? "#0a84ff" : "#e07d00", caption: "Cible : 20 % des revenus" })}
      ${hero("#f59e0b", "🏦", "Endettement", `Mensualités ${fmtEUR0(ds.monthlyTotal)}/mois`, dr !== null ? fmtPct(dr, 1) : "—",
        dr !== null && dr <= 0.35 ? "Sous le seuil de 35 %" : "Au-dessus du seuil de 35 %",
        dr !== null && dr > 0.35 ? "neg" : "pos",
        { pct: drBar, color: dr !== null && dr <= 0.35 ? "#34c759" : "#ff3b30", caption: "Seuil de vigilance : 35 % des revenus" })}
    </div>

    <div class="dash-details">
      <div class="tabs dash-tabs" role="tablist" aria-label="Détail des indicateurs">
        <button class="tab ${dashTab === "global" ? "active" : ""}" role="tab" id="dashTabGlobal" aria-selected="${dashTab === "global"}" aria-controls="dashPane-global" tabindex="${dashTab === "global" ? 0 : -1}" data-dtab="global">⚖️ Synthèse</button>
        <button class="tab ${dashTab === "perso" ? "active" : ""}" role="tab" id="dashTabPerso" aria-selected="${dashTab === "perso"}" aria-controls="dashPane-perso" tabindex="${dashTab === "perso" ? 0 : -1}" data-dtab="perso">👤 Personnel</button>
        <button class="tab ${dashTab === "ent" ? "active" : ""}" role="tab" id="dashTabEnt" aria-selected="${dashTab === "ent"}" aria-controls="dashPane-ent" tabindex="${dashTab === "ent" ? 0 : -1}" data-dtab="ent">🏢 Entreprises</button>
      </div>

      <div class="dash-pane" data-pane="global" role="tabpanel" id="dashPane-global" aria-labelledby="dashTabGlobal" ${dashTab !== "global" ? "hidden" : ""}>
        <div class="kpis">
          ${kpi("#22c55e", "💰 Actifs totaux", fmtEUR0(assets), `${s.accounts.length} comptes · ${nBiens} bien(s)`)}
          ${kpi("#ef4444", "🏦 Dettes totales", fmtEUR0(debts), `${fmtEUR0(ds.monthlyTotal)}/mois de mensualités`)}
          ${kpi("#8b5cf6", "💧 Trésorerie totale", fmtEUR0(pLiq + cLiq), `perso ${fmtEUR0(pLiq)} · sociétés ${fmtEUR0(cLiq)}`)}
          ${kpi("#0ea5e9", "💸 Flux du mois", (flowNet >= 0 ? "+" : "") + fmtEUR0(flowNet), `vs mois précédent : ${flowDelta >= 0 ? "+" : ""}${fmtEUR0(flowDelta)}`, flowNet < 0 ? "neg" : "")}
          ${kpi("#10b981", "💰 Épargne + trésorerie", fmtEUR0(epargneTotale), `épargne perso ${fmtEUR0(epargnePerso)}`)}
          ${kpi("#8b5cf6", "📈 Investissements (hors immo)", fmtEUR0(investAll), `perso ${fmtEUR0(investPerso)} · ent. ${fmtEUR0(investEnt)}`)}
          ${kpi("#14b8a6", "🏠 Immobilier", fmtEUR0(gAll.immobilier || 0), `perso ${fmtEUR0(gp.immobilier || 0)} · ent. ${fmtEUR0(ge.immobilier || 0)}`)}
          ${kpi("#f97316", "🪙 Crypto", fmtEUR0(gAll.crypto || 0), "Nexo USDC · NEXO")}
        </div>
      </div>

      <div class="dash-pane" data-pane="perso" role="tabpanel" id="dashPane-perso" aria-labelledby="dashTabPerso" ${dashTab !== "perso" ? "hidden" : ""}>
        <div class="kpis">
          ${kpi("#10b981", "👤 Patrimoine personnel", fmtEUR0(nwPerso), `Actifs ${fmtEUR0(as.perso)} − dettes ${fmtEUR0(ds.perso)}`, nwPerso < 0 ? "neg" : "")}
          ${kpi("#22c55e", "💰 Actifs personnels", fmtEUR0(as.perso), "Hors sociétés")}
          ${kpi("#ef4444", "🏦 Dettes personnelles", fmtEUR0(ds.perso), `${fmtEUR0(ds.monthlyPerso)}/mois de mensualités`)}
          ${kpi("#10b981", "💳 Liquidités personnelles", fmtEUR0(pLiq), `${mos !== null ? mos.toFixed(1) + " mois de sécurité" : "—"}`)}
          ${kpi("#059669", "🌱 Épargne personnelle", fmtEUR0(epargnePerso), "Livrets A, LDDS, Bourso+…")}
          ${kpi("#22c55e", "💼 Revenus perso", fmtEUR0(fs.perso.income), "Moyenne mensuelle · 12 mois")}
          ${kpi("#ef4444", "🛒 Dépenses perso", fmtEUR0(fs.perso.spending), "Hors épargne")}
          ${kpi("#10b981", "💰 Épargne mensuelle", fmtEUR0(fs.perso.epargne), "Virements vers livrets")}
        </div>
      </div>

      <div class="dash-pane" data-pane="ent" role="tabpanel" id="dashPane-ent" aria-labelledby="dashTabEnt" ${dashTab !== "ent" ? "hidden" : ""}>
        <div class="kpis">
          ${kpi("#0ea5e9", "🏢 Patrimoine entreprises", fmtEUR0(nwEnt), `Actifs ${fmtEUR0(as.entreprise)} − dettes ${fmtEUR0(ds.entreprise)}`, nwEnt < 0 ? "neg" : "")}
          ${kpi("#0ea5e9", "💰 Actifs entreprises", fmtEUR0(as.entreprise), "SCI TODA · Space Unity · Margooya")}
          ${kpi("#f59e0b", "🏦 Dettes entreprises", fmtEUR0(ds.entreprise), `${fmtEUR0(ds.monthlyEnt)}/mois de mensualités`)}
          ${kpi("#0ea5e9", "💧 Liquidités en sociétés", fmtEUR0(cLiq), "SCI TODA · Space Unity")}
          ${kpi("#059669", "💰 Épargne entreprises", fmtEUR0(fs.entreprise.epargne), "Virements vers réserves")}
          ${kpi("#22c55e", "💼 Revenus entreprises", fmtEUR0(fs.entreprise.income), "Chrl en travaux · pas encore de loyers")}
          ${kpi("#ef4444", "🛒 Dépenses entreprises", fmtEUR0(fs.entreprise.spending), "Hors épargne")}
          ${kpi("#8b5cf6", "🏦 Mensualités entreprises", fmtEUR0(ds.monthlyEnt), "Prêts SCI / sociétés")}
        </div>
      </div>
    </div>
  `;

  /* Interaction des onglets (délégation — liée une seule fois, l'état vit dans
     App.dashTab et survit aux re-rendus du dashboard) */
  const dashKpis = document.getElementById("dashKpis");
  if (dashKpis && !dashKpis.dataset.tabsBound) {
    dashKpis.dataset.tabsBound = "1";
    dashKpis.addEventListener("click", e => {
      const btn = e.target.closest("[data-dtab]");
      if (btn) selectDashTab(btn.dataset.dtab);
    });
    /* Navigation clavier standard des onglets : flèches gauche/droite + Home/End */
    dashKpis.addEventListener("keydown", e => {
      const btn = e.target.closest(".dash-tabs [data-dtab]");
      if (!btn) return;
      const tabs = [...btn.closest(".dash-tabs").querySelectorAll("[data-dtab]")];
      const i = tabs.indexOf(btn);
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); selectDashTab(next.dataset.dtab); next.focus(); }
    });
  }

  renderHealthCard(s);
  renderRecentTransactions(s);

  renderNetWorth("chartNw", s);
  renderAllocation("chartAlloc", s);
  renderCashflow("chartFlow", s);
  renderExpenseSplit("chartSplit", s);
  renderProjectionWidget(s);
}

function renderHealthCard(s) {
  const h = computeHealthScore(s);
  const R = 50, C = 2 * Math.PI * R;
  document.getElementById("healthCard").innerHTML = `
    <div class="card-head"><h3>Score de santé financière</h3><span class="chip ${h.score >= 60 ? "success" : h.score >= 40 ? "warning" : "danger"}">${h.score}/100</span></div>
    <div class="health-top">
      <div class="gauge-wrap">
        <svg width="118" height="118" viewBox="0 0 118 118">
          <circle class="gauge-track" cx="59" cy="59" r="${R}" fill="none" stroke-width="11"/>
          <circle class="gauge-fill" cx="59" cy="59" r="${R}" fill="none" stroke-width="11"
            stroke-dasharray="${C}" stroke-dashoffset="${C - (C * h.score / 100)}" stroke="${h.color}"/>
        </svg>
        <div class="gauge-label"><div><div class="gauge-score">${h.score}</div><div class="gauge-sub">/ 100</div></div></div>
      </div>
      <div class="health-meta">
        <h4>${h.grade}</h4>
        <p>${h.score >= 60 ? "Vos fondamentaux sont solides. Surveillez les points d'amélioration ci-dessous." : h.score >= 40 ? "Quelques axes d'amélioration identifiés — travaillez-les un par un." : "Priorité : reconstruire votre marge de sécurité."}</p>
      </div>
    </div>
    <div class="health-parts">
      ${h.parts.map(p => `
        <div class="health-part">
          <div class="health-part-top"><span>${p.label}</span><span>${p.score}/${p.max} · ${p.note}</span></div>
          <div class="bar"><div class="bar-fill" style="width:${(p.score / p.max) * 100}%;--bar-c:${p.color}"></div></div>
        </div>`).join("")}
    </div>
  `;
}

function renderRecentTransactions(s) {
  /* Ne montre que les transactions passées (les occurrences futures pré-générées
     des flux récurrents n'apparaissent pas ici) */
  const today = new Date().toISOString().slice(0, 10);
  const recent = [...s.transactions]
    .filter(t => t.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);
  const el = document.getElementById("recentTable");
  if (recent.length === 0) {
    el.innerHTML = `<div class="empty-state"><span class="big">🧾</span>Aucune transaction pour le moment.</div>`;
    return;
  }
  el.innerHTML = `<table>
    <thead><tr><th>Transaction</th><th>Date</th><th>Compte</th><th>Nature</th><th class="right">Montant</th></tr></thead>
    <tbody>
      ${recent.map(txRow).join("")}
    </tbody></table>`;
}

function txRow(t) {
  const cat = CAT_BY_ID[t.category];
  const acct = App.state.accounts.find(a => a.id === t.account);
  const inc = t.type === "income";
  const necessity = t.type === "expense" ? NECESSITY_META[t.necessity] : null;
  const bien = t.bien ? bienById(App.state, t.bien) : null;
  return `
    <tr>
      <td>
        <div class="tx-main">
          <div class="tx-ico">${cat ? cat.icon : "💸"}</div>
          <div>
            <div class="tx-label">${escapeHtml(t.label)}</div>
            <div class="tx-sub">${cat ? escapeHtml(cat.label) : ""}${bien ? ` · 🏠 ${escapeHtml(bien.name)}` : ""}</div>
          </div>
        </div>
      </td>
      <td class="muted">${dayLabel(t.date)}</td>
      <td class="muted">${acct ? escapeHtml(acct.name) : "—"}</td>
      <td>${necessity ? `<span class="chip" style="background:${necessity.color}18;color:${necessity.color}">${necessity.label}</span>` : `<span class="chip success">Revenu</span>`}</td>
      <td class="tx-amount ${inc ? "income" : "expense"}">${inc ? "+" : "−"}${fmtEUR(t.amount)}</td>
    </tr>`;
}

/* ---------- Comptes ---------- */
function renderAccounts() {
  const s = App.state;
  const nw = netWorth(s);
  const assets = s.accounts.reduce((x, a) => x + (Number(a.balance) || 0), 0);
  const debts = totalDebt(s);
  const totals = groupTotals(s);
  const pTotals = personalGroupTotals(s);

  document.getElementById("accountsKpis").innerHTML = `
    <div class="kpi" style="--kpi-accent:#3b6df0"><div class="kpi-label">💎 Patrimoine net</div><div class="kpi-value">${fmtEUR0(nw)}</div></div>
    <div class="kpi" style="--kpi-accent:#22c55e"><div class="kpi-label">💰 Total actifs</div><div class="kpi-value">${fmtEUR0(assets)}</div></div>
    <div class="kpi" style="--kpi-accent:#ef4444"><div class="kpi-label">🏦 Total dettes</div><div class="kpi-value">${fmtEUR0(debts)}</div></div>
    <div class="kpi" style="--kpi-accent:#10b981"><div class="kpi-label">🌱 Épargne réglementée</div><div class="kpi-value">${fmtEUR0(pTotals.epargne || 0)}</div><div class="kpi-delta neutral">Hors sociétés</div></div>
  `;

  const grouped = {};
  Object.keys(GROUPS).forEach(g => grouped[g] = []);
  s.accounts.forEach(a => grouped[accountMeta(a.type).group].push(a));

  const html = Object.entries(GROUPS)
    .filter(([g]) => grouped[g].length > 0)
    .map(([g, meta]) => {
      const list = grouped[g];
      const total = list.reduce((x, a) => x + (Number(a.balance) || 0), 0);
      return `
        <div class="group-title">
          <span class="ico">${meta.icon}</span><h3>${meta.label}</h3>
          <span class="tot">${fmtEUR0(total)}</span>
        </div>
        <div class="accounts-grid">
          ${list.map(a => accountCard(a)).join("")}
        </div>`;
    }).join("");

  document.getElementById("accountsGroups").innerHTML = html || `<div class="empty-state"><span class="big">🏦</span>Aucun compte — ajoutez votre premier compte.</div>`;

  document.querySelectorAll("[data-edit-acct]").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation();
    const a = s.accounts.find(x => x.id === b.dataset.editAcct);
    if (a) openAccountModal(a);
  }));
  document.querySelectorAll("[data-del-acct]").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation();
    if (confirm("Supprimer ce compte ? Les transactions liées seront conservées.")) {
      s.accounts = s.accounts.filter(x => x.id !== b.dataset.delAcct);
      saveState(s); renderAll(); toast("Compte supprimé", "danger");
    }
  }));
}

function accountCard(a) {
  const t = accountMeta(a.type);
  const bal = Number(a.balance) || 0;
  const lim = Number(a.limit) || 0;
  const pct = lim > 0 ? Math.min(100, Math.round((bal / lim) * 100)) : 0;
  const limitFull = lim > 0 && bal >= lim;
  return `
    <div class="account-card">
      <div class="acct-actions">
        <button class="act-btn" data-edit-acct="${a.id}" title="Modifier">✎</button>
        <button class="act-btn del" data-del-acct="${a.id}" title="Supprimer">🗑</button>
      </div>
      <div class="acct-top">
        <div class="acct-ico" style="background:${t.color}1a">${t.icon}</div>
        <div>
          <div class="acct-name">${escapeHtml(a.name)}</div>
          <div class="acct-inst">${escapeHtml(a.institution || "—")} · ${t.label}</div>
        </div>
      </div>
      <div class="acct-balance ${bal < 0 ? "neg" : ""}">${fmtEUR(bal)}</div>
      <div class="acct-meta">
        ${a.rate ? `<span class="mini-chip">Taux ${fmtNum(a.rate)} %</span>` : ""}
        ${lim > 0 ? `<span class="mini-chip ${limitFull ? "limit-full" : ""}">${fmtPct(pct / 100)} du plafond ${fmtEUR0(lim)}</span>` : ""}
      </div>
      ${lim > 0 ? `
        <div class="limit-bar bar"><div class="bar-fill" style="width:${pct}%;--bar-c:${limitFull ? "#d97706" : t.color}"></div></div>` : ""}
    </div>`;
}

/* ---------- Widget : projection des flux récurrents ---------- */
function renderProjectionWidget(s) {
  const proj = recurringProjection(s, 12);
  const first = proj[0] || { income: 0, spending: 0, epargne: 0 };
  const last = proj[proj.length - 1] || { balance: 0 };
  const minBal = proj.reduce((m, p) => Math.min(m, p.balance), Infinity);
  const danger = minBal < 0;

  document.getElementById("projectionKpis").innerHTML = `
    <div class="kpi" style="--kpi-accent:#22c55e"><div class="kpi-label">💼 Revenus récurrents / mois</div><div class="kpi-value">${fmtEUR0(first.income)}</div><div class="kpi-delta neutral">Moyenne sur vos séries</div></div>
    <div class="kpi" style="--kpi-accent:#f43f5e"><div class="kpi-label">🛒 Dépenses récurrentes / mois</div><div class="kpi-value">${fmtEUR0(first.spending)}</div><div class="kpi-delta neutral">Hors épargne</div></div>
    <div class="kpi" style="--kpi-accent:#10b981"><div class="kpi-label">💰 Épargne récurrente / mois</div><div class="kpi-value">${fmtEUR0(first.epargne)}</div><div class="kpi-delta neutral">Automatisée</div></div>
    <div class="kpi" style="--kpi-accent:${danger ? "#ef4444" : "#3b6df0"}">
      <div class="kpi-label">📈 Solde projeté (12 mois)</div>
      <div class="kpi-value ${danger ? "neg" : "pos"}">${fmtEUR0(last.balance)}</div>
      <div class="kpi-delta ${danger ? "neg" : "neutral"}">${danger ? "Trésorerie en négatif sur la période" : "Flux récurrents soutenables"}</div>
    </div>
  `;

  renderProjection("chartProjection", s);
}

/* ---------- Transactions ---------- */
function renderTransactions() {
  const s = App.state;
  const key = App.txMonth;
  /* Filtre comptes : les KPIs reflètent le mois + comptes sélectionnés */
  let monthList = txOfMonth(s, key);
  if (App.txAccounts.size > 0) monthList = monthList.filter(t => App.txAccounts.has(t.account));
  const income = sumTx(monthList, "income");
  const epargne = sumTx(monthList, "expense", "epargne");
  const spending = sumTx(monthList, "expense") - epargne;
  const sr = income > 0 ? epargne / income : 0;

  document.getElementById("monthLabel").textContent = monthLabel(key);
  document.getElementById("txKpis").innerHTML = `
    <div class="kpi" style="--kpi-accent:#22c55e"><div class="kpi-label">💼 Revenus</div><div class="kpi-value">${fmtEUR(income)}</div></div>
    <div class="kpi" style="--kpi-accent:#f43f5e"><div class="kpi-label">🛒 Dépenses</div><div class="kpi-value">${fmtEUR(spending)}</div></div>
    <div class="kpi" style="--kpi-accent:#10b981"><div class="kpi-label">💰 Épargne</div><div class="kpi-value">${fmtEUR(epargne)}</div></div>
    <div class="kpi" style="--kpi-accent:${sr >= 0.2 ? "#10b981" : sr >= 0.1 ? "#d97706" : "#ef4444"}"><div class="kpi-label">📈 Taux d'épargne</div><div class="kpi-value">${fmtPct(sr, 1)}</div></div>
  `;

  let list = monthList;
  if (App.txFilter !== "all") list = list.filter(t => t.type === App.txFilter);
  list.sort((a, b) => b.date.localeCompare(a.date));

  renderAccountFilter(s);

  const el = document.getElementById("txTable");
  if (list.length === 0) {
    App.txSelection.clear();
    renderTxSelBar();
    el.innerHTML = App.txAccounts.size > 0 && monthList.length === 0
      ? `<div class="empty-state"><span class="big">💳</span>Aucune transaction sur ce mois pour ${App.txAccounts.size} compte(s) filtré(s).</div>`
      : `<div class="empty-state"><span class="big">🗓️</span>Aucune transaction sur ce mois.</div>`;
    return;
  }

  const allSelected = list.length > 0 && list.every(t => App.txSelection.has(t.id));
  el.innerHTML = `<table>
    <thead><tr>
      <th class="sel-col"><input type="checkbox" id="txSelAll" title="Tout sélectionner" ${allSelected ? "checked" : ""}></th>
      <th>Transaction</th><th>Date</th><th>Compte</th><th>Type</th><th>Nature</th><th class="right">Montant</th><th></th>
    </tr></thead>
    <tbody>
      ${list.map(t => {
        const cat = CAT_BY_ID[t.category];
        const acct = s.accounts.find(a => a.id === t.account);
        const inc = t.type === "income";
        const necessity = t.type === "expense" ? NECESSITY_META[t.necessity] : null;
        const txBien = t.bien ? bienById(s, t.bien) : null;
        const sel = App.txSelection.has(t.id);
        return `
        <tr class="${sel ? "sel-row" : ""}">
          <td class="sel-col"><input type="checkbox" class="tx-sel" data-sel-tx="${t.id}" title="Sélectionner" ${sel ? "checked" : ""}></td>
          <td>
            <div class="tx-main">
              <div class="tx-ico">${cat ? cat.icon : "💸"}</div>
              <div>
                <div class="tx-label">${escapeHtml(t.label)}</div>
                <div class="tx-sub">${cat ? escapeHtml(cat.label) : ""}${t.recurring ? " · 🔁" : ""}${txBien ? ` · 🏠 ${escapeHtml(txBien.name)}` : ""}</div>
              </div>
            </div>
          </td>
          <td class="muted">${dayLabel(t.date)}</td>
          <td class="muted">${acct ? escapeHtml(acct.name) : "—"}</td>
          <td>${inc ? `<span class="chip success">Revenu</span>` : `<span class="chip danger">Dépense</span>`}</td>
          <td>${necessity ? `<span class="chip" style="background:${necessity.color}18;color:${necessity.color}">${necessity.label}</span>` : ""}</td>
          <td class="tx-amount ${inc ? "income" : "expense"}">${inc ? "+" : "−"}${fmtEUR(t.amount)}</td>
          <td>
            <button class="act-btn" data-edit-tx="${t.id}" title="Modifier">✎</button>
            <button class="act-btn" data-dup-tx="${t.id}" title="Dupliquer">⧉</button>
            <button class="act-btn del" data-del-tx="${t.id}" title="Supprimer">🗑</button>
          </td>
        </tr>`;
      }).join("")}
    </tbody></table>`;

  document.querySelectorAll("[data-edit-tx]").forEach(b => b.addEventListener("click", () => {
    const t = s.transactions.find(x => x.id === b.dataset.editTx);
    if (t) openTxModal(t);
  }));
  document.querySelectorAll("[data-dup-tx]").forEach(b => b.addEventListener("click", () => {
    const t = s.transactions.find(x => x.id === b.dataset.dupTx);
    if (!t) return;
    s.transactions.push({ ...t, id: uid("t") });
    saveState(s); renderAll(); toast("Transaction dupliquée", "success");
  }));
  document.querySelectorAll("[data-del-tx]").forEach(b => b.addEventListener("click", () => {
    const t = s.transactions.find(x => x.id === b.dataset.delTx);
    if (t && confirm("Supprimer cette transaction ?")) {
      s.transactions = s.transactions.filter(x => x.id !== b.dataset.delTx);
      stopRecurringAfterDelete(s, [t]);
      saveState(s); renderAll(); toast("Transaction supprimée", "danger");
    }
  }));
  /* État « indéterminé » du tout-sélectionner quand seule une partie est cochée */
  const selAllBox = document.getElementById("txSelAll");
  if (selAllBox) selAllBox.indeterminate = !allSelected && list.some(t => App.txSelection.has(t.id));
  renderTxSelBar();
}

/* Barre d'actions de sélection multiple : visible dès qu'au moins une
   transaction est cochée. */
function renderTxSelBar() {
  const bar = document.getElementById("txSelBar");
  if (!bar) return;
  const n = App.txSelection.size;
  bar.hidden = n === 0;
  if (n > 0) {
    const el = document.getElementById("txSelCount");
    if (el) el.textContent = n + " transaction" + (n > 1 ? "s" : "") + " sélectionnée" + (n > 1 ? "s" : "");
  }
}

/* Filtre multi-comptes : liste de cases à cocher + libellé du bouton. */
function renderAccountFilter(s) {
  const btn = document.getElementById("acctFilterBtn");
  const listEl = document.getElementById("acctFilterList");
  if (!btn || !listEl) return;
  const n = App.txAccounts.size;
  btn.innerHTML = "💳 " + (n === 0 ? "Tous les comptes" : n + " compte" + (n > 1 ? "s" : "")) + " ▾";
  listEl.innerHTML = s.accounts.map(a => {
    const t = accountMeta(a.type);
    return `
      <label class="acct-filter-item">
        <input type="checkbox" data-acct-filter="${a.id}" ${App.txAccounts.has(a.id) ? "checked" : ""}>
        <span class="acct-filter-ico">${t.icon}</span>
        <span class="acct-filter-name">${escapeHtml(a.name)}</span>
        <b class="acct-filter-bal">${fmtEUR0(a.balance)}</b>
      </label>`;
  }).join("");
}

/* ---------- Import de transactions ---------- */
let _impRows = [];
let _impErrors = [];

function openImportModal() {
  const s = App.state;
  const sel = document.getElementById("impAccount");
  sel.innerHTML = s.accounts
    .map(a => `<option value="${a.id}">${accountMeta(a.type).icon} ${escapeHtml(a.name)} · ${fmtEUR0(a.balance)}</option>`)
    .join("");
  document.getElementById("impText").value = "";
  document.getElementById("impFile").value = "";
  _impRows = []; _impErrors = [];
  renderImportPreview();
  openModal("modalImport");
}

function renderImportPreview() {
  const wrap = document.getElementById("impPreview");
  const submit = document.getElementById("impSubmit");
  if (!wrap) return;
  submit.disabled = _impRows.length === 0;
  if (_impRows.length === 0 && _impErrors.length === 0) {
    wrap.innerHTML = `<div class="imp-hint">📋 Collez un export bancaire ou choisissez un fichier CSV : chaque ligne est une transaction. Entêtes reconnus : <code>Date;Libellé;Montant</code>, <code>Date;Libellé;Débit;Crédit</code>…</div>`;
    return;
  }
  const list = _impRows.slice(0, 12);
  const errs = _impErrors.slice(0, 4);
  wrap.innerHTML = `
    <div class="imp-summary">${_impRows.length} transaction(s) prête(s) à importer${_impErrors.length ? ` · ${_impErrors.length} ligne(s) ignorée(s)` : ""}</div>
    ${list.length ? `<div class="table-wrap imp-table"><table>
      <thead><tr><th>Date</th><th>Libellé</th><th>Type</th><th>Catégorie</th><th class="right">Montant</th></tr></thead>
      <tbody>${list.map(r => `
        <tr>
          <td class="muted">${dayLabel(r.date)}</td>
          <td>${escapeHtml(r.label)}</td>
          <td>${r.type === "income" ? `<span class="chip success">Revenu</span>` : `<span class="chip danger">Dépense</span>`}</td>
          <td class="muted">${escapeHtml((CAT_BY_ID[r.category] || {}).label || r.category)}</td>
          <td class="tx-amount ${r.type === "income" ? "income" : "expense"}">${r.type === "income" ? "+" : "−"}${fmtEUR(r.amount)}</td>
        </tr>`).join("")}</tbody>
    </table>${_impRows.length > list.length ? `<div class="imp-more">+ ${_impRows.length - list.length} autres…</div>` : ""}</div>` : ""}
    ${errs.length ? `<div class="imp-errors">${errs.map(e => `<div>⚠️ ${escapeHtml(e)}</div>`).join("")}${_impErrors.length > errs.length ? `<div>… et ${_impErrors.length - errs.length} autre(s) ligne(s) ignorée(s).</div>` : ""}</div>` : ""}
  `;
}

function handleImpText(text) {
  const parsed = parseTxImport(text);
  _impRows = parsed.rows;
  _impErrors = parsed.errors;
  renderImportPreview();
}

/* Export CSV du mois affiché (respecte le filtre comptes et l'onglet type),
   au format Date;Libellé;Montant compatible avec l'import. */
function exportTxCSV() {
  const s = App.state;
  const key = App.txMonth;
  let list = txOfMonth(s, key);
  if (App.txAccounts.size > 0) list = list.filter(t => App.txAccounts.has(t.account));
  if (App.txFilter !== "all") list = list.filter(t => t.type === App.txFilter);
  if (list.length === 0) {
    toast("Rien à exporter sur ce mois", "danger");
    return;
  }
  list.sort((a, b) => a.date.localeCompare(b.date));
  const csv = serializeTxCSV(list);
  /* BOM UTF-8 : Excel ouvre les accents correctement */
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "transactions-" + key + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(list.length + " transaction" + (list.length > 1 ? "s" : "") + " exportée" + (list.length > 1 ? "s" : ""), "success");
}

/* ---------- Prêts ---------- */
function renderLoans() {
  const s = App.state;
  const debts = totalDebt(s);
  const monthly = monthlyDebtPayments(s);
  const dr = debtRatio(s);

  document.getElementById("loansKpis").innerHTML = `
    <div class="kpi" style="--kpi-accent:#ef4444"><div class="kpi-label">🏦 Capital restant</div><div class="kpi-value">${fmtEUR0(debts)}</div></div>
    <div class="kpi" style="--kpi-accent:#f59e0b"><div class="kpi-label">📅 Mensualités totales</div><div class="kpi-value">${fmtEUR0(monthly)}</div></div>
    <div class="kpi" style="--kpi-accent:${dr !== null && dr <= 0.35 ? "#16a34a" : "#ef4444"}"><div class="kpi-label">🧮 Ratio d'endettement</div><div class="kpi-value">${dr !== null ? fmtPct(dr, 1) : "—"}</div></div>
    <div class="kpi" style="--kpi-accent:#3b6df0"><div class="kpi-label">🔢 Nombre de crédits</div><div class="kpi-value">${s.loans.length}</div></div>
  `;

  const el = document.getElementById("loansList");
  if (s.loans.length === 0) {
    el.innerHTML = `<div class="empty-state"><span class="big">🏠</span>Aucun prêt en cours.</div>`;
    return;
  }

  el.innerHTML = s.loans.map(l => {
    const t = LOAN_TYPES[l.type] || LOAN_TYPES.autre;
    const holder = loanHolder(s, l);
    const holderLabel = holder.kind === "entity"
      ? "🏢 " + escapeHtml((holdingById(s, holder.id) || {}).name || holder.id)
      : "👤 " + escapeHtml((PERSONS.find(p => p.id === holder.id) || {}).name || holder.id);
    const paidPct = l.initial > 0 ? Math.max(0, Math.min(100, Math.round(((l.initial - l.remaining) / l.initial) * 100))) : 0;
    const monthsLeft = l.monthly > 0 ? Math.ceil(l.remaining / l.monthly) : 0;
    const y = Math.floor(monthsLeft / 12), m = monthsLeft % 12;
    return `
      <div class="loan-card">
        <div class="loan-top">
          <div>
            <div class="loan-name"><span class="ico">${t.icon}</span> ${escapeHtml(l.name)}</div>
            <div class="loan-meta">${holderLabel} · ${escapeHtml(l.institution || "—")} · Taux ${fmtNum(l.rate)} % · depuis ${l.start ? dayLabel(l.start) : "—"}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="act-btn" data-edit-loan="${l.id}" title="Modifier">✎</button>
            <button class="act-btn del" data-del-loan="${l.id}" title="Supprimer">🗑</button>
          </div>
        </div>
        <div class="loan-stats">
          <div class="loan-stat"><b>${fmtEUR0(l.remaining)}</b><span>Capital restant</span></div>
          <div class="loan-stat"><b>${fmtEUR(l.monthly)}</b><span>Mensualité</span></div>
          <div class="loan-stat"><b>${fmtNum(l.rate)} %</b><span>Taux nominal</span></div>
          <div class="loan-stat"><b>${y > 0 ? y + " an" + (y > 1 ? "s" : "") + (m > 0 ? " " + m + " mois" : "") : m + " mois"}</b><span>Restant estimé</span></div>
        </div>
        <div class="health-part">
          <div class="health-part-top"><span>Remboursement</span><span>${paidPct} %</span></div>
          <div class="bar"><div class="bar-fill" style="width:${paidPct}%;--bar-c:#3b6df0"></div></div>
        </div>
      </div>`;
  }).join("");

  document.querySelectorAll("[data-edit-loan]").forEach(b => b.addEventListener("click", () => {
    const l = s.loans.find(x => x.id === b.dataset.editLoan);
    if (l) openLoanModal(l);
  }));
  document.querySelectorAll("[data-del-loan]").forEach(b => b.addEventListener("click", () => {
    if (confirm("Supprimer ce prêt ?")) {
      s.loans = s.loans.filter(x => x.id !== b.dataset.delLoan);
      saveState(s); renderAll(); toast("Prêt supprimé", "danger");
    }
  }));
}

/* ---------- Biens immobiliers ---------- */
function renderRealEstate() {
  const s = App.state;
  const biens = biensConfig(s);
  const totalValue = biens.reduce((x, b) => x + bienValue(s, b), 0);
  const totalDebt = biens.reduce((x, b) => x + bienDebt(s, b), 0);
  const totalEquity = totalValue - totalDebt;
  const totalCf = biens.reduce((x, b) => x + bienFlows(s, b).cashflowMonthly, 0);
  const totalAnnual = biens.reduce((x, b) => x + bienAnnualFlows(s, b).cashflowNet, 0);
  const rented = biens.filter(b => b.status === "loue");
  const yields = rented.map(b => bienGrossYield(s, b)).filter(y => y !== null);
  const avgYield = yields.length ? yields.reduce((a, b) => a + b, 0) / yields.length : null;
  const trav = biens.reduce((acc, b) => {
    const t = bienTravaux(s, b);
    return { budget: acc.budget + t.budget, spent: acc.spent + t.spent };
  }, { budget: 0, spent: 0 });

  document.getElementById("reKpis").innerHTML = `
    <div class="kpi" style="--kpi-accent:#14b8a6">
      <div class="kpi-label">🏘️ Valeur du parc</div>
      <div class="kpi-value">${fmtEUR0(totalValue)}</div>
      <div class="kpi-delta neutral">${biens.length} bien(s) déclaré(s)</div>
    </div>
    <div class="kpi" style="--kpi-accent:#ef4444">
      <div class="kpi-label">🏦 Dette liée</div>
      <div class="kpi-value">${fmtEUR0(totalDebt)}</div>
      <div class="kpi-delta ${totalDebt > 0 ? "neg" : "neutral"}">Prêts immo + travaux</div>
    </div>
    <div class="kpi" style="--kpi-accent:${totalEquity < 0 ? "#ef4444" : "#16a34a"}">
      <div class="kpi-label">💎 Fonds propres cumulés</div>
      <div class="kpi-value ${totalEquity < 0 ? "neg" : "pos"}">${fmtEUR0(totalEquity)}</div>
      <div class="kpi-delta neutral">Valeur − dette</div>
    </div>
    <div class="kpi" style="--kpi-accent:${totalCf < 0 ? "#f59e0b" : "#16a34a"}">
      <div class="kpi-label">💸 Cashflow net mensuel</div>
      <div class="kpi-value ${totalCf < 0 ? "neg" : "pos"}">${totalCf < 0 ? "−" : "+"}${fmtEUR(Math.abs(totalCf))}</div>
      <div class="kpi-delta neutral">≈ ${totalAnnual < 0 ? "−" : "+"}${fmtEUR0(Math.abs(totalAnnual))}/an · flux récurrents liés</div>
    </div>
    <div class="kpi" style="--kpi-accent:#8b5cf6">
      <div class="kpi-label">📈 Rendement brut moyen</div>
      <div class="kpi-value">${avgYield !== null ? fmtPct(avgYield, 1) : "—"}</div>
      <div class="kpi-delta neutral">Biens loués · objectif 3-5 %</div>
    </div>
    <div class="kpi" style="--kpi-accent:${trav.budget > 0 && trav.spent > trav.budget ? "#ef4444" : "#3b6df0"}">
      <div class="kpi-label">🚧 Travaux</div>
      <div class="kpi-value">${fmtEUR0(trav.spent)}</div>
      <div class="kpi-delta neutral">sur ${fmtEUR0(trav.budget)} de budget</div>
    </div>
  `;

  renderRealEstateChart("chartRealEstate", s);
  renderRealEstateAnnualChart("chartRealEstateAnnual", s);

  const el = document.getElementById("reBiens");
  if (biens.length === 0) {
    el.innerHTML = `<div class="empty-state"><span class="big">🏘️</span>Aucun bien immobilier déclaré. Ajoutez votre premier bien pour suivre sa valeur, son cashflow et ses travaux.</div>`;
    return;
  }
  el.innerHTML = `<div class="re-grid">` + biens.map(b => renderBienCard(s, b)).join("") + `</div>`;

  document.querySelectorAll("[data-edit-bien]").forEach(b => b.addEventListener("click", () => {
    const bien = biens.find(x => x.id === b.dataset.editBien);
    if (bien) openBienModal(bien);
  }));
  document.querySelectorAll("[data-del-bien]").forEach(b => b.addEventListener("click", () => {
    if (confirm("Supprimer ce bien ? Les comptes et prêts liés seront conservés, mais le compte de valorisation sera retiré des sociétés.")) {
      const bien = biens.find(x => x.id === b.dataset.delBien);
      const accIds = bien ? (bien.accountIds || []) : [];
      /* Seul le compte de VALORISATION (immo) est rattaché à une société via le
         bien : on le détache. Les comptes courants partagés (ex : CA - SCI TODA
         Compte) restent attachés à leur société — ils sont gérés par la page Comptes. */
      const immoIds = accIds.filter(aid => { const a = s.accounts.find(x => x.id === aid); return a && a.type === "immo"; });
      holdingsConfig(s).entities.forEach(e => {
        e.accountIds = (e.accountIds || []).filter(aid => !immoIds.includes(aid));
      });
      /* Retire le compte de valorisation (immo) du bien, garde les comptes courants liés */
      s.accounts = s.accounts.filter(a => !immoIds.includes(a.id));
      s.biens = biensConfig(s).filter(x => x.id !== b.dataset.delBien);
      saveState(s); renderAll(); toast("Bien supprimé", "danger");
    }
  }));
}

function renderBienCard(s, b) {
  const value = bienValue(s, b);
  const debt = bienDebt(s, b);
  const equity = value - debt;
  const f = bienFlows(s, b);
  const a = bienAnnualFlows(s, b, f);
  const cashYield = bienCashYield(s, b, a);
  const gross = bienGrossYield(s, b);
  const net = bienNetYield(s, b);
  const t = bienTravaux(s, b);
  const reserve = bienReserveMonths(s, b);
  const owner = bienOwner(s, b);
  const ownerLabel = owner.kind === "entity"
    ? "Entreprise · " + escapeHtml((holdingById(s, owner.id) || {}).name || owner.id)
    : "Personne · " + escapeHtml((PERSONS.find(p => p.id === owner.id) || {}).name || owner.id);
  const loans = bienLoans(s, b);
  const linkedAccounts = (b.accountIds || []).map(id => s.accounts.find(a => a.id === id)).filter(a => a && a.type !== "immo");
  const txCount = s.transactions.filter(t => t.bien === b.id && lastNMonthKeys(12).includes(monthOf(t.date))).length;
  const statusMeta = {
    loue: { label: "Loué", color: "#16a34a" },
    en_travaux: { label: "En travaux", color: "#d97706" },
    vacant: { label: "Vacant", color: "#dc2626" },
  }[b.status] || { label: b.status, color: "#6b7280" };
  const debtPct = value > 0 ? Math.min(100, Math.round((debt / value) * 100)) : 0;
  const travPct = t.budget > 0 ? Math.min(100, Math.round((t.spent / t.budget) * 100)) : 0;
  return `
    <div class="card re-card">
      <div class="re-top">
        <div class="acct-ico" style="background:#14b8a61a">🏠</div>
        <div>
          <div class="acct-name">${escapeHtml(b.name)}</div>
          <div class="acct-inst">${ownerLabel} · ${fmtEUR0(value)}</div>
          ${b.address ? `<div class="acct-inst">📍 ${escapeHtml(b.address)}</div>` : ""}
        </div>
        <span class="chip" style="background:${statusMeta.color}18;color:${statusMeta.color}">${statusMeta.label}</span>
        <div style="display:flex;gap:2px">
          <button class="act-btn" data-edit-bien="${b.id}" title="Modifier">✎</button>
          <button class="act-btn del" data-del-bien="${b.id}" title="Supprimer">🗑</button>
        </div>
      </div>
      <div class="re-values">
        <div class="re-value"><b>${fmtEUR0(value)}</b><span>Valeur</span></div>
        <div class="re-value"><b>${fmtEUR0(debt)}</b><span>Dette liée</span></div>
        <div class="re-value ${equity < 0 ? "neg" : ""}"><b>${fmtEUR0(equity)}</b><span>Fonds propres</span></div>
        <div class="re-value"><b>${gross !== null ? fmtPct(gross, 1) : "—"}</b><span>Rendement brut</span></div>
        <div class="re-value"><b>${net !== null ? fmtPct(net, 1) : "—"}</b><span>Rendement net</span></div>
      </div>
      <div class="health-part" style="margin-top:12px">
        <div class="health-part-top"><span>Levier (dette / valeur)</span><span>${fmtPct(debtPct / 100)}</span></div>
        <div class="bar"><div class="bar-fill" style="width:${debtPct}%;--bar-c:${debtPct > 80 ? "#dc2626" : debtPct > 60 ? "#d97706" : "#14b8a6"}"></div></div>
      </div>
      <div class="re-cashflow">
        <div class="re-cf-line"><span>Loyers</span><b class="pos">+${fmtEUR(f.incomeMonthly)}</b></div>
        <div class="re-cf-line"><span>Charges</span><b class="neg">−${fmtEUR(f.chargesMonthly)}</b></div>
        <div class="re-cf-line"><span>Prêts</span><b class="neg">−${fmtEUR(f.loansMonthly)}</b></div>
        <div class="re-cf-line ${f.cashflowMonthly < 0 ? "neg" : "pos"}"><b class="${f.cashflowMonthly < 0 ? "neg" : "pos"}">${f.cashflowMonthly < 0 ? "−" : "+"}${fmtEUR(Math.abs(f.cashflowMonthly))}</b><span>Cashflow net /mois</span></div>
      </div>
      <div class="re-annual">
        <div class="re-annual-title">📅 Performance annuelle <span class="muted">· annualisée (flux récurrents liés)</span></div>
        <div class="re-annual-grid">
          <div class="re-annual-cell"><span>Revenus</span><b class="pos">${fmtEUR0(a.income)}</b></div>
          <div class="re-annual-cell"><span>Charges</span><b class="neg">−${fmtEUR0(a.charges)}</b></div>
          <div class="re-annual-cell"><span>Prêts</span><b class="neg">−${fmtEUR0(a.loans)}</b></div>
          <div class="re-annual-cell ${a.cashflowNet < 0 ? "neg" : ""}"><span>Cashflow net</span><b class="${a.cashflowNet < 0 ? "neg" : "pos"}">${a.cashflowNet < 0 ? "−" : "+"}${fmtEUR0(Math.abs(a.cashflowNet))}</b></div>
        </div>
        ${cashYield !== null ? `
        <div class="re-yield">Rendement net (cash-on-cash) <b class="${cashYield < 0 ? "neg" : "pos"}">${fmtPct(cashYield, 1)}</b></div>` : ""}
      </div>
      ${t.budget > 0 ? `
      <div class="health-part" style="margin-top:12px">
        <div class="health-part-top"><span>🚧 Travaux — budget</span><span>${fmtEUR0(t.spent)} / ${fmtEUR0(t.budget)} (${fmtPct(travPct / 100)})</span></div>
        <div class="bar"><div class="bar-fill" style="width:${travPct}%;--bar-c:${t.spent > t.budget ? "#dc2626" : travPct >= 80 ? "#d97706" : "#8b5cf6"}"></div></div>
      </div>` : ""}
      ${reserve !== null ? `<div class="re-reserve"><span>Réserve de trésorerie</span><b class="${reserve < 6 ? "neg" : "pos"}">${reserve.toFixed(1)} mois</b></div>` : ""}
      ${linkedAccounts.length ? `<div class="re-loans">${linkedAccounts.map(a => `<span class="mini-chip">${accountMeta(a.type).icon} ${escapeHtml(a.name)} · ${fmtEUR0(a.balance)}</span>`).join("")}</div>` : ""}
      ${loans.length ? `<div class="re-loans">${loans.map(l => `<span class="mini-chip">🏠 ${escapeHtml(l.name)} · ${fmtEUR0(l.remaining)}</span>`).join("")}</div>` : ""}
      ${txCount > 0 ? `<div class="re-reserve"><span>📄 Transactions liées (12 mois)</span><b>${txCount}</b></div>` : ""}
    </div>`;
}

/* Options de sélection « personne OU entreprise » (propriétaire de bien,
   détenteur de prêt) : personnes physiques + entités des holdings. */
function holderOptions(s) {
  const ent = holdingsConfig(s).entities;
  return `
    <optgroup label="Personnes">${PERSONS.map(p => `<option value="person:${p.id}">👤 ${escapeHtml(p.name)}</option>`).join("")}</optgroup>
    ${ent.length ? `<optgroup label="Entreprises">${ent.map(e => `<option value="entity:${e.id}">${(HOLDING_TYPES[e.type] || HOLDING_TYPES.autre).icon} ${escapeHtml(e.name)}</option>`).join("")}</optgroup>` : ""}`;
}

/* Positionne un select « personne:entreprise » sur une valeur stockée ; si
   l'id ne correspond à aucune option (entité supprimée…), ajoute une option
   d'alerte pour ne JAMAIS réassigner silencieusement à Tommy au submit. */
function setHolderValue(sel, kind, id) {
  const val = kind + ":" + id;
  if (![...sel.options].some(o => o.value === val)) {
    sel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(val)}" disabled>⚠ ${escapeHtml(id)} (introuvable)</option>`);
  }
  sel.value = val;
}

/* ---------- Holdings & sociétés ---------- */
function renderHoldings() {
  const s = App.state;
  const cfg = holdingsConfig(s);
  const per = personHoldingsValue(s);
  const total = totalHoldingsValue(s);
  const div12 = holdingDividends(s)
    .filter(d => lastNMonthKeys(12).includes(d.month))
    .reduce((x, d) => x + (Number(d.amount) || 0), 0);

  document.getElementById("holdingKpis").innerHTML = `
    <div class="kpi" style="--kpi-accent:#8b5cf6">
      <div class="kpi-label">🏛️ Entités</div>
      <div class="kpi-value">${cfg.entities.length}</div>
      <div class="kpi-delta neutral">SASU · SCI · holdings</div>
    </div>
    <div class="kpi" style="--kpi-accent:${total < 0 ? "#ef4444" : "#16a34a"}">
      <div class="kpi-label">💰 Valeur nette consolidée</div>
      <div class="kpi-value ${total < 0 ? "neg" : "pos"}">${total < 0 ? "−" : ""}${fmtEUR0(Math.abs(total))}</div>
      <div class="kpi-delta ${total < 0 ? "neg" : "pos"}">${total < 0 ? "Prêts &gt; actifs liés" : "Dette comprise"}</div>
    </div>
    <div class="kpi" style="--kpi-accent:#ec4899">
      <div class="kpi-label">💸 Dividendes remontés (12 mois)</div>
      <div class="kpi-value ${div12 < 0 ? "neg" : "pos"}">${fmtEUR0(div12)}</div>
      <div class="kpi-delta neutral">Régime mère-fille</div>
    </div>
    ${PERSONS.map(p => `
      <div class="kpi" style="--kpi-accent:${p.color}">
        <div class="kpi-label">👤 ${p.name} (propriété effective)</div>
        <div class="kpi-value ${(per[p.id] || 0) < 0 ? "neg" : "pos"}">${(per[p.id] || 0) < 0 ? "−" : ""}${fmtEUR0(Math.abs(per[p.id] || 0))}</div>
        <div class="kpi-delta neutral">${total !== 0 ? fmtPct(Math.abs(per[p.id] || 0) / Math.abs(total), 1) + " du total" : "—"}</div>
      </div>`).join("")}
  `;

  renderHoldingBars("chartHoldingBars", s);
  renderHoldingOwners("chartHoldingOwners", s);
  renderHoldingTree("holdingTree", s);
  renderHoldingTable("holdingTable", s);
  renderDividendsSection(s);
  renderCashSimulator(s);
}

/* ---------- Simulateur : remontée de trésorerie (mère-fille) ---------- */
function renderCashSimulator(s) {
  const card = document.getElementById("simCard");
  const body = document.getElementById("simBody");
  if (!card || !body) return;
  const base = cashRemittanceSim(s, 0, "holding");
  if (!base) {
    body.innerHTML = `<div class="empty-state"><span class="big">🪙</span>Ajoutez une entité « SCI TODA » avec un compte liquide et une « Space Unity » pour activer le simulateur.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="sim-controls">
      <div class="sim-slider-row">
        <label class="sim-label" id="simLabel" for="simAmount">Montant à remonter</label>
        <input type="range" id="simRange" min="0" max="${base.max}" step="500" value="0">
        <input type="number" id="simAmount" min="0" max="${base.max}" step="500" value="0" inputmode="decimal">
        <span class="sim-max" id="simMax">max ${fmtEUR0(base.max)}</span>
      </div>
      <div class="tabs" id="simStage">
        <button class="tab active" data-stage="holding">🏢 Jusqu'à Space Unity</button>
        <button class="tab" data-stage="perso">👤 Jusqu'à Tommy (perso)</button>
        <button class="tab" data-stage="dividende">💶 Dividende à Tommy (PFU 30 %)</button>
        <button class="tab" data-stage="apport">🏗️ Apport capital (IR-PME ${fmtPct(IR_PME_RATE)})</button>
      </div>
    </div>
    <div class="sim-results" id="simResults"></div>
  `;

  const range = document.getElementById("simRange");
  const amount = document.getElementById("simAmount");
  const label = document.getElementById("simLabel");
  const maxEl = document.getElementById("simMax");
  const stageBtns = body.querySelectorAll("#simStage .tab");

  const refresh = () => {
    const stage = body.querySelector("#simStage .tab.active")?.dataset.stage || "holding";
    /* Le plafond dépend de l'étape : SCI TODA (remontée) ou Space Unity (dividende) */
    const probe = cashRemittanceSim(s, parseFloat(amount.value) || 0, stage);
    if (!probe) return;
    const v = Math.min(Math.max(0, parseFloat(amount.value) || 0), probe.max);
    range.max = probe.max; amount.max = probe.max;
    if (String(range.value) !== String(v)) range.value = v;
    if (String(amount.value) !== String(v)) amount.value = v;
    maxEl.textContent = "max " + fmtEUR0(probe.max);
    label.textContent = probe.isDividend ? "Dividende brut" : probe.isApport ? "Apport au capital" : "Montant à remonter";
    renderSimResults(s, v, stage);
  };

  range.addEventListener("input", refresh);
  amount.addEventListener("input", refresh);
  stageBtns.forEach(b => b.addEventListener("click", () => {
    stageBtns.forEach(x => x.classList.toggle("active", x === b));
    refresh();
  }));
  refresh();
}

function renderSimResults(s, amt, stage) {
  const sim = cashRemittanceSim(s, amt, stage);
  const el = document.getElementById("simResults");
  if (!sim) { el.innerHTML = `<div class="empty-state">Structure mère-fille non détectée.</div>`; return; }
  const isDiv = sim.isDividend;
  const sciMonths = sim.sciMonthly > 0 ? Math.floor(sim.sciAfter / sim.sciMonthly) : null;

  const row = (label, before, after, fmt = fmtEUR0, hint = "") => {
    const d = after - before;
    const cls = Math.abs(d) < 0.005 ? "same" : d > 0 ? "pos" : "neg";
    return `
      <div class="sim-row">
        <span class="sim-row-label">${escapeHtml(label)}${hint ? `<span class="sim-hint">${hint}</span>` : ""}</span>
        <span class="sim-row-vals">
          <b>${fmt(before)}</b>
          <span class="sim-arrow ${cls}">${cls === "same" ? "→" : cls === "pos" ? "▲" : "▼"}</span>
          <b class="${cls}">${fmt(after)}</b>
        </span>
      </div>`;
  };
  const mosFmt = v => v === null ? "—" : v.toFixed(1) + " mois";
  const scoreFmt = v => v + "/100";

  /* Bandeau dividende : brut → PFU retenu à la source → net perçu par Tommy */
  const pfuStrip = isDiv && amt > 0 ? `
    <div class="sim-pfu">
      <div class="sim-pfu-title">💶 Dividende ${escapeHtml(sim.suName)} → Tommy</div>
      <div class="sim-pfu-line"><span>Dividende brut</span><b>${fmtEUR(sim.gross)}</b></div>
      <div class="sim-pfu-line tax"><span>PFU 30 % retenu à la source <span class="sim-hint">12,8 % IR + 17,2 % prélèv. sociaux</span></span><b>−${fmtEUR(sim.tax)}</b></div>
      <div class="sim-pfu-line net"><span>Net perçu par Tommy</span><b class="pos">+${fmtEUR(sim.net)}</b></div>
    </div>` : "";

  /* Bandeau apport au capital : apport → crédit d'impôt IR-PME → coût net pour Tommy */
  const apportStrip = sim.isApport && amt > 0 ? `
    <div class="sim-pfu">
      <div class="sim-pfu-title">🏗️ Apport au capital de ${escapeHtml(sim.suName)} (SASU Tommy)</div>
      <div class="sim-pfu-line"><span>Apport brut (poche perso → SASU)</span><b>−${fmtEUR(sim.gross)}</b></div>
      <div class="sim-pfu-line credit"><span>Crédit d'impôt IR-PME <span class="sim-hint">${fmtPct(IR_PME_RATE)} · plafond ${fmtEUR0(IR_PME_CAP)}/an</span></span><b class="pos">+${fmtEUR(sim.credit)}</b></div>
      <div class="sim-pfu-line net"><span>Coût net pour Tommy</span><b class="neg">−${fmtEUR(sim.gross - sim.credit)}</b></div>
    </div>` : "";

  const blocks = [
    { title: "🏦 Liquidités en sociétés", rows: [
      row(sim.sciName, sim.sciBal, sim.sciAfter),
      row(sim.suName, sim.suBal, sim.suAfter),
      row("Total sociétés", sim.cLiqBefore, sim.cLiqAfter),
      sciMonths !== null ? `<div class="sim-row"><span class="sim-row-label">Trésorerie SCI TODA <span class="sim-hint">~${fmtEUR0(sim.sciMonthly)}/mois de prêts</span></span><span class="sim-row-vals"><b>${sciMonths} mois d'échéances</b></span></div>` : "",
    ].join("") },
    { title: "👤 Propriété effective du cash", rows: [
      row("Tommy", sim.effTommyBefore, sim.effTommyAfter),
      row("David", sim.effDavidBefore, sim.effDavidAfter),
    ].join("") },
    { title: "🛟 Coussin personnel", rows: [
      row("Liquidités perso", sim.pLiqBefore, sim.pLiqAfter),
      row("Mois de sécurité", sim.mosBefore, sim.mosAfter, mosFmt),
      row("Score de santé", sim.scoreBefore, sim.scoreAfter, scoreFmt),
    ].join("") },
  ];

  el.innerHTML = `
    ${pfuStrip}
    ${apportStrip}
    <div class="sim-grid">
      ${blocks.map(b => `
        <div class="sim-block">
          <div class="sim-block-title">${b.title}</div>
          ${b.rows}
        </div>`).join("")}
    </div>
    <div class="sim-note" id="simNote"></div>
  `;

  const note = document.getElementById("simNote");
  if (amt <= 0) {
    note.innerHTML = "💡 Ajustez le montant pour voir l'impact instantané de la remontée de trésorerie.";
  } else if (sim.isApport) {
    note.innerHTML = `💡 Tommy injecte <b>${fmtEUR0(sim.gross)}</b> au capital de sa SASU (détenue à 100 %). L'opération ouvre droit au <b>crédit d'impôt IR-PME de ${fmtEUR0(sim.credit)}</b> (${fmtPct(IR_PME_RATE)} du montant, plafonné à ${fmtEUR0(IR_PME_CAP)}/an — art. 199 terdecies-0 B du CGI) : le coût net pour Tommy est de <b>${fmtEUR0(sim.gross - sim.credit)}</b>. Comme Space Unity lui appartient, sa richesse effective augmente même de <b>${fmtEUR0(sim.credit)}</b> (la trésorerie de la SASU, ${fmtEUR0(sim.suBal)} → ${fmtEUR0(sim.suAfter)}, lui appartient à 100 %). Conditions : PME éligible (jeune société &lt; 7 ans, conservation 5 ans, secteurs éligibles) — pour une holding, le régime IR-PME est soumis à des conditions strictes de détention (objet social exclusif de détention de participations éligibles).`;
  } else if (isDiv) {
    note.innerHTML = `💡 Space Unity (100 % Tommy) verse un dividende brut de <b>${fmtEUR0(sim.gross)}</b> à Tommy. Le prélèvement forfaitaire unique (PFU) de 30 % (<b>${fmtEUR0(sim.tax)}</b> : 12,8 % d'impôt sur le revenu + 17,2 % de prélèvements sociaux) est retenu à la source : Tommy perçoit <b>${fmtEUR0(sim.net)}</b> net sur son compte perso. Le cash quitte les sociétés (Total sociétés ${fmtEUR0(sim.cLiqBefore)} → ${fmtEUR0(sim.cLiqAfter)}).`;
  } else if (sim.toPerson) {
    note.innerHTML = `💡 La remontée jusqu'à Tommy augmente vos liquidités personnelles de <b>${fmtEUR0(sim.net)}</b> et votre coussin de sécurité, mais retire ce cash des sociétés (Total sociétés ${fmtEUR0(sim.cLiqBefore)} → ${fmtEUR0(sim.cLiqAfter)}).`;
  } else {
    const tShare = sim.sciTommyShare || 0;
    note.innerHTML = `💡 Le cash reste en sociétés : il quitte la SCI TODA (${fmtPct(tShare, 1)} Tommy) pour Space Unity (100 % Tommy). Tommy gagne <b>${fmtEUR0(sim.effTommyAfter - sim.effTommyBefore)}</b> de propriété effective du cash — la part de David (${fmtPct(sim.sciDavidShare || 0, 1)}) reste bloquée dans la SCI.`;
  }
}

/* ---------- Registre des dividendes (mère-fille) ---------- */
function renderDividendsSection(s) {
  const divs = holdingDividends(s).slice().sort((a, b) => b.month.localeCompare(a.month));
  const el = document.getElementById("dividendTable");
  const entName = id => { const e = holdingById(s, id); return e ? e.name : id; };
  if (divs.length === 0) {
    el.innerHTML = `<div class="empty-state"><span class="big">💸</span>Aucun dividende remonté enregistré.<br>Enregistrez une remontée de trésorerie de la fille vers sa mère (ex : SCI TODA → Space Unity).</div>`;
  } else {
    el.innerHTML = `<table>
      <thead><tr><th>Fille (verse)</th><th>Mère (reçoit)</th><th>Mois</th><th class="right">Montant</th><th>Note</th><th></th></tr></thead>
      <tbody>
        ${divs.map(d => `
          <tr>
            <td><div class="tx-main"><div class="tx-ico">🏢</div><div><div class="tx-label">${escapeHtml(entName(d.from))}</div></div></div></td>
            <td class="muted">${escapeHtml(entName(d.to))}</td>
            <td class="muted">${monthLabel(d.month)}</td>
            <td class="tx-amount income">${fmtEUR(d.amount)}</td>
            <td class="muted">${d.note ? escapeHtml(d.note) : "—"}</td>
            <td>
              <button class="act-btn" data-edit-div="${d.id}" title="Modifier">✎</button>
              <button class="act-btn del" data-del-div="${d.id}" title="Supprimer">🗑</button>
            </td>
          </tr>`).join("")}
      </tbody></table>`;
  }

  document.querySelectorAll("[data-edit-div]").forEach(b => b.addEventListener("click", () => {
    const d = holdingDividends(s).find(x => x.id === b.dataset.editDiv);
    if (d) openDividendModal(d);
  }));
  document.querySelectorAll("[data-del-div]").forEach(b => b.addEventListener("click", () => {
    if (confirm("Supprimer cette remontée de dividende ?")) {
      s.holdings.dividends = holdingDividends(s).filter(x => x.id !== b.dataset.delDiv);
      saveState(s); renderAll(); toast("Dividende supprimé", "danger");
    }
  }));

  renderDividendChart("chartDividends", s);
}

function openDividendModal(record) {
  const s = App.state;
  const ents = holdingsConfig(s).entities;
  document.getElementById("dividendModalTitle").textContent = record ? "Modifier la remontée" : "Enregistrer un dividende";
  document.getElementById("dividendId").value = record ? record.id : "";
  const fromSel = document.getElementById("dividendFrom");
  fromSel.innerHTML = ents.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("");
  const toSel = document.getElementById("dividendTo");
  toSel.innerHTML = ents.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("");
  if (record) {
    fromSel.value = record.from;
    toSel.value = record.to;
    document.getElementById("dividendMonth").value = record.month;
    document.getElementById("dividendAmount").value = record.amount;
    document.getElementById("dividendNote").value = record.note || "";
  } else {
    /* Pré-sélection : SCI TODA → première société qui la détient */
    const defaultFrom = ents.find(e => e.id === "h-toda") || ents[0];
    if (defaultFrom) {
      fromSel.value = defaultFrom.id;
      const mother = (defaultFrom.owners || []).find(o => o.kind === "entity");
      toSel.value = mother ? mother.id : (ents.find(e => e.id !== defaultFrom.id)?.id || "");
    }
    document.getElementById("dividendMonth").value = currentMonthKey();
    document.getElementById("dividendAmount").value = "";
    document.getElementById("dividendNote").value = "";
  }
  updateDividendHint();
  openModal("modalDividend");
}

function updateDividendHint() {
  const s = App.state;
  const from = document.getElementById("dividendFrom").value;
  const to = document.getElementById("dividendTo").value;
  const f = holdingById(s, from);
  const owner = f && (f.owners || []).find(o => o.kind === "entity" && o.id === to);
  const hint = document.getElementById("dividendHint");
  const ok = !!owner;
  hint.style.color = ok ? "var(--success)" : "var(--danger)";
  hint.innerHTML = ok
    ? "✅ " + escapeHtml(f.name) + " est détenue à " + fmtPct((Number(owner.share) || 0) / 100, 1) + " par " + escapeHtml((holdingById(s, to) || {}).name || to) + " — régime mère-fille éligible (95 % du dividende exonéré d'IS sous conditions : détention ≥ 5 % depuis ≥ 2 ans)."
    : "⚠️ La société bénéficiaire doit être associée de la société qui verse (détention mère-fille).";
}

function renderHoldingTree(elId, state) {
  const el = document.getElementById(elId);
  const cfg = holdingsConfig(state);
  if (cfg.entities.length === 0) {
    el.innerHTML = `<div class="empty-state"><span class="big">🏛️</span>Aucune entité déclarée. Ajoutez votre première société pour tracer sa détention.</div>`;
    return;
  }
  const effAll = effectiveOwnership(state);
  el.innerHTML = cfg.entities.map(e => {
    const type = HOLDING_TYPES[e.type] || HOLDING_TYPES.autre;
    const nv = holdingNetValue(state, e);
    const cons = holdingConsolidatedValue(state, e);
    const kids = holdingChildren(state, e.id);
    const divRec = dividendsReceived(state, e.id);
    const divPaid = dividendsPaid(state, e.id);
    const owners = (e.owners || []).map(o => {
      if (o.kind === "person") {
        const p = PERSONS.find(x => x.id === o.id);
        return `
          <div class="holding-owner-line">
            <span class="who"><span class="holding-dot" style="background:${p ? p.color : "#94a3b8"}"></span>${p ? escapeHtml(p.name) : escapeHtml(o.id)}</span>
            <span class="pct">${fmtPct((o.share || 0) / 100)}</span>
          </div>`;
      }
      const sub = cfg.entities.find(x => x.id === o.id);
      return `
        <div class="holding-owner-line">
          <span class="who"><span class="holding-dot" style="background:${sub ? sub.color : "#94a3b8"}"></span>🔗 ${sub ? escapeHtml(sub.name) : escapeHtml(o.id)} (société)</span>
          <span class="pct">${fmtPct((o.share || 0) / 100)}</span>
        </div>`;
    }).join("");
    const eff = effAll[e.id] || [];
    const effLines = eff.length > 0 ? `
      <div class="holding-entity-row"><span>Propriété effective</span><b>${eff.map(({ person, share }) => {
        const p = PERSONS.find(x => x.id === person);
        return (p ? p.name : person) + " " + fmtPct(share, 1);
      }).join(" · ")}</b></div>` : "";
    const accts = (e.accountIds || []).map(id => state.accounts.find(a => a.id === id)).filter(Boolean);
    const acctChips = accts.length > 0 ? `
      <div class="holding-accounts">${accts.map(a => `<span class="mini-chip">${accountMeta(a.type).icon} ${escapeHtml(a.name)} <b class="chip-bal">${fmtEUR0(a.balance)}</b></span>`).join("")}</div>` : "";
    const kidsBox = kids.length > 0 ? `
      <div class="holding-sub">
        <div class="holding-sub-title">🔻 Filiales</div>
        ${kids.map(k => {
          const own = (k.owners || []).find(o => o.kind === "entity" && o.id === e.id);
          return `<div class="holding-owner-line">
            <span class="who"><span class="holding-dot" style="background:${k.color || typeColor(k.id)}"></span>${escapeHtml(k.name)}</span>
            <span class="pct">${fmtPct((Number(own && own.share) || 0) / 100)} · ${fmtEUR0(holdingConsolidatedValue(state, k))}</span>
          </div>`;
        }).join("")}
      </div>` : "";
    const divLines = [
      divRec > 0 ? `<div class="holding-entity-row"><span>💸 Dividendes reçus (12 mois)</span><b class="pos">${fmtEUR0(divRec)}</b></div>` : "",
      divPaid > 0 ? `<div class="holding-entity-row"><span>💸 Dividendes versés (12 mois)</span><b class="neg">${fmtEUR0(divPaid)}</b></div>` : "",
    ].join("");
    const consNote = Math.abs(cons - nv) > 0.5 ? `
      <div class="holding-entity-row"><span>Consolidée (mère-fille)</span><b>${fmtEUR0(cons)}</b></div>` : "";
    return `
      <div class="holding-entity" style="--he:${e.color || typeColor(e.id)}">
        <div class="holding-entity-head">
          <div class="acct-ico" style="background:${(e.color || typeColor(e.id))}1a">${type.icon}</div>
          <div>
            <div class="holding-entity-name">${escapeHtml(e.name)}</div>
            <div class="holding-entity-type">${type.label}${e.notes ? " · " + escapeHtml(e.notes) : ""}</div>
          </div>
          <div class="holding-entity-value ${nv < 0 ? "neg" : "pos"}">${fmtEUR0(nv)}</div>
        </div>
        <div class="holding-owners-box">${owners}</div>
        ${effLines}
        ${kidsBox}
        ${consNote}
        ${divLines}
        ${acctChips}
      </div>`;
  }).join("");
  el.innerHTML += `<div class="holding-tree-note">💡 Mère-fille : la valeur consolidée d'une société inclut sa part dans ses filiales (récursif). Ex : Space Unity consolide 75 % de SCI TODA.</div>`;
}

function renderHoldingTable(elId, state) {
  const el = document.getElementById(elId);
  const cfg = holdingsConfig(state);
  if (cfg.entities.length === 0) {
    el.innerHTML = ``;
    return;
  }
  const effAll = effectiveOwnership(state);
  const rows = cfg.entities.map(e => {
    const type = HOLDING_TYPES[e.type] || HOLDING_TYPES.autre;
    const nv = holdingNetValue(state, e);
    const cons = holdingConsolidatedValue(state, e);
    const kidsTxt = holdingChildren(state, e.id).map(k => {
      const own = (k.owners || []).find(o => o.kind === "entity" && o.id === e.id);
      return k.name + " " + fmtPct((Number(own && own.share) || 0) / 100);
    }).join(" + ") || "—";
    const ownersTxt = (e.owners || []).map(o => {
      if (o.kind === "person") {
        const p = PERSONS.find(x => x.id === o.id);
        return (p ? p.name : o.id) + " " + fmtPct((o.share || 0) / 100);
      }
      const sub = cfg.entities.find(x => x.id === o.id);
      return (sub ? sub.name : o.id) + " " + fmtPct((o.share || 0) / 100);
    }).join(" + ") || "—";
    const effTxt = (effAll[e.id] || []).map(({ person, share }) => {
      const p = PERSONS.find(x => x.id === person);
      return (p ? p.name : person) + " " + fmtPct(share, 1);
    }).join(" + ") || "—";
    const accts = (e.accountIds || []).map(id => state.accounts.find(a => a.id === id)).filter(Boolean);
    const acctTxt = accts.map(a => a.name + " (" + fmtEUR0(a.balance) + ")").join(", ") || "—";
    return `
      <tr>
        <td><div class="tx-main"><div class="tx-ico">${type.icon}</div><div><div class="tx-label">${escapeHtml(e.name)}</div><div class="tx-sub">${type.label}</div></div></div></td>
        <td class="tx-amount ${nv < 0 ? "expense" : "income"}">${fmtEUR(nv)}</td>
        <td class="tx-amount ${cons < 0 ? "expense" : "income"}">${fmtEUR(cons)}</td>
        <td class="muted">${escapeHtml(kidsTxt)}</td>
        <td class="muted">${escapeHtml(ownersTxt)}</td>
        <td class="muted">${escapeHtml(effTxt)}</td>
        <td class="muted">${escapeHtml(acctTxt)}</td>
        <td>
          <button class="act-btn" data-edit-holding="${e.id}" title="Modifier">✎</button>
          <button class="act-btn del" data-del-holding="${e.id}" title="Supprimer">🗑</button>
        </td>
      </tr>`;
  }).join("");
  el.innerHTML = `<table>
    <thead><tr><th>Entité</th><th>Valeur nette</th><th>Consolidée</th><th>Filiales</th><th>Associés</th><th>Propriété effective</th><th>Comptes liés (solde)</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  document.querySelectorAll("[data-edit-holding]").forEach(b => b.addEventListener("click", () => {
    const e = cfg.entities.find(x => x.id === b.dataset.editHolding);
    if (e) openHoldingModal(e);
  }));
  document.querySelectorAll("[data-del-holding]").forEach(b => b.addEventListener("click", () => {
    if (confirm("Supprimer cette entité ? Les comptes, prêts et dividendes liés seront conservés.")) {
      const eid = b.dataset.delHolding;
      App.state.holdings.entities = holdingsConfig(App.state).entities.filter(x => x.id !== eid);
      /* Nettoyage : retire les dividendes orphelins qui référencent l'entité supprimée */
      App.state.holdings.dividends = holdingDividends(App.state).filter(d => d.from !== eid && d.to !== eid);
      saveState(App.state); renderAll(); toast("Entité supprimée", "danger");
    }
  }));
}

/* Palette déterministe pour les entités sans couleur */
const HOLDING_COLORS = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ec4899", "#6366f1", "#14b8a6", "#f97316"];
function typeColor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return HOLDING_COLORS[h % HOLDING_COLORS.length];
}

/* Modale d'entité : associe les associés (personnes ou sociétés) et les comptes/prêts liés */
let _ownerRows = [];
function openHoldingModal(entity) {
  const s = App.state;
  document.getElementById("holdingModalTitle").textContent = entity ? "Modifier l'entité" : "Ajouter une entité";
  document.getElementById("holdingId").value = entity ? entity.id : "";
  document.getElementById("holdingName").value = entity ? entity.name : "";
  document.getElementById("holdingType").value = entity ? entity.type : "sci";
  document.getElementById("holdingNotes").value = entity ? (entity.notes || "") : "";
  /* Conserve la couleur de l'entité (ou en génère une) pour la sauvegarde */
  document.getElementById("holdingId").dataset.color = entity ? (entity.color || typeColor(entity.id)) : "";

  _ownerRows = (entity ? (entity.owners || []) : [{ kind: "person", id: "tommy", share: 100 }])
    .map(o => ({ kind: o.kind, id: o.id, share: o.share }));
  renderOwnerRows();

  /* Comptes liés */
  const accSel = document.getElementById("holdingAccounts");
  accSel.innerHTML = s.accounts.map(a => `<option value="${a.id}">${accountMeta(a.type).icon} ${escapeHtml(a.name)}</option>`).join("");
  (entity ? (entity.accountIds || []) : []).forEach(id => {
    const opt = accSel.querySelector(`option[value="${id}"]`);
    if (opt) opt.selected = true;
  });

  /* Prêts liés */
  const loanSel = document.getElementById("holdingLoans");
  loanSel.innerHTML = (s.loans || []).map(l => `<option value="${l.id}">🏠 ${escapeHtml(l.name)}</option>`).join("");
  (entity ? (entity.loanIds || []) : []).forEach(id => {
    const opt = loanSel.querySelector(`option[value="${id}"]`);
    if (opt) opt.selected = true;
  });

  openModal("modalHolding");
}

function renderOwnerRows() {
  const s = App.state;
  const el = document.getElementById("holdingOwners");
  const personOpts = PERSONS.map(p => `<option value="p:${p.id}">${escapeHtml(p.name)}</option>`).join("");
  const entityOpts = holdingsConfig(s).entities
    .filter(e => e.id !== document.getElementById("holdingId").value)
    .map(e => `<option value="e:${e.id}">${escapeHtml(e.name)} (société)</option>`).join("");
  el.innerHTML = _ownerRows.map((row, i) => `
    <div class="owner-row">
      <select data-owner-kind="${i}">
        <option value="">— Choisir —</option>
        <optgroup label="Personnes">${personOpts}</optgroup>
        <optgroup label="Sociétés">${entityOpts}</optgroup>
      </select>
      <input type="number" step="0.01" min="0" max="100" value="${row.share}" data-owner-share="${i}" placeholder="%" aria-label="Part">
      <button type="button" class="act-btn del" data-owner-del="${i}" title="Retirer">✕</button>
    </div>`).join("");

  _ownerRows.forEach((row, i) => {
    const sel = el.querySelector(`[data-owner-kind="${i}"]`);
    if (sel) sel.value = (row.kind === "entity" ? "e:" : "p:") + row.id;
  });

  el.querySelectorAll("[data-owner-kind]").forEach(sel => {
    sel.addEventListener("change", e => {
      const i = Number(sel.dataset.ownerKind);
      const v = e.target.value;
      _ownerRows[i].kind = v.startsWith("e:") ? "entity" : "person";
      _ownerRows[i].id = v.slice(2);
    });
  });
  el.querySelectorAll("[data-owner-share]").forEach(inp => {
    inp.addEventListener("input", e => {
      _ownerRows[Number(inp.dataset.ownerShare)].share = parseFloat(e.target.value) || 0;
    });
  });
  el.querySelectorAll("[data-owner-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      _ownerRows.splice(Number(btn.dataset.ownerDel), 1);
      renderOwnerRows();
    });
  });
}

/* ---------- Répartition David / Tommy ---------- */
function renderSplit() {
  const s = App.state;
  const cfg = splitConfig(s);
  const curKey = currentMonthKey();
  const cur = splitMonth(s, curKey);
  const gap = splitGap(s, curKey);
  const streak = splitStreak(s);
  const monthsCovered = cfg.shareDavid > 0 ? Math.round(Math.abs(cfg.debtDavid) / cfg.shareDavid) : 0;
  const monthsCoveredTommy = cfg.shareTommy > 0 ? Math.round(Math.abs(cfg.debtTommy) / cfg.shareTommy) : 0;

  document.getElementById("splitKpis").innerHTML = `
    <div class="kpi" style="--kpi-accent:#6366f1">
      <div class="kpi-label">🏠 Loyer Davout</div>
      <div class="kpi-value">${fmtEUR(cfg.rent)}</div>
      <div class="kpi-delta neutral">Partagé chaque mois</div>
    </div>
    <div class="kpi" style="--kpi-accent:#10b981">
      <div class="kpi-label">👤 Part Tommy · ${fmtPct(cfg.shareTommy / (cfg.rent || 1), 2)}</div>
      <div class="kpi-value">${fmtEUR(cfg.shareTommy)}</div>
      <div class="kpi-delta neutral">Salaire ${fmtEUR0(cfg.salaryTommy)}</div>
    </div>
    <div class="kpi" style="--kpi-accent:#3b6df0">
      <div class="kpi-label">👤 Part David · ${fmtPct(cfg.shareDavid / (cfg.rent || 1), 2)}</div>
      <div class="kpi-value">${fmtEUR(cfg.shareDavid)}</div>
      <div class="kpi-delta neutral">Salaire ${fmtEUR0(cfg.salaryDavid)}</div>
    </div>
    <div class="kpi" style="--kpi-accent:${cfg.debtDavid < 0 ? "#ef4444" : "#16a34a"}">
      <div class="kpi-label">📉 Dette de David</div>
      <div class="kpi-value ${cfg.debtDavid < 0 ? "neg" : "pos"}">${cfg.debtDavid < 0 ? "−" : ""}${fmtEUR(Math.abs(cfg.debtDavid))}</div>
      <div class="kpi-delta ${cfg.debtDavid < 0 ? "neg" : "pos"}">${cfg.debtDavid < 0 ? "≈ " + monthsCovered + " mois de part impayée" : "Aucune dette"}</div>
    </div>
    <div class="kpi" style="--kpi-accent:${cfg.debtTommy < 0 ? "#ef4444" : "#16a34a"}">
      <div class="kpi-label">📉 Dette de Tommy</div>
      <div class="kpi-value ${cfg.debtTommy < 0 ? "neg" : "pos"}">${cfg.debtTommy < 0 ? "−" : ""}${fmtEUR(Math.abs(cfg.debtTommy))}</div>
      <div class="kpi-delta ${cfg.debtTommy < 0 ? "neg" : "pos"}">${cfg.debtTommy < 0 ? "≈ " + monthsCoveredTommy + " mois de part impayée" : "Aucune dette"}</div>
    </div>
  `;

  renderSplitDebt("chartSplitDebt", s);
  renderSplitShare("chartSplitShare", s);
  renderSplitPayments("chartSplitPayments", s);

  /* Tableau des versements (12 derniers mois, du plus récent au plus ancien) */
  const keys = lastNMonthKeys(12).reverse();
  const el = document.getElementById("splitTable");
  const rows = keys.map(k => {
    const m = splitMonth(s, k);
    /* Statut tenant compte des deux personnes : le badge reflète la part
       non versée la plus importante (David ou Tommy). */
    const gD = splitGap(s, k);
    const gT = splitGap(s, k, "tommy");
    const gMax = Math.max(gD, gT);
    const who = gMax > 0.005 ? (gMax === gD ? "David" : "Tommy") : null;
    const badge = gMax <= 0.005 ? `<span class="split-badge ok">En règle</span>`
      : `<span class="split-badge ${gMax >= cfg.shareDavid ? "bad" : "gap"}">${who} · manque ${fmtEUR(gMax)}</span>`;
    return `
      <tr>
        <td class="muted">${monthLabel(k)}</td>
        <td class="tx-amount" style="color:#3b6df0">${fmtEUR(m.davidPaid)}</td>
        <td class="tx-amount" style="color:#10b981">${fmtEUR(m.tommyPaid)}</td>
        <td>${m.note ? escapeHtml(m.note) : "—"}</td>
        <td>${badge}</td>
        <td><button class="act-btn" data-edit-split="${k}" title="Modifier">✎</button></td>
      </tr>`;
  }).join("");
  el.innerHTML = `<table>
    <thead><tr><th>Mois</th><th>David a versé</th><th>Tommy a versé</th><th>Note</th><th>Statut</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  document.querySelectorAll("[data-edit-split]").forEach(b => {
    b.addEventListener("click", () => openSplitModal(b.dataset.editSplit));
  });

  /* Détail du partage */
  document.getElementById("splitDetail").innerHTML = `
    <div class="split-detail-row"><span>Salaire David</span><b>${fmtEUR(cfg.salaryDavid)}</b></div>
    <div class="split-detail-row"><span>Salaire Tommy</span><b>${fmtEUR(cfg.salaryTommy)}</b></div>
    <div class="split-detail-row"><span>Écart de salaire</span><b>${fmtEUR(cfg.salaryDavid - cfg.salaryTommy)}</b></div>
    <div class="split-detail-row"><span>Clé de répartition</span><b>${fmtPct(cfg.shareTommy / (cfg.rent || 1), 1)} / ${fmtPct(cfg.shareDavid / (cfg.rent || 1), 1)}</b></div>
    <div class="split-detail-row"><span>Dette de David</span><b class="${cfg.debtDavid < 0 ? "neg" : "pos"}">${cfg.debtDavid < 0 ? "−" : ""}${fmtEUR(Math.abs(cfg.debtDavid))}</b></div>
    <div class="split-detail-row"><span>Dette de Tommy</span><b class="${cfg.debtTommy < 0 ? "neg" : "pos"}">${cfg.debtTommy < 0 ? "−" : ""}${fmtEUR(Math.abs(cfg.debtTommy))}</b></div>
    <div class="split-detail-row"><span>Versé par David (12 mois)</span><b>${fmtEUR(keys.reduce((t, k) => t + splitMonth(s, k).davidPaid, 0))}</b></div>
    <div class="split-detail-row"><span>Versé par Tommy (12 mois)</span><b>${fmtEUR(keys.reduce((t, k) => t + splitMonth(s, k).tommyPaid, 0))}</b></div>
    ${streak >= 2 ? `<div class="split-detail-row"><span>Dernier versement complet</span><b class="muted">il y a ${streak} mois</b></div>` : ""}
  `;
}

/* Modale de versement mensuel */
function openSplitModal(key) {
  const s = App.state;
  const cfg = splitConfig(s);
  const sel = document.getElementById("splitMonth");
  sel.innerHTML = lastNMonthKeys(12).reverse()
    .map(k => `<option value="${k}" ${k === key ? "selected" : ""}>${monthLabel(k)}</option>`).join("");
  const m = splitMonth(s, key);
  /* Ne pré-remplit la part par défaut que si aucun enregistrement n'existe encore
     (sinon un mois réellement à 0 € serait écrasé par une part complète). */
  const hasRecord = cfg.months.some(r => r.key === key);
  document.getElementById("splitId").value = key;
  document.getElementById("splitDavidPaid").value = hasRecord ? (m.davidPaid || 0) : cfg.shareDavid.toFixed(2);
  document.getElementById("splitTommyPaid").value = hasRecord ? (m.tommyPaid || 0) : cfg.shareTommy.toFixed(2);
  document.getElementById("splitNote").value = m.note || "";
  document.getElementById("splitModalTitle").textContent = "Versement du loyer Davout";
  openModal("modalSplit");
}

/* Modale des paramètres de répartition (loyer + salaires) : recalcule la clé
   de répartition proportionnelle au moment de l'enregistrement. */
function openSplitConfigModal() {
  const cfg = splitConfig(App.state);
  document.getElementById("scRent").value = cfg.rent || "";
  document.getElementById("scSalaryDavid").value = cfg.salaryDavid || "";
  document.getElementById("scSalaryTommy").value = cfg.salaryTommy || "";
  renderSplitConfigHint();
  openModal("modalSplitConfig");
}

/* Aperçu en direct de la clé de répartition dans la modale paramètres */
function renderSplitConfigHint() {
  const rent = parseFloat(document.getElementById("scRent").value) || 0;
  const sd = parseFloat(document.getElementById("scSalaryDavid").value) || 0;
  const st = parseFloat(document.getElementById("scSalaryTommy").value) || 0;
  const total = sd + st;
  const shareD = total > 0 ? (rent * sd) / total : 0;
  const shareT = total > 0 ? (rent * st) / total : 0;
  const el = document.getElementById("scHint");
  if (el) el.innerHTML = `Part de <b>David</b> : ${fmtEUR(shareD)} (${fmtPct(sd / (total || 1), 2)}) · Part de <b>Tommy</b> : ${fmtEUR(shareT)} (${fmtPct(st / (total || 1), 2)})`;
}

/* ---------- Analyse ---------- */
function renderAnalysis() {
  const s = App.state;
  const h = computeHealthScore(s);
  const split = necessitySplit(s);
  const total = split.obligatoire + split.optionnelle + split.ponctuelle + split.epargne;

  const content = document.getElementById("analysisContent");
  content.innerHTML = `
    <div class="card" style="margin-bottom:18px">
      <div class="health-top">
        <div class="gauge-wrap">
          <svg width="118" height="118" viewBox="0 0 118 118">
            <circle class="gauge-track" cx="59" cy="59" r="50" fill="none" stroke-width="11"/>
            <circle class="gauge-fill" cx="59" cy="59" r="50" fill="none" stroke-width="11"
              stroke-dasharray="${2 * Math.PI * 50}" stroke-dashoffset="${2 * Math.PI * 50 - (2 * Math.PI * 50 * h.score / 100)}" stroke="${h.color}"/>
          </svg>
          <div class="gauge-label"><div><div class="gauge-score">${h.score}</div><div class="gauge-sub">/ 100</div></div></div>
        </div>
        <div class="health-meta">
          <h4>${h.grade}</h4>
          <p>Synthèse calculée à partir de vos données réelles : liquidités, épargne, endettement, diversification et optimisation de la trésorerie.</p>
        </div>
        <div class="health-parts" style="flex:1;margin-top:0">
          ${h.parts.map(p => `
            <div class="health-part">
              <div class="health-part-top"><span>${p.label}</span><span>${p.score}/${p.max} · ${p.note}</span></div>
              <div class="bar"><div class="bar-fill" style="width:${(p.score / p.max) * 100}%;--bar-c:${p.color}"></div></div>
            </div>`).join("")}
        </div>
      </div>
    </div>

    <div class="analysis-grid">
      <div class="card wide">
        <div class="card-head"><h3>Revenus vs dépenses</h3><span class="card-hint">12 derniers mois</span></div>
        <div class="chart-box tall"><canvas id="anFlow"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Évolution du patrimoine net</h3></div>
        <div class="chart-box"><canvas id="anNw"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Taux d'épargne mensuel</h3></div>
        <div class="chart-box"><canvas id="anSavings"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Répartition des charges</h3><span class="card-hint">12 derniers mois</span></div>
        <div class="chart-box"><canvas id="anSplit"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Répartition du patrimoine</h3></div>
        <div class="chart-box"><canvas id="anAlloc"></canvas></div>
      </div>
      <div class="card wide">
        <div class="card-head"><h3>Top catégories de dépenses</h3><span class="card-hint">12 derniers mois, hors épargne</span></div>
        <div class="chart-box tall"><canvas id="anCats"></canvas></div>
      </div>
    </div>

    <div class="card" style="margin-top:18px">
      <div class="card-head"><h3>Structure des charges (12 mois)</h3></div>
      <div class="kpis">
        ${Object.entries(NECESSITY_META).map(([k, m]) => `
          <div class="kpi" style="--kpi-accent:${m.color}">
            <div class="kpi-label">${m.label}</div>
            <div class="kpi-value">${fmtEUR0(split[k] || 0)}</div>
            <div class="kpi-delta neutral">${total > 0 ? fmtPct((split[k] || 0) / total, 1) + " du total" : "—"}</div>
          </div>`).join("")}
      </div>
    </div>
  `;

  renderCashflow("anFlow", s);
  renderNetWorth("anNw", s);
  renderSavingsRate("anSavings", s);
  renderExpenseSplit("anSplit", s);
  renderAllocation("anAlloc", s);
  renderCategoryChart("anCats", s);
}

/* ---------- Alertes ---------- */
function renderAlerts() {
  const s = App.state;
  const alerts = computeAlerts(s);
  const counts = { danger: 0, warning: 0, info: 0, success: 0 };
  alerts.forEach(a => counts[a.severity]++);

  document.getElementById("alertsCounts").innerHTML = `
    <span class="chip danger">🔴 ${counts.danger} critique</span>
    <span class="chip warning">🟠 ${counts.warning} à surveiller</span>
    <span class="chip info">🔵 ${counts.info} info</span>
    <span class="chip success">🟢 ${counts.success} positif</span>
  `;

  const el = document.getElementById("alertsList");
  if (alerts.length === 0) {
    el.innerHTML = `<div class="empty-state"><span class="big">🎉</span>Aucune alerte. Votre situation financière est sous contrôle !</div>`;
    return;
  }
  el.innerHTML = alerts.map(a => `
    <div class="alert-card ${a.severity}">
      <div class="alert-ico">${a.icon}</div>
      <div class="alert-body">
        <h4>${escapeHtml(a.title)} <span class="chip ${a.severity}">${a.severity === "danger" ? "Critique" : a.severity === "warning" ? "À surveiller" : a.severity === "success" ? "Positif" : "Info"}</span></h4>
        <p>${escapeHtml(a.detail)}</p>
        <button class="alert-action" data-alert-action="${escapeHtml(a.action)}">💡 ${escapeHtml(a.action)}</button>
      </div>
    </div>`).join("");

  document.querySelectorAll("[data-alert-action]").forEach(b => {
    b.addEventListener("click", () => toast("Conseil : " + b.dataset.alertAction, "success"));
  });
}

/* ---------- Bonnes pratiques ---------- */
function renderPractices() {
  const s = App.state;
  const practices = computePractices(s);
  const okCount = practices.filter(p => p.level === "ok").length;

  document.getElementById("practicesIntro").innerHTML = `
    <div class="card">
      <div class="card-head"><h3>📋 Règles d'or de la finance personnelle</h3>
        <span class="chip success">${okCount}/${practices.length} maîtrisées</span>
      </div>
      <p style="font-size:13.5px;color:var(--text-2)">
        Chaque pratique est évaluée automatiquement sur vos données. Le vert indique que la règle est respectée,
        l'orange qu'elle est partiellement en place, le rouge qu'elle est prioritaire. Commencez par les pratiques en rouge.
      </p>
    </div>`;

  document.getElementById("practicesList").innerHTML = practices.map(p => `
    <div class="practice-card ${p.level}">
      <div class="practice-head">
        <div class="practice-ico">${p.icon}</div>
        <div class="practice-title">${escapeHtml(p.title)}</div>
      </div>
      <div class="practice-desc">${escapeHtml(p.desc)}</div>
      <div class="practice-status">
        <div class="health-part-top"><span>Statut</span><span>${escapeHtml(p.status)}</span></div>
        <div class="bar"><div class="bar-fill ${p.level}"
          style="width:${p.level === "ok" ? 100 : p.level === "warn" ? 60 : 30}%"></div></div>
      </div>
    </div>`).join("");
}

/* ---------- Sélecteurs de formulaires ---------- */
function fillSelects() {
  const typeSel = document.getElementById("acctType");
  typeSel.innerHTML = Object.entries(ACCOUNT_TYPES)
    .map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join("");

  const holdTypeSel = document.getElementById("holdingType");
  holdTypeSel.innerHTML = Object.entries(HOLDING_TYPES)
    .map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join("");

  /* Sélecteur de société dans le formulaire compte */
  fillHoldingSelect();
}

function fillTxSelects(type, catId) {
  const catSel = document.getElementById("txCategory");
  const cats = CATEGORY_OPTIONS[type] || EXPENSE_CATEGORIES;
  catSel.innerHTML = cats.map(c => `<option value="${c.id}" ${c.id === catId ? "selected" : ""}>${c.icon} ${c.label}</option>`).join("");

  const necSel = document.getElementById("txNecessity");
  const isExpense = type === "expense";
  necSel.innerHTML = Object.entries(NECESSITY_META)
    .map(([k, m]) => `<option value="${k}">${m.label}</option>`).join("");
  necSel.disabled = !isExpense;
  necSel.closest("label").style.opacity = isExpense ? 1 : 0.45;

  const accSel = document.getElementById("txAccount");
  accSel.innerHTML = App.state.accounts
    .map(a => `<option value="${a.id}">${accountMeta(a.type).icon} ${escapeHtml(a.name)}</option>`).join("");

  const bienSel = document.getElementById("txBien");
  bienSel.innerHTML = `<option value="">— Aucun —</option>` + biensConfig(App.state)
    .map(b => `<option value="${b.id}">🏠 ${escapeHtml(b.name)}</option>`).join("");
}

/* ---------- Modales ---------- */
function openModal(id) { document.getElementById(id).hidden = false; }
function closeModal(id) { document.getElementById(id).hidden = true; }

function openAccountModal(account) {
  document.getElementById("accountModalTitle").textContent = account ? "Modifier le compte" : "Ajouter un compte";
  document.getElementById("acctId").value = account ? account.id : "";
  document.getElementById("acctName").value = account ? account.name : "";
  document.getElementById("acctType").value = account ? account.type : "livret";
  document.getElementById("acctInstitution").value = account ? (account.institution || "") : "";
  document.getElementById("acctBalance").value = account ? account.balance : "";
  document.getElementById("acctRate").value = account && account.rate != null ? account.rate : "";
  document.getElementById("acctLimit").value = account && account.limit != null ? account.limit : "";
  document.getElementById("acctOpened").value = account && account.opened ? account.opened : "";
  /* Rafraîchit les options de société (une entité peut avoir été ajoutée après le boot) */
  fillHoldingSelect();
  /* Pré-sélectionne la société à laquelle le compte est rattaché */
  const ent = holdingsConfig(App.state).entities.find(e => (e.accountIds || []).includes(account?.id));
  document.getElementById("acctHolding").value = ent ? ent.id : "";
  openModal("modalAccount");
}

/* Remplit le sélecteur de société du formulaire compte */
function fillHoldingSelect() {
  const hSel = document.getElementById("acctHolding");
  if (!hSel) return;
  hSel.innerHTML = `<option value="">— Aucune —</option>` + holdingsConfig(App.state).entities
    .map(e => `<option value="${e.id}">${(HOLDING_TYPES[e.type] || HOLDING_TYPES.autre).icon} ${escapeHtml(e.name)}</option>`).join("");
}

function openTxModal(tx) {
  document.getElementById("txModalTitle").textContent = tx ? "Modifier la transaction" : "Nouvelle transaction";
  document.getElementById("txId").value = tx ? tx.id : "";
  document.getElementById("txDate").value = tx ? tx.date : new Date().toISOString().slice(0, 10);
  document.getElementById("txLabel").value = tx ? tx.label : "";
  document.getElementById("txAmount").value = tx ? tx.amount : "";
  document.getElementById("txType").value = tx ? tx.type : "expense";
  fillTxSelects(tx ? tx.type : "expense", tx ? tx.category : EXPENSE_CATEGORIES[0].id);
  document.getElementById("txNecessity").value = tx && tx.necessity ? tx.necessity : "obligatoire";
  document.getElementById("txAccount").value = tx ? tx.account : (App.state.accounts[0] ? App.state.accounts[0].id : "");
  document.getElementById("txRecurring").checked = tx ? !!tx.recurring : false;
  document.getElementById("txBien").value = tx && tx.bien ? tx.bien : "";
  openModal("modalTx");
}

function openLoanModal(loan) {
  const s = App.state;
  document.getElementById("loanModalTitle").textContent = loan ? "Modifier le prêt" : "Ajouter un prêt";
  document.getElementById("loanId").value = loan ? loan.id : "";
  document.getElementById("loanName").value = loan ? loan.name : "";
  document.getElementById("loanType").value = loan ? loan.type : "immobilier";
  document.getElementById("loanInstitution").value = loan ? (loan.institution || "") : "";
  document.getElementById("loanInitial").value = loan ? loan.initial : "";
  document.getElementById("loanRemaining").value = loan ? loan.remaining : "";
  document.getElementById("loanMonthly").value = loan ? loan.monthly : "";
  document.getElementById("loanRate").value = loan ? loan.rate : "";
  document.getElementById("loanYears").value = loan ? loan.years : 20;
  document.getElementById("loanStart").value = loan && loan.start ? loan.start : "";
  /* Détenteur du prêt : personne physique ou entreprise */
  const holder = loanHolder(s, loan || {});
  const holderSel = document.getElementById("loanHolder");
  holderSel.innerHTML = holderOptions(s);
  setHolderValue(holderSel, holder.kind, holder.id);
  openModal("modalLoan");
}

function openBienModal(bien) {
  const s = App.state;
  document.getElementById("bienModalTitle").textContent = bien ? "Modifier le bien" : "Ajouter un bien";
  document.getElementById("bienId").value = bien ? bien.id : "";
  document.getElementById("bienName").value = bien ? bien.name : "";
  document.getElementById("bienStatus").value = bien ? (bien.status || "loue") : "loue";
  /* La valeur affichée provient du compte immo lié (source de vérité, éditable dans Comptes) */
  document.getElementById("bienValeur").value = bien ? bienValue(s, bien) : "";
  document.getElementById("bienNotes").value = bien ? (bien.notes || "") : "";
  const t = bienTravaux(s, bien || { travaux: null });
  document.getElementById("bienBudget").value = t.budget || "";
  document.getElementById("bienSpent").value = t.spent || "";

  /* Adresse & propriétaire (personne OU entreprise) */
  document.getElementById("bienAddress").value = bien ? (bien.address || "") : "";
  const owner = bienOwner(s, bien || {});
  const ownerSel = document.getElementById("bienOwner");
  ownerSel.innerHTML = holderOptions(s);
  setHolderValue(ownerSel, owner.kind, owner.id);

  /* Comptes bancaires liés (le compte immo de valorisation est géré automatiquement) */
  const accSel = document.getElementById("bienAccounts");
  accSel.innerHTML = s.accounts
    .filter(a => a.type !== "immo")
    .map(a => `<option value="${a.id}">${accountMeta(a.type).icon} ${escapeHtml(a.name)} · ${fmtEUR0(a.balance)}</option>`)
    .join("");
  (bien ? (bien.accountIds || []) : []).forEach(id => {
    const opt = accSel.querySelector(`option[value="${id}"]`);
    if (opt) opt.selected = true;
  });

  /* Prêts liés */
  const loanSel = document.getElementById("bienLoans");
  loanSel.innerHTML = (s.loans || []).map(l => `<option value="${l.id}">🏠 ${escapeHtml(l.name)}</option>`).join("");
  (bien ? (bien.loanIds || []) : []).forEach(id => {
    const opt = loanSel.querySelector(`option[value="${id}"]`);
    if (opt) opt.selected = true;
  });

  /* Liens de flux récurrents (charges & revenus du bien) : persistés sur
     bien.flowKeys pour supporter la création (le bien n'existe pas encore). */
  App.bienFlowKeys = new Set(bien && Array.isArray(bien.flowKeys) ? bien.flowKeys : []);
  renderBienFlows(s);

  openModal("modalBien");
}

/* Section « Flux récurrents liés » de la modale bien : liste des séries
   récurrentes (revenus & charges mensuels) rattachées au bien et ajout d'une
   série disponible. Les liens sont stockés sur bien.flowKeys — ils ne mutent
   aucune transaction, donc annuler la modale ne laisse aucune trace. */
function renderBienFlows(s) {
  const wrap = document.getElementById("bienFlowsWrap");
  if (!wrap) return;
  const bienId = document.getElementById("bienId").value;
  const isLinked = t => t.bien === bienId || App.bienFlowKeys.has(recurringSeriesKey(t));
  const all = recurringSeriesTemplates(s);
  const linked = all.filter(isLinked).sort((x, y) => (x.type === y.type ? 0 : x.type === "income" ? -1 : 1));
  /* Une série déjà rattachée à un AUTRE bien (t.bien ≠ ce bien) est exclue de
     la liste des disponibles : la lier ici ferait compter la charge/revenu
     sur deux biens à la fois (double comptage). */
  const available = all.filter(t => !isLinked(t) && (!t.bien || t.bien === bienId));

  const rows = linked.map(t => {
    const inc = t.type === "income";
    const cat = CAT_BY_ID[t.category];
    const key = recurringSeriesKey(t);
    /* Le ✕ ne peut retirer que les liens flowKeys : pour une série liée via le
       tag transaction (t.bien), on affiche une pastille « tagué » au lieu d'un
       bouton qui ne ferait rien. */
    const action = App.bienFlowKeys.has(key)
      ? `<button type="button" class="act-btn del" data-flow-action="unlink" data-flow-key="${escapeHtml(key)}" title="Retirer ce flux">✕</button>`
      : `<span class="bien-flow-tag">tagué</span>`;
    return `
      <div class="bien-flow-row">
        <span class="bien-flow-ico">${inc ? "💼" : "🛒"}</span>
        <div class="bien-flow-label">${escapeHtml(t.label)} <span class="muted">${cat ? escapeHtml(cat.label) : ""} · ${t.type === "income" ? "revenu" : "dépense"}</span></div>
        <b class="bien-flow-amt ${inc ? "pos" : "neg"}">${inc ? "+" : "−"}${fmtEUR(t.amount)}<span class="muted">/mois</span></b>
        ${action}
      </div>`;
  }).join("");

  const totInc = linked.filter(t => t.type === "income").reduce((x, t) => x + (Number(t.amount) || 0), 0);
  const totExp = linked.filter(t => t.type === "expense").reduce((x, t) => x + (Number(t.amount) || 0), 0);
  const solde = totInc - totExp;

  wrap.innerHTML = `
    <div class="bien-flows">
      ${rows || `<div class="bien-flows-empty">Aucun flux récurrent lié — la performance annuelle ne tient compte que des prêts.</div>`}
      <div class="bien-flow-sum">
        <span>Revenus <b class="pos">+${fmtEUR(totInc)}</b></span>
        <span>Charges <b class="neg">−${fmtEUR(totExp)}</b></span>
        <span>Solde <b class="${solde < 0 ? "neg" : "pos"}">${solde < 0 ? "−" : "+"}${fmtEUR(Math.abs(solde))}</b>/mois</span>
      </div>
      ${available.length ? `
      <div class="bien-flows-add">
        <select id="bienAddFlow">
          <option value="" disabled selected>— Choisir un flux —</option>
          ${available.map(t => `<option value="${escapeHtml(recurringSeriesKey(t))}">${t.type === "income" ? "💼" : "🛒"} ${escapeHtml(t.label)} · ${fmtEUR(t.amount)}/mois</option>`).join("")}
        </select>
        <button type="button" class="btn btn-outline btn-xs" data-flow-action="link">＋ Lier</button>
      </div>` : `<div class="bien-flows-empty">Toutes les séries récurrentes sont déjà liées à ce bien.</div>`}
    </div>`;
}

function bindModals() {
  document.querySelectorAll(".modal-overlay").forEach(ov => {
    ov.addEventListener("click", e => { if (e.target === ov) ov.hidden = true; });
  });
  document.querySelectorAll("[data-close]").forEach(b => {
    b.addEventListener("click", () => closeModal(b.dataset.close));
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") document.querySelectorAll(".modal-overlay").forEach(m => m.hidden = true);
  });
}

/* ---------- Formulaires ---------- */
function bindForms() {
  document.getElementById("txForm").addEventListener("submit", e => {
    e.preventDefault();
    const s = App.state;
    const id = document.getElementById("txId").value;
    const type = document.getElementById("txType").value;
    const oldTx = id ? s.transactions.find(t => t.id === id) : null;
    const data = {
      id: id || uid("t"),
      date: document.getElementById("txDate").value,
      label: document.getElementById("txLabel").value.trim(),
      amount: parseFloat(document.getElementById("txAmount").value) || 0,
      category: document.getElementById("txCategory").value,
      type,
      necessity: type === "expense" ? document.getElementById("txNecessity").value : undefined,
      account: document.getElementById("txAccount").value,
      bien: document.getElementById("txBien").value || undefined,
      recurring: document.getElementById("txRecurring").checked,
    };
    if (id) s.transactions = s.transactions.map(t => t.id === id ? data : t);
    else s.transactions.push(data);
    /* Flux récurrent : génère / met à jour l'occurrence du mois suivant */
    syncRecurringNextMonth(s, data, oldTx);
    saveState(s); renderAll(); closeModal("modalTx");
    toast(id ? "Transaction mise à jour" : "Transaction ajoutée", "success");
  });

  document.getElementById("loanForm").addEventListener("submit", e => {
    e.preventDefault();
    const s = App.state;
    const id = document.getElementById("loanId").value;
    const [holderKind, holderId] = (document.getElementById("loanHolder").value || "person:tommy").split(":");
    const data = {
      id: id || uid("l"),
      name: document.getElementById("loanName").value.trim(),
      type: document.getElementById("loanType").value,
      institution: document.getElementById("loanInstitution").value.trim(),
      initial: parseFloat(document.getElementById("loanInitial").value) || 0,
      remaining: parseFloat(document.getElementById("loanRemaining").value) || 0,
      monthly: parseFloat(document.getElementById("loanMonthly").value) || 0,
      rate: parseFloat(document.getElementById("loanRate").value) || 0,
      years: parseInt(document.getElementById("loanYears").value) || 20,
      start: document.getElementById("loanStart").value || null,
      holder: { kind: holderKind, id: holderId },
    };
    if (id) s.loans = s.loans.map(l => l.id === id ? data : l);
    else s.loans.push(data);
    saveState(s); renderAll(); closeModal("modalLoan");
    toast(id ? "Prêt mis à jour" : "Prêt ajouté", "success");
  });

  /* Entité / holding : associés, comptes et prêts liés */
  document.getElementById("holdingForm").addEventListener("submit", e => {
    e.preventDefault();
    const s = App.state;
    const id = document.getElementById("holdingId").value;
    const validOwners = _ownerRows
      .filter(o => o.id && o.share > 0)
      .map(o => ({ kind: o.kind, id: o.id, share: o.share }));
    const data = {
      id: id || uid("h"),
      type: document.getElementById("holdingType").value,
      name: document.getElementById("holdingName").value.trim(),
      color: document.getElementById("holdingId").dataset.color || typeColor(id || "h-new"),
      owners: validOwners,
      accountIds: Array.from(document.getElementById("holdingAccounts").selectedOptions).map(o => o.value),
      loanIds: Array.from(document.getElementById("holdingLoans").selectedOptions).map(o => o.value),
      notes: document.getElementById("holdingNotes").value.trim(),
    };
    if (id) {
      s.holdings.entities = holdingsConfig(s).entities.map(x => x.id === id ? data : x);
    } else {
      s.holdings.entities.push(data);
    }
    saveState(s); renderAll(); closeModal("modalHolding");
    toast(id ? "Entité mise à jour" : "Entité ajoutée", "success");
  });

  /* Dividende mère-fille : remontée de trésorerie de la fille vers la mère */
  document.getElementById("dividendForm").addEventListener("submit", e => {
    e.preventDefault();
    const s = App.state;
    const id = document.getElementById("dividendId").value;
    const from = document.getElementById("dividendFrom").value;
    const to = document.getElementById("dividendTo").value;
    const f = holdingById(s, from);
    /* La bénéficiaire doit être une société associée de la société qui verse */
    const isMother = f && (f.owners || []).some(o => o.kind === "entity" && o.id === to);
    if (!from || !to || from === to || !isMother) {
      toast("La bénéficiaire doit être une société associée de la société qui verse", "danger");
      return;
    }
    const data = {
      id: id || uid("d"),
      from, to,
      month: document.getElementById("dividendMonth").value,
      amount: parseFloat(document.getElementById("dividendAmount").value) || 0,
      note: document.getElementById("dividendNote").value.trim(),
    };
    if (id) s.holdings.dividends = holdingDividends(s).map(x => x.id === id ? data : x);
    else {
      if (!Array.isArray(s.holdings.dividends)) s.holdings.dividends = [];
      s.holdings.dividends.push(data);
    }
    saveState(s); renderAll(); closeModal("modalDividend");
    toast(id ? "Remontée mise à jour" : "Dividende enregistré", "success");
  });

  /* Rattachement d'un compte à une société */
  document.getElementById("accountForm").addEventListener("submit", e => {
    e.preventDefault();
    const s = App.state;
    const id = document.getElementById("acctId").value;
    const holdingId = document.getElementById("acctHolding").value;
    const data = {
      id: id || uid("a"),
      type: document.getElementById("acctType").value,
      name: document.getElementById("acctName").value.trim(),
      institution: document.getElementById("acctInstitution").value.trim(),
      balance: parseFloat(document.getElementById("acctBalance").value) || 0,
      rate: parseFloat(document.getElementById("acctRate").value) || null,
      limit: parseFloat(document.getElementById("acctLimit").value) || null,
      opened: document.getElementById("acctOpened").value || null,
    };
    /* Met à jour le compte */
    if (id) s.accounts = s.accounts.map(a => a.id === id ? data : a);
    else s.accounts.push(data);
    /* Met à jour la société liée : retire le compte de toutes les entités puis l'attache */
    holdingsConfig(s).entities.forEach(e => {
      e.accountIds = (e.accountIds || []).filter(aid => aid !== data.id);
    });
    if (holdingId) {
      const ent = holdingById(s, holdingId);
      if (ent) {
        if (!ent.accountIds) ent.accountIds = [];
        if (!ent.accountIds.includes(data.id)) ent.accountIds.push(data.id);
      }
    }
    saveState(s); renderAll(); closeModal("modalAccount");
    toast(id ? "Compte mis à jour" : "Compte ajouté", "success");
  });

  /* Bien immobilier : nom, statut, valeur, société porteuse, prêts et travaux */
  document.getElementById("bienForm").addEventListener("submit", e => {
    e.preventDefault();
    const s = App.state;
    const id = document.getElementById("bienId").value;
    const name = document.getElementById("bienName").value.trim();
    const address = document.getElementById("bienAddress").value.trim();
    const status = document.getElementById("bienStatus").value;
    const valeur = parseFloat(document.getElementById("bienValeur").value) || 0;
    const [ownerKind, ownerId] = (document.getElementById("bienOwner").value || "person:tommy").split(":");
    const selectedAccounts = Array.from(document.getElementById("bienAccounts").selectedOptions).map(o => o.value);
    const loanIds = Array.from(document.getElementById("bienLoans").selectedOptions).map(o => o.value);
    const budget = parseFloat(document.getElementById("bienBudget").value) || 0;
    const spent = parseFloat(document.getElementById("bienSpent").value) || 0;
    const notes = document.getElementById("bienNotes").value.trim();
    const data = {
      id: id || uid("b"),
      name, address, status, valeur,
      accountIds: [],
      loanIds,
      owner: { kind: ownerKind, id: ownerId },
      flowKeys: Array.from(App.bienFlowKeys || []),
      travaux: (status === "en_travaux" || budget > 0) ? { budget, spent } : null,
      notes,
    };
    /* Compte immo : créé (ou réutilisé) pour porter la valeur du bien */
    let existing = id ? (bienById(s, id)?.accountIds || []) : [];
    let acc = existing.map(aid => s.accounts.find(a => a.id === aid)).find(a => a && a.type === "immo") || null;
    if (!acc) {
      acc = { id: uid("a"), type: "immo", name: "Bien — " + name, institution: "—", balance: valeur, rate: null, limit: null, opened: null };
      s.accounts.push(acc);
    } else {
      acc.name = "Bien — " + name;
      acc.balance = valeur;
    }
    /* Comptes liés : ceux sélectionnés (hors immo) + le compte de valorisation */
    data.accountIds = selectedAccounts.filter(aid => { const a = s.accounts.find(x => x.id === aid); return a && a.type !== "immo"; });
    data.accountIds.push(acc.id);
    /* Détache l'ancien compte de toute société puis l'attache à la porteuse
       si le propriétaire du bien est une entreprise (consolidation) */
    holdingsConfig(s).entities.forEach(ent => {
      ent.accountIds = (ent.accountIds || []).filter(aid => aid !== acc.id);
    });
    if (ownerKind === "entity") {
      const ent = holdingById(s, ownerId);
      if (ent) {
        if (!Array.isArray(ent.accountIds)) ent.accountIds = [];
        if (!ent.accountIds.includes(acc.id)) ent.accountIds.push(acc.id);
      }
    }
    if (id) s.biens = biensConfig(s).map(b => b.id === id ? data : b);
    else s.biens.push(data);
    saveState(s); renderAll(); closeModal("modalBien");
    toast(id ? "Bien mis à jour" : "Bien ajouté", "success");
  });

  /* Versement répartition David / Tommy */
  document.getElementById("splitForm").addEventListener("submit", e => {
    e.preventDefault();
    const s = App.state;
    const key = document.getElementById("splitMonth").value;
    const rec = {
      key,
      davidPaid: parseFloat(document.getElementById("splitDavidPaid").value) || 0,
      tommyPaid: parseFloat(document.getElementById("splitTommyPaid").value) || 0,
      note: document.getElementById("splitNote").value.trim(),
    };
    splitUpsert(s, rec);
    /* Recalcule les dettes cumulées : −Σ(part non versée) sur l'historique,
       pour David comme pour Tommy. */
    let gapD = 0, gapT = 0;
    lastNMonthKeys(12).forEach(k => {
      gapD += splitGap(s, k, "david");
      gapT += splitGap(s, k, "tommy");
    });
    s.split.debtDavid = -gapD;
    s.split.debtTommy = -gapT;
    saveState(s);
    renderAll();
    closeModal("modalSplit");
    toast("Versement enregistré", "success");
  });

  /* Modale paramètres de répartition : loyer + salaires, recalcul en direct */
  document.getElementById("splitConfigForm").addEventListener("submit", e => {
    e.preventDefault();
    const s = App.state;
    splitUpdateConfig(s, {
      rent: document.getElementById("scRent").value,
      salaryDavid: document.getElementById("scSalaryDavid").value,
      salaryTommy: document.getElementById("scSalaryTommy").value,
    });
    saveState(s);
    renderAll();
    closeModal("modalSplitConfig");
    toast("Répartition mise à jour", "success");
  });
  ["scRent", "scSalaryDavid", "scSalaryTommy"].forEach(id => {
    document.getElementById(id).addEventListener("input", renderSplitConfigHint);
  });

  /* Type de transaction → catégories */
  document.getElementById("txType").addEventListener("change", e => {
    fillTxSelects(e.target.value, CATEGORY_OPTIONS[e.target.value][0].id);
  });
}

/* ---------- Mon profil (compte Moonee, cloud, sécurité) ---------- */
function bindProfile() {
  /* Ouvre la modale profil depuis la sidebar */
  document.getElementById("btnProfile").addEventListener("click", () => {
    renderProfile();
    openModal("modalProfile");
  });

  /* Pseudo (local + cloud) */
  document.getElementById("pfSavePseudo").addEventListener("click", saveProfilePseudo);
  document.getElementById("pfPseudo").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); saveProfilePseudo(); }
  });

  /* Authentification email + mot de passe */
  document.getElementById("profileAuthForm").addEventListener("submit", e => {
    e.preventDefault();
    profileSignIn();
  });
  document.getElementById("pfSignUp").addEventListener("click", profileSignUp);
  document.getElementById("pfPasskeyIn").addEventListener("click", profilePasskeyIn);
  document.getElementById("pfForgot").addEventListener("click", profileForgot);

  /* Session active */
  document.getElementById("pfSignOut").addEventListener("click", profileSignOut);
  document.getElementById("pfMigrate").addEventListener("click", profileMigrate);
  document.getElementById("pfPasskeyAdd").addEventListener("click", profilePasskeyAdd);
  document.getElementById("pfChangePwd").addEventListener("click", profileChangePwd);

  /* Invitation d'un membre au foyer */
  document.getElementById("profileInviteForm").addEventListener("submit", e => {
    e.preventDefault();
    profileInvite();
  });

  /* La session cloud change (connexion / déconnexion) → rafraîchit la modale */
  onCloudAuthChange(() => {
    if (!document.getElementById("modalProfile").hidden) renderProfile();
  });

  /* Pseudo initial dans la sidebar */
  renderProfilePseudo();
}

/* Affiche le pseudo enregistré dans la sidebar */
function renderProfilePseudo() {
  const p = loadProfile();
  const el = document.getElementById("profilePseudo");
  if (el) el.textContent = p.pseudo || "Tommy";
}

/* Remplit la modale profil selon l'état (local / cloud configuré / session) */
function renderProfile() {
  const p = loadProfile();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("profileAvatar", (p.pseudo || "T").charAt(0).toUpperCase());
  set("profileName", p.pseudo || "Tommy");
  set("profileId", p.id);
  set("profilePseudo", p.pseudo || "Tommy");
  const pseudoInput = document.getElementById("pfPseudo");
  if (pseudoInput) pseudoInput.value = p.pseudo || "";

  const cloud = cloudConfigured();
  const mode = document.getElementById("profileMode");
  mode.textContent = cloud ? "☁️ Cloud prêt" : "Mode local";
  mode.className = "chip " + (cloud ? "success" : "");

  const cloudNote = document.getElementById("profileCloudNote");
  const authSec = document.getElementById("profileAuthSection");
  const sessSec = document.getElementById("profileSessionSection");
  const invSec = document.getElementById("profileInviteSection");

  if (!cloud) {
    cloudNote.hidden = true;
    authSec.hidden = true; sessSec.hidden = true; invSec.hidden = true;
    return;
  }
  cloudNote.hidden = false;
  cloudNote.textContent = "🔌 Le cloud est configuré : connectez-vous pour sauvegarder vos données dans votre foyer Supabase et inviter d'autres membres.";

  cloudUser().then(user => {
    const logged = !!user;
    authSec.hidden = logged;
    sessSec.hidden = !logged;
    invSec.hidden = !logged;
    if (logged) document.getElementById("pfSessionEmail").textContent = user.email || user.id;
  }).catch(() => {
    authSec.hidden = false; sessSec.hidden = true; invSec.hidden = true;
  });
}

/* Enregistre le pseudo (local, et cloud si connecté) */
async function saveProfilePseudo() {
  const val = document.getElementById("pfPseudo").value.trim();
  if (!val) { toast("Pseudo vide", "danger"); return; }
  const p = loadProfile();
  p.pseudo = val;
  saveProfile(p);
  /* Synchronise aussi le profil cloud si connecté */
  try {
    const sb = await getSupabase();
    if (sb) {
      const user = await cloudUser();
      if (user) await sb.from("profiles").update({ pseudo: val }).eq("id", user.id);
    }
  } catch (e) { /* silencieux : le pseudo reste local */ }
  renderProfile();
  toast("Pseudo enregistré", "success");
}

/* Désactive / réactive tous les boutons de la modale pendant une opération */
function profileBusy(on) {
  document.querySelectorAll("#modalProfile button").forEach(b => { b.disabled = on; });
}

async function profileSignIn() {
  const email = document.getElementById("pfEmail").value.trim();
  const pwd = document.getElementById("pfPassword").value;
  if (!email || !pwd) { toast("Renseignez l'email et le mot de passe", "danger"); return; }
  profileBusy(true);
  try {
    const res = await cloudSignIn(email, pwd);
    if (!res.ok) { toast(res.error || "Échec de la connexion", "danger"); return; }
    document.getElementById("pfPassword").value = "";
    toast("Connecté au cloud ☁️", "success");
    renderProfile();
  } finally {
    profileBusy(false);
  }
}

async function profileSignUp() {
  const email = document.getElementById("pfEmail").value.trim();
  const pwd = document.getElementById("pfPassword").value;
  if (!email || pwd.length < 8) { toast("Email + mot de passe (8 caractères min)", "danger"); return; }
  profileBusy(true);
  try {
    const res = await cloudSignUp(email, pwd, loadProfile().pseudo || "Membre");
    if (!res.ok) { toast(res.error || "Échec de l'inscription", "danger"); return; }
    toast("Compte créé — vérifiez votre email pour confirmer", "success");
    renderProfile();
  } finally {
    profileBusy(false);
  }
}

async function profilePasskeyIn() {
  profileBusy(true);
  try {
    const res = await cloudSignInWithPasskey();
    if (!res.ok) { toast(res.error || "Échec de la connexion par passkey", "danger"); return; }
    toast("Connecté via passkey 🔑", "success");
    renderProfile();
  } finally {
    profileBusy(false);
  }
}

async function profileForgot() {
  const email = document.getElementById("pfEmail").value.trim();
  if (!email) { toast("Saisissez d'abord votre email", "danger"); return; }
  const res = await cloudResetPassword(email);
  toast(res.ok ? "Email de réinitialisation envoyé ✉️" : (res.error || "Échec"), res.ok ? "success" : "danger");
}

async function profileSignOut() {
  const res = await cloudSignOut();
  toast(res.ok ? "Déconnecté" : (res.error || "Échec de la déconnexion"), res.ok ? "success" : "danger");
  renderProfile();
}

async function profileMigrate() {
  profileBusy(true);
  try {
    const res = await migrateLocalStateToSupabase(App.state, loadProfile());
    if (!res.ok) { toast(res.message || "Échec de la migration", "danger"); return; }
    toast(res.skipped ? "Données déjà migrées ✓" : "Données migrées vers le cloud ✓", "success");
    renderProfile();
  } finally {
    profileBusy(false);
  }
}

async function profilePasskeyAdd() {
  profileBusy(true);
  try {
    const res = await cloudRegisterPasskey();
    toast(res.ok ? "Passkey enregistrée 🔑" : (res.error || "Échec de l'enregistrement"), res.ok ? "success" : "danger");
  } finally {
    profileBusy(false);
  }
}

async function profileChangePwd() {
  const np = prompt("Nouveau mot de passe (8 caractères minimum) :");
  if (!np) return;
  if (np.length < 8) { toast("8 caractères minimum", "danger"); return; }
  const res = await cloudUpdatePassword(np);
  toast(res.ok ? "Mot de passe mis à jour ✓" : (res.error || "Échec"), res.ok ? "success" : "danger");
}

/* Invitation d'un membre : appelle l'Edge Function « invite » (cf. run.md).
   Si elle n'est pas déployée, l'utilisateur est prévenu dans la modale. */
async function profileInvite() {
  const email = document.getElementById("pfInviteEmail").value.trim();
  const hint = document.getElementById("pfInviteHint");
  if (!email) { hint.textContent = "Saisissez l'email du membre à inviter."; return; }
  hint.textContent = "Envoi…";
  try {
    const sb = await getSupabase();
    if (!sb) { hint.textContent = "Cloud non configuré."; return; }
    const { error } = await sb.functions.invoke("invite", { body: { email } });
    hint.textContent = error
      ? "⚠️ " + (error.message || "Fonction d'invitation non déployée — voir run.md")
      : "✅ Invitation envoyée à " + email;
    if (!error) document.getElementById("pfInviteEmail").value = "";
  } catch (e) {
    hint.textContent = "⚠️ Fonction d'invitation non déployée — voir run.md";
  }
}

/* ---------- Interactions globales ---------- */
function bindGlobal() {
  document.getElementById("btnSplitConfig").addEventListener("click", openSplitConfigModal);
  document.getElementById("btnAddTx").addEventListener("click", () => openTxModal(null));
  document.getElementById("btnAddTx2").addEventListener("click", () => { showPage("transactions"); openTxModal(null); });
  document.getElementById("btnAddAccount").addEventListener("click", () => openAccountModal(null));
  document.getElementById("btnAddAccount2").addEventListener("click", () => openAccountModal(null));
  document.getElementById("btnAddLoan").addEventListener("click", () => openLoanModal(null));
  document.getElementById("btnAddHolding").addEventListener("click", () => openHoldingModal(null));
  document.getElementById("btnAddBien").addEventListener("click", () => openBienModal(null));
  /* Lier / retirer un flux récurrent dans la modale bien (délégation : les
     boutons sont reconstruits à chaque ouverture de la modale) */
  document.getElementById("bienFlowsWrap").addEventListener("click", e => {
    const btn = e.target.closest("[data-flow-action]");
    if (!btn) return;
    const s = App.state;
    const bienId = document.getElementById("bienId").value;
    const key = btn.dataset.flowAction === "link"
      ? document.getElementById("bienAddFlow").value
      : btn.dataset.flowKey;
    if (!key) return;
    if (btn.dataset.flowAction === "link") {
      App.bienFlowKeys.add(key);
      toast("Flux récurrent lié au bien", "success");
    } else {
      App.bienFlowKeys.delete(key);
      toast("Flux retiré du bien", "danger");
    }
    renderBienFlows(s);
    /* Si le bien existe déjà, on répercute le lien sur bien.flowKeys pour que
       la performance annuelle se mette à jour en direct (et soit persistée). */
    const bien = bienById(s, bienId);
    if (bien) {
      bien.flowKeys = Array.from(App.bienFlowKeys);
      saveState(s);
      renderAll();
    }
  });
  document.getElementById("btnAddDividend").addEventListener("click", () => openDividendModal(null));
  /* Hint mère-fille : listeners liés UNE SEULE FOIS (pas d'accumulation à chaque ouverture) */
  document.getElementById("dividendFrom").addEventListener("change", updateDividendHint);
  document.getElementById("dividendTo").addEventListener("change", updateDividendHint);
  document.getElementById("btnAddOwner").addEventListener("click", () => {
    _ownerRows.push({ kind: "person", id: "tommy", share: 100 });
    renderOwnerRows();
  });
  document.getElementById("btnAddSplit").addEventListener("click", () => openSplitModal(currentMonthKey()));

  document.getElementById("monthPrev").addEventListener("click", () => {
    App.txSelection.clear();
    App.txMonth = addMonths(App.txMonth, -1);
    renderTransactions();
  });
  document.getElementById("monthNext").addEventListener("click", () => {
    App.txSelection.clear();
    App.txMonth = addMonths(App.txMonth, 1);
    renderTransactions();
  });
  document.getElementById("monthToday").addEventListener("click", () => {
    App.txSelection.clear();
    App.txMonth = currentMonthKey();
    renderTransactions();
  });

  document.querySelectorAll("#txTabs .tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#txTabs .tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      App.txSelection.clear();
      App.txFilter = tab.dataset.filter;
      renderTransactions();
    });
  });

  /* Sélection multiple de transactions : cases à cocher (délégation sur la
     table, reconstruite à chaque rendu) */
  document.getElementById("txTable").addEventListener("change", e => {
    if (e.target.id === "txSelAll") {
      const visible = [...document.querySelectorAll("#txTable [data-sel-tx]")].map(cb => cb.dataset.selTx);
      if (e.target.checked) visible.forEach(id => App.txSelection.add(id));
      else visible.forEach(id => App.txSelection.delete(id));
      renderTransactions();
    } else if (e.target.closest("[data-sel-tx]")) {
      const cb = e.target.closest("[data-sel-tx]");
      if (cb.checked) App.txSelection.add(cb.dataset.selTx);
      else App.txSelection.delete(cb.dataset.selTx);
      renderTransactions();
    }
  });

  /* Barre d'actions : dupliquer / supprimer / désélectionner en masse */
  document.getElementById("txSelDup").addEventListener("click", () => {
    if (App.txSelection.size === 0) return;
    const s = App.state;
    s.transactions.filter(t => App.txSelection.has(t.id)).forEach(t => s.transactions.push({ ...t, id: uid("t") }));
    App.txSelection.clear();
    saveState(s); renderAll(); toast("Transactions dupliquées", "success");
  });
  document.getElementById("txSelDel").addEventListener("click", () => {
    if (App.txSelection.size === 0) return;
    if (!confirm("Supprimer " + App.txSelection.size + " transaction(s) ?")) return;
    const s = App.state;
    const deleted = s.transactions.filter(t => App.txSelection.has(t.id));
    s.transactions = s.transactions.filter(t => !App.txSelection.has(t.id));
    stopRecurringAfterDelete(s, deleted);
    App.txSelection.clear();
    saveState(s); renderAll(); toast("Transactions supprimées", "danger");
  });
  document.getElementById("txSelClear").addEventListener("click", () => {
    App.txSelection.clear();
    renderTransactions();
  });

  /* Filtre multi-comptes : ouverture du panneau */
  document.getElementById("acctFilterBtn").addEventListener("click", e => {
    e.stopPropagation();
    const panel = document.getElementById("acctFilterPanel");
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderAccountFilter(App.state);
  });
  /* Cases à cocher des comptes (délégation) */
  document.getElementById("acctFilterPanel").addEventListener("change", e => {
    const cb = e.target.closest("[data-acct-filter]");
    if (!cb) return;
    if (cb.checked) App.txAccounts.add(cb.dataset.acctFilter);
    else App.txAccounts.delete(cb.dataset.acctFilter);
    App.txSelection.clear();
    renderTransactions();
  });
  document.getElementById("acctFilterClear").addEventListener("click", () => {
    App.txAccounts.clear();
    App.txSelection.clear();
    renderTransactions();
  });
  /* Ferme le panneau au clic extérieur */
  document.addEventListener("click", e => {
    const wrap = document.getElementById("acctFilterWrap");
    if (wrap && !wrap.contains(e.target)) document.getElementById("acctFilterPanel").hidden = true;
  });

  /* Import / Export de transactions */
  document.getElementById("btnExportTx").addEventListener("click", () => exportTxCSV());
  document.getElementById("btnImportTx").addEventListener("click", () => openImportModal());
  document.getElementById("impFile").addEventListener("change", e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById("impText").value = String(ev.target.result || "");
      handleImpText(document.getElementById("impText").value);
    };
    reader.readAsText(f);
  });
  document.getElementById("impText").addEventListener("input", e => handleImpText(e.target.value));
  document.getElementById("impAccount").addEventListener("change", () => renderImportPreview());
  document.getElementById("impForm").addEventListener("submit", e => {
    e.preventDefault();
    const accountId = document.getElementById("impAccount").value;
    if (!accountId || _impRows.length === 0) return;
    const res = importTxRows(App.state, accountId, _impRows);
    saveState(App.state);
    /* Si un filtre comptes est actif, ajoute le compte cible pour que les
       transactions importées soient visibles immédiatement. */
    if (res.added > 0 && App.txAccounts.size > 0) App.txAccounts.add(accountId);
    renderAll();
    closeModal("modalImport");
    toast(res.added + " transaction" + (res.added > 1 ? "s" : "") + " importée" + (res.added > 1 ? "s" : "") + (res.skipped ? " · " + res.skipped + " doublon(s) ignoré(s)" : ""), res.added > 0 ? "success" : "danger");
  });

  document.getElementById("btnReset").addEventListener("click", () => {
    if (confirm("Réinitialiser toutes les données et recharger le budget 2027 d'origine ?")) {
      App.state = resetState();
      propagateRecurring(App.state, 1);
      saveState(App.state);
      renderAll();
      toast("Données d'origine (Budget 2027) rechargées", "success");
    }
  });
}

/* ---------- Toasts ---------- */
function toast(msg, kind) {
  const el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 3200);
}

document.addEventListener("DOMContentLoaded", boot);
