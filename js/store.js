/* ============================================================
   Moonee — Store : persistance, helpers, statistiques
   ============================================================ */

const DB_KEY = "moonee_state_v4";
/* Ancienne clé (app renommée « Monjj » → « Moonee ») : lue une dernière fois
   puis copiée vers la nouvelle clé pour ne perdre aucune donnée. */
const LEGACY_DB_KEY = "monjj_state_v4";

/* ---------- Persistance ---------- */
function loadState() {
  try {
    let raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      /* Migration v10 : bascule de stockage monjj → moonee. Idempotent : si
         la nouvelle clé est absente, on lit l'ancienne, on la recopie et on
         la supprime pour ne pas la relire au prochain chargement. Le parse
         précède la copie : une donnée illisible n'est jamais détruite. */
      const legacy = localStorage.getItem(LEGACY_DB_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        localStorage.setItem(DB_KEY, legacy);
        localStorage.removeItem(LEGACY_DB_KEY);
        return parsed;
      }
    }
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return null;
}

function saveState(state) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

function initState() {
  const existing = loadState();
  if (existing && existing.accounts && existing.transactions && Array.isArray(existing.loans)) {
    /* Migration : ajoute la répartition David/Tommy si absente (état v2 créé avant cette fonctionnalité) */
    if (!existing.split) existing.split = buildSplit();
    /* Migration : ajoute les holdings si absents (état v3 créé avant cette fonctionnalité) */
    if (!existing.holdings) existing.holdings = buildHoldings(existing.accounts, existing.loans);
    /* Migration v5 : registre des dividendes mère-fille + re-liaison des comptes historiques.
       La re-liaison est exécutée UNE SEULE FOIS (flag linksMigrated) pour ne pas
       annuler un détachement volontaire de compte au prochain chargement. */
    if (!Array.isArray(existing.holdings.dividends)) existing.holdings.dividends = [];
    if (!existing.holdings.linksMigrated) {
      ensureHoldingLinks(existing);
      existing.holdings.linksMigrated = true;
    }
    /* Migration v6 : module biens immobiliers (comptes immo, table biens, tags).
       Idempotent : ne duplique rien si la table existe déjà. */
    if (!Array.isArray(existing.biens)) ensureBiens(existing);
    /* Migration v8 : propriétaire/adresse des biens + détenteur des prêts. */
    ensureBienOwners(existing);
    ensureLoanHolders(existing);
    /* Migration v9 : reclassification sémantique de comptes particuliers
       (CPF → budget formation, Carte Débit Différé → ligne de débits). */
    ensureAccountTypes(existing);
    return existing;
  }
  const seeded = buildSeedData();
  saveState(seeded);
  return seeded;
}

function resetState() {
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem(LEGACY_DB_KEY);
  const seeded = buildSeedData();
  saveState(seeded);
  return seeded;
}

let _seq = 1;
function uid(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + (_seq++).toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

/* ---------- Dates ---------- */
function monthKey(date) {
  const d = new Date(date);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function currentMonthKey() {
  return monthKey(new Date());
}

function addMonths(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dayLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function monthOf(dateStr) {
  return dateStr.slice(0, 7);
}

function lastNMonthKeys(n) {
  const out = [];
  const now = currentMonthKey();
  for (let i = n - 1; i >= 0; i--) out.push(addMonths(now, -i));
  return out;
}

/* ---------- Formatage ---------- */
const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const eurFmt0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

function fmtEUR(v) { return eurFmt.format(v || 0); }
function fmtEUR0(v) { return eurFmt0.format(v || 0); }
function fmtNum(v) { return numFmt.format(v || 0); }
function fmtPct(v, digits = 0) {
  return (v * 100).toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 }) + " %";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ============================================================
   Statistiques
   ============================================================ */

/* Somme des flux d'une liste de transactions, par type */
function sumTx(list, type, catFilter) {
  let s = 0;
  for (const t of list) {
    if (type && t.type !== type) continue;
    if (catFilter && t.category !== catFilter) continue;
    s += Number(t.amount) || 0;
  }
  return s;
}

function txOfMonth(state, key, type) {
  return state.transactions.filter(t => monthOf(t.date) === key && (!type || t.type === type));
}

function txOfRange(state, keys) {
  const set = new Set(keys);
  return state.transactions.filter(t => set.has(monthOf(t.date)));
}

/* Revenus / dépenses / épargne d'un mois */
function monthlySums(state, key) {
  const list = txOfMonth(state, key);
  const income = sumTx(list, "income");
  const expenses = sumTx(list, "expense");
  const epargne = sumTx(list, "expense", "epargne");
  return { income, expenses, epargne, spending: expenses - epargne };
}

/* Moyenne sur les n derniers mois (hors mois courant incomplet = mois courant inclus quand même) */
function avgMonthly(state, n = 12) {
  const keys = lastNMonthKeys(n);
  let inc = 0, exp = 0, ep = 0;
  keys.forEach(k => {
    const s = monthlySums(state, k);
    inc += s.income; exp += s.spending; ep += s.epargne;
  });
  return { income: inc / n, spending: exp / n, epargne: ep / n };
}

function netWorth(state) {
  const assets = state.accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const debts = state.loans.reduce((s, l) => s + (Number(l.remaining) || 0), 0);
  return assets - debts;
}

/* Méta d'un type de compte, avec repli sûr : un état ancien (ou un cache
   navigateur périmé) peut porter un type inconnu — on retombe sur une
   présentation neutre au lieu de planter le rendu. */
function accountMeta(type) {
  return ACCOUNT_TYPES[type] || { label: "Compte", icon: "🏦", group: "autre", color: "#86868b", liquid: false };
}

function groupTotals(state) {
  const out = {};
  state.accounts.forEach(a => {
    const t = ACCOUNT_TYPES[a.type];
    if (!t) return; /* type inconnu (état ancien / migration) : on l'ignore sans planter */
    out[t.group] = (out[t.group] || 0) + (Number(a.balance) || 0);
  });
  return out;
}

/* Liquidités mobilisables (comptes + épargne réglementée + espèces, hors CAT) */
function liquidAssets(state) {
  let s = 0;
  state.accounts.forEach(a => {
    const t = ACCOUNT_TYPES[a.type];
    if (t && t.liquid) s += Number(a.balance) || 0;
  });
  return s;
}

/* Comptes rattachés à une entité (holding / société) */
function holdingAccountIds(state) {
  const ids = new Set();
  holdingsConfig(state).entities.forEach(e =>
    (e.accountIds || []).forEach(id => ids.add(id))
  );
  return ids;
}

/* Liquidités PERSONNELLES : hors comptes liés à une société (SCI TODA, Space Unity…) */
function personalLiquidAssets(state) {
  const excl = holdingAccountIds(state);
  let s = 0;
  state.accounts.forEach(a => {
    const t = ACCOUNT_TYPES[a.type];
    if (t && t.liquid && !excl.has(a.id)) s += Number(a.balance) || 0;
  });
  return s;
}

/* Liquidités détenues par les sociétés (comptes liés à une entité) */
function companyLiquidAssets(state) {
  const incl = holdingAccountIds(state);
  let s = 0;
  state.accounts.forEach(a => {
    const t = ACCOUNT_TYPES[a.type];
    if (t && t.liquid && incl.has(a.id)) s += Number(a.balance) || 0;
  });
  return s;
}

/* Totaux par groupe, HORS comptes liés à une société (pour l'épargne réglementée perso) */
function personalGroupTotals(state) {
  const excl = holdingAccountIds(state);
  const out = {};
  state.accounts.forEach(a => {
    if (excl.has(a.id)) return;
    const t = ACCOUNT_TYPES[a.type];
    if (!t) return; /* type inconnu (état ancien / migration) : on l'ignore sans planter */
    out[t.group] = (out[t.group] || 0) + (Number(a.balance) || 0);
  });
  return out;
}

function totalDebt(state) {
  return state.loans.reduce((s, l) => s + (Number(l.remaining) || 0), 0);
}

function monthlyDebtPayments(state) {
  return state.loans.reduce((s, l) => s + (Number(l.monthly) || 0), 0);
}

/* ---------- Segmentation perso / entreprise ---------- */

/* Actif total des comptes, segmenté : perso (hors sociétés) vs entreprises
   (comptes liés à une entité). total = perso + entreprise. */
function assetSplit(state) {
  const excl = holdingAccountIds(state);
  let perso = 0, entreprise = 0;
  state.accounts.forEach(a => {
    const bal = Number(a.balance) || 0;
    if (excl.has(a.id)) entreprise += bal;
    else perso += bal;
  });
  return { perso, entreprise, total: perso + entreprise };
}

/* Endettement segmenté par détenteur (personne physique vs entreprise),
   capital restant ET mensualités. total = perso + entreprise. */
function debtSplit(state) {
  let perso = 0, entreprise = 0, monthlyPerso = 0, monthlyEnt = 0;
  state.loans.forEach(l => {
    const rem = Number(l.remaining) || 0;
    const mon = Number(l.monthly) || 0;
    if (loanHolder(state, l).kind === "entity") { entreprise += rem; monthlyEnt += mon; }
    else { perso += rem; monthlyPerso += mon; }
  });
  return {
    perso, entreprise, total: perso + entreprise,
    monthlyPerso, monthlyEnt, monthlyTotal: monthlyPerso + monthlyEnt,
  };
}

/* Flux mensuels moyens (n mois) segmentés perso / entreprise par compte :
   revenus, dépenses hors épargne, épargne. Utile pour comparer la structure
   des charges et revenus des deux pôles. */
function monthlyFlowSplit(state, n = 12) {
  const keys = lastNMonthKeys(n);
  const excl = holdingAccountIds(state);
  const acc = { pInc: 0, pExp: 0, pEpar: 0, eInc: 0, eExp: 0, eEpar: 0 };
  keys.forEach(k => {
    txOfMonth(state, k).forEach(t => {
      const inEnt = excl.has(t.account);
      const amt = Number(t.amount) || 0;
      if (t.type === "income") { if (inEnt) acc.eInc += amt; else acc.pInc += amt; }
      else if (t.category === "epargne") { if (inEnt) acc.eEpar += amt; else acc.pEpar += amt; }
      else { if (inEnt) acc.eExp += amt; else acc.pExp += amt; }
    });
  });
  const d = n || 1;
  return {
    perso: { income: acc.pInc / d, spending: acc.pExp / d, epargne: acc.pEpar / d },
    entreprise: { income: acc.eInc / d, spending: acc.eExp / d, epargne: acc.eEpar / d },
  };
}

/* Totaux par groupe d'actifs pour les sociétés uniquement (comptes liés à une entité) */
function companyGroupTotals(state) {
  const incl = holdingAccountIds(state);
  const out = {};
  state.accounts.forEach(a => {
    if (!incl.has(a.id)) return;
    const t = ACCOUNT_TYPES[a.type];
    if (!t) return; /* type inconnu (état ancien / migration) : on l'ignore sans planter */
    out[t.group] = (out[t.group] || 0) + (Number(a.balance) || 0);
  });
  return out;
}

/* Mois de sécurité = liquidités PERSONNELLES / dépenses moyennes mensuelles.
   Les comptes des sociétés (SCI TODA, Space Unity) sont exclus : ils ne
   couvrent pas les dépenses personnelles. */
function monthsOfSafety(state) {
  const avg = avgMonthly(state, 12).spending;
  if (avg <= 0) return null;
  return personalLiquidAssets(state) / avg;
}

/* Ratio d'endettement = mensualités / revenus moyens */
function debtRatio(state) {
  const inc = avgMonthly(state, 12).income;
  if (inc <= 0) return null;
  return monthlyDebtPayments(state) / inc;
}

/* Taux d'épargne moyen = épargne / revenus */
function savingsRate(state) {
  const avg = avgMonthly(state, 12);
  if (avg.income <= 0) return null;
  return avg.epargne / avg.income;
}

/* Répartition des charges par nature sur les 12 derniers mois */
function necessitySplit(state) {
  const keys = lastNMonthKeys(12);
  const list = txOfRange(state, keys).filter(t => t.type === "expense");
  const out = { obligatoire: 0, optionnelle: 0, ponctuelle: 0, epargne: 0 };
  list.forEach(t => {
    const n = t.necessity || "ponctuelle";
    if (out[n] !== undefined) out[n] += Number(t.amount) || 0;
    else out.ponctuelle += Number(t.amount) || 0;
  });
  return out;
}

/* Totaux par catégorie (12 derniers mois) */
function categoryTotals(state, type) {
  const keys = lastNMonthKeys(12);
  const list = txOfRange(state, keys).filter(t => t.type === type);
  const out = {};
  list.forEach(t => { out[t.category] = (out[t.category] || 0) + (Number(t.amount) || 0); });
  return out;
}

/* Série du patrimoine net sur les 12 derniers mois (hors flux d'épargne interne) */
function netWorthSeries(state) {
  const keys = lastNMonthKeys(12);
  const flows = {}; // flux nets (revenus - dépenses réelles) par mois
  keys.forEach(k => {
    const s = monthlySums(state, k);
    flows[k] = s.income - s.spending;
  });
  const current = netWorth(state);
  const out = [];
  let futureFlows = 0;
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i];
    out.unshift({ key: k, value: Math.round(current - futureFlows) });
    futureFlows += flows[k];
  }
  return out;
}

/* ============================================================
   Répartition David / Tommy
   ============================================================ */

/* Configuration du partage (valeurs sûres même si split absent) */
function splitConfig(state) {
  const s = state.split || {};
  return {
    rent: Number(s.rent) || 0,
    salaryDavid: Number(s.salaryDavid) || 0,
    salaryTommy: Number(s.salaryTommy) || 0,
    shareDavid: Number(s.shareDavid) || 0,
    shareTommy: Number(s.shareTommy) || 0,
    debtDavid: Number(s.debtDavid) || 0,
    debtTommy: Number(s.debtTommy) || 0,
    months: Array.isArray(s.months) ? s.months : [],
  };
}

/* Enregistrement d'un mois donné (ou record vide) */
function splitMonth(state, key) {
  const cfg = splitConfig(state);
  const rec = cfg.months.find(m => m.key === key);
  return rec
    ? { key, davidPaid: Number(rec.davidPaid) || 0, tommyPaid: Number(rec.tommyPaid) || 0, note: rec.note || "" }
    : { key, davidPaid: 0, tommyPaid: 0, note: "" };
}

/* Ajoute / met à jour l'enregistrement d'un mois */
function splitUpsert(state, rec) {
  if (!state.split) state.split = {};
  if (!Array.isArray(state.split.months)) state.split.months = [];
  const cfg = splitConfig(state);
  const i = cfg.months.findIndex(m => m.key === rec.key);
  if (i >= 0) cfg.months[i] = rec;
  else cfg.months.push(rec);
}

/* Met à jour le loyer Davout et les salaires, puis recalcule la clé de
   répartition (parts proportionnelles aux revenus). */
function splitUpdateConfig(state, { rent, salaryDavid, salaryTommy }) {
  const s = state.split || (state.split = {});
  s.rent = Math.max(0, Number(rent) || 0);
  s.salaryDavid = Math.max(0, Number(salaryDavid) || 0);
  s.salaryTommy = Math.max(0, Number(salaryTommy) || 0);
  const total = s.salaryDavid + s.salaryTommy;
  const round2 = v => Math.round(v * 100) / 100;
  s.shareDavid = total > 0 ? round2((s.rent * s.salaryDavid) / total) : 0;
  s.shareTommy = total > 0 ? round2((s.rent * s.salaryTommy) / total) : 0;
  return splitConfig(state);
}

/* Écart du mois : part de David non versée (0 si versée intégralement).
   NB : un éventuel suro-paiement de David est plafonné à 0 — la dette ne peut
   pas devenir positive (crédit en faveur de David). Choix volontaire pour un
   suivi simple de la dette. */
function splitGap(state, key, person = "david") {
  const cfg = splitConfig(state);
  const m = splitMonth(state, key);
  const share = person === "tommy" ? cfg.shareTommy : cfg.shareDavid;
  const paid = person === "tommy" ? m.tommyPaid : m.davidPaid;
  return Math.max(0, share - paid);
}

/* Dette cumulée sur les 12 derniers mois (négative = la personne doit).
   person : "david" (défaut) ou "tommy". */
function splitDebtSeries(state, person = "david") {
  const cfg = splitConfig(state);
  const keys = lastNMonthKeys(12);
  const isTommy = person === "tommy";
  let debt = isTommy ? cfg.debtTommy : cfg.debtDavid; // dette à fin du mois courant
  const out = [];
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i];
    out.unshift({ key: k, value: Math.round(debt) });
    const m = splitMonth(state, k);
    const share = isTommy ? cfg.shareTommy : cfg.shareDavid;
    const paid = isTommy ? m.tommyPaid : m.davidPaid;
    debt += share - paid; // dette à fin du mois précédent
  }
  return out;
}

/* Nb de mois consécutifs (remontant depuis le mois courant) sans versement intégral de David */
function splitStreak(state) {
  const cfg = splitConfig(state);
  const keys = lastNMonthKeys(12);
  let streak = 0;
  for (let i = keys.length - 1; i >= 0; i--) {
    const m = splitMonth(state, keys[i]);
    if (m.davidPaid < cfg.shareDavid - 0.005) streak++;
    else break;
  }
  return streak;
}

/* ============================================================
   Holdings & sociétés
   ============================================================ */

/* Configuration sûre des holdings */
function holdingsConfig(state) {
  return {
    entities: Array.isArray(state.holdings?.entities) ? state.holdings.entities : [],
  };
}

function holdingById(state, id) {
  return holdingsConfig(state).entities.find(e => e.id === id) || null;
}

/* Valeur nette directe d'une entité : comptes liés − prêts liés */
function holdingNetValue(state, entity) {
  const assets = (entity.accountIds || []).reduce((s, id) => {
    const a = state.accounts.find(x => x.id === id);
    return s + (a ? Number(a.balance) || 0 : 0);
  }, 0);
  const debts = (entity.loanIds || []).reduce((s, id) => {
    const l = (state.loans || []).find(x => x.id === id);
    return s + (l ? Number(l.remaining) || 0 : 0);
  }, 0);
  return assets - debts;
}

/* Valeur nette totale du groupe : somme des valeurs consolidées des entités de
   tête (mère-fille). Les filiales ne sont comptées qu'à travers leur mère —
   cela évite la double comptabilisation. */
function totalHoldingsValue(state) {
  return holdingTopLevel(state).reduce((s, e) => s + holdingConsolidatedValue(state, e), 0);
}

/* Propriété effective : pour chaque entité, la part détenue par chaque personne physique,
   en remontant récursivement la chaîne de détention (ex. SCI TODA → 75 % Space Unity
   → 75 % Tommy ; 25 % Margooya → 25 % David). */
function effectiveOwnership(state) {
  const cfg = holdingsConfig(state);
  const memo = {};
  function resolve(entityId, seen) {
    if (memo[entityId]) return memo[entityId];
    if (seen.has(entityId)) return []; // garde anti-cycle
    seen.add(entityId);
    const ent = cfg.entities.find(e => e.id === entityId);
    if (!ent) return [];
    const out = [];
    (ent.owners || []).forEach(o => {
      const share = (Number(o.share) || 0) / 100;
      if (o.kind === "person") {
        out.push({ person: o.id, share });
      } else {
        resolve(o.id, seen).forEach(sub => {
          out.push({ person: sub.person, share: sub.share * share });
        });
      }
    });
    /* Agrége les parts par personne */
    const merged = {};
    out.forEach(x => { merged[x.person] = (merged[x.person] || 0) + x.share; });
    const res = Object.entries(merged).map(([person, share]) => ({ person, share }));
    memo[entityId] = res;
    return res;
  }
  const result = {};
  cfg.entities.forEach(e => { result[e.id] = resolve(e.id, new Set()); });
  return result;
}

/* Valeur nette effective par personne (consolidation via la propriété effective) */
function personHoldingsValue(state) {
  const eff = effectiveOwnership(state);
  const out = {};
  PERSONS.forEach(p => out[p.id] = 0);
  holdingsConfig(state).entities.forEach(e => {
    const nv = holdingNetValue(state, e);
    (eff[e.id] || []).forEach(({ person, share }) => {
      out[person] = (out[person] || 0) + nv * share;
    });
  });
  return out;
}

/* Chaque entité avec sa valeur nette directe (pour graphiques / tableaux) */
function holdingSummaries(state) {
  const eff = effectiveOwnership(state);
  return holdingsConfig(state).entities.map(e => ({
    entity: e,
    value: holdingNetValue(state, e),
    consolidated: holdingConsolidatedValue(state, e),
    children: holdingChildren(state, e.id),
    dividendsReceived: dividendsReceived(state, e.id),
    owners: e.owners || [],
    effective: eff[e.id] || [],
  }));
}

/* ============================================================
   Mère-fille : filiales, consolidation & dividendes
   ============================================================ */

/* Filiales directes : entités dont cette entité est associée (kind entity) */
function holdingChildren(state, entityId) {
  return holdingsConfig(state).entities.filter(e =>
    (e.owners || []).some(o => o.kind === "entity" && o.id === entityId)
  );
}

/* Valeur nette consolidée d'une entité : valeur directe (comptes − prêts liés)
   + part % de la valeur consolidée de chacune de ses FILIALES (entités dont
   elle est associée), récursivement. Garde anti-cycle : une boucle de détention
   est ignorée. */
function holdingConsolidatedValue(state, entity) {
  const cfg = holdingsConfig(state);
  const memo = {};
  function rec(id, seen) {
    if (memo[id] !== undefined) return memo[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const ent = cfg.entities.find(x => x.id === id);
    if (!ent) return 0;
    let v = holdingNetValue(state, ent);
    /* Filiales de cette entité : sa part dans chacune */
    holdingChildren(state, id).forEach(child => {
      const own = (child.owners || []).find(o => o.kind === "entity" && o.id === id);
      const share = (Number(own && own.share) || 0) / 100;
      v += share * rec(child.id, seen);
    });
    seen.delete(id);
    memo[id] = v;
    return v;
  }
  return rec(entity.id, new Set());
}

/* Entités de tête : non détenues par une autre entité (racines du groupe) */
function holdingTopLevel(state) {
  const cfg = holdingsConfig(state);
  const owned = new Set();
  cfg.entities.forEach(e =>
    (e.owners || []).forEach(o => { if (o.kind === "entity") owned.add(e.id); })
  );
  return cfg.entities.filter(e => !owned.has(e.id));
}

/* Dividendes remontés (mère-fille) : { id, from, to, month, amount, note } */
function holdingDividends(state) {
  return Array.isArray(state.holdings?.dividends) ? state.holdings.dividends : [];
}

/* Total des dividendes reçus par une entité (n derniers mois) */
function dividendsReceived(state, entityId, months = 12) {
  const keys = new Set(lastNMonthKeys(months));
  return holdingDividends(state)
    .filter(d => d.to === entityId && keys.has(d.month))
    .reduce((s, d) => s + (Number(d.amount) || 0), 0);
}

/* Total des dividendes versés par une entité (n derniers mois) */
function dividendsPaid(state, entityId, months = 12) {
  const keys = new Set(lastNMonthKeys(months));
  return holdingDividends(state)
    .filter(d => d.from === entityId && keys.has(d.month))
    .reduce((s, d) => s + (Number(d.amount) || 0), 0);
}

/* Re-lie les comptes historiques aux entités connues si le lien manque
   (les états antérieurs peuvent avoir le compte orphelin) */
function ensureHoldingLinks(state) {
  if (!state.holdings) return;
  const link = (eid, name) => {
    const e = state.holdings.entities.find(x => x.id === eid);
    const a = state.accounts.find(x => x.name === name);
    if (e && a && !(e.accountIds || []).includes(a.id)) {
      if (!Array.isArray(e.accountIds)) e.accountIds = [];
      e.accountIds.push(a.id);
    }
  };
  link("h-space", "CA - Space Unity");
  link("h-toda", "CA - SCI TODA Compte");
}

/* ============================================================
   Biens immobiliers
   ============================================================ */

function biensConfig(state) {
  return Array.isArray(state.biens) ? state.biens : [];
}

function bienById(state, id) {
  return biensConfig(state).find(b => b.id === id) || null;
}

/* Propriétaire d'un bien : une personne physique ou une entreprise.
   Compatibilité : les anciens états portent bien.entityId (entreprise) ;
   sans propriétaire déclaré, le bien appartient à Tommy par défaut. */
function bienOwner(state, bien) {
  if (bien && bien.owner && bien.owner.kind && bien.owner.id) return bien.owner;
  if (bien && bien.entityId) return { kind: "entity", id: bien.entityId };
  return { kind: "person", id: "tommy" };
}

/* Détenteur d'un prêt : une personne physique ou une entreprise (défaut Tommy). */
function loanHolder(state, loan) {
  if (loan && loan.holder && loan.holder.kind && loan.holder.id) return loan.holder;
  return { kind: "person", id: "tommy" };
}

/* Prêts liés à un bien */
function bienLoans(state, bien) {
  return (bien.loanIds || []).map(id => (state.loans || []).find(l => l.id === id)).filter(Boolean);
}

/* Mensualités totales des prêts d'un bien */
function bienLoansMonthly(state, bien) {
  return bienLoans(state, bien).reduce((s, l) => s + (Number(l.monthly) || 0), 0);
}

/* Valeur estimée du bien : le compte immo fait foi (éditable dans Comptes),
   sinon on retombe sur la valeur déclarée sur le bien. */
function bienValue(state, bien) {
  const acc = (bien.accountIds || []).map(id => state.accounts.find(a => a.id === id)).find(a => a && a.type === "immo");
  return acc ? (Number(acc.balance) || 0) : (Number(bien.valeur) || 0);
}

/* Dette restante liée au bien */
function bienDebt(state, bien) {
  return bienLoans(state, bien).reduce((s, l) => s + (Number(l.remaining) || 0), 0);
}

/* Fonds propres du bien = valeur − dette */
function bienEquity(state, bien) {
  return bienValue(state, bien) - bienDebt(state, bien);
}

/* Flux mensuels du bien : loyers et charges d'exploitation dérivés des SÉRIES
   RÉCURRENTES LIÉES au bien (bienRecurringSeries — la même source que la modale
   « Flux récurrents liés »), plus les mensualités des prêts liés. Chaque série
   compte pour son montant mensuel, indépendamment de la présence du tag bien
   sur chaque occurrence historique (un historique partiellement tagué ne
   fausse plus le calcul — cohérence garantie entre modale et widgets). */
function bienFlows(state, bien) {
  const series = bienRecurringSeries(state, bien);
  const incomeMonthly = series.reduce((s, t) => s + (t.type === "income" ? (Number(t.amount) || 0) : 0), 0);
  const chargesMonthly = series.reduce((s, t) => s + (t.type === "expense" ? (Number(t.amount) || 0) : 0), 0);
  const loansMonthly = bienLoansMonthly(state, bien);
  return {
    incomeMonthly, chargesMonthly,
    loansMonthly,
    cashflowMonthly: incomeMonthly - chargesMonthly - loansMonthly,
    income: incomeMonthly * 12, charges: chargesMonthly * 12,
  };
}

/* Séries récurrentes rattachées à un bien (taguées t.bien OU référencées par
   bien.flowKeys) : une entrée par série, le modèle étant l'occurrence la plus
   récente. C'est la liste des « charges et revenus récurrents » du bien. */
function bienRecurringSeries(state, bien) {
  const flowKeys = new Set(bien.flowKeys || []);
  return recurringSeriesTemplates(state).filter(t =>
    t.bien === bien.id || flowKeys.has(recurringSeriesKey(t))
  );
}

/* Performance annuelle du bien : revenus, charges d'exploitation,
   remboursement annuel des prêts, résultat avant prêts et cashflow net
   annuel. L'annualisation découle des flux mensuels de bienFlows (séries
   récurrentes liées — run-rate annualisé, pas un historique réel).
   flows (optionnel) : flux mensuels pré-calculés pour éviter un recalcul. */
function bienAnnualFlows(state, bien, flows) {
  const f = flows || bienFlows(state, bien);
  const income = f.incomeMonthly * 12;
  const charges = f.chargesMonthly * 12;
  const loans = f.loansMonthly * 12;
  return {
    income, charges, loans,
    resultNet: income - charges,
    cashflowNet: f.cashflowMonthly * 12,
  };
}

/* Rendement « cash-on-cash » = cashflow net annuel (après prêts) / valeur.
   annual (optionnel) : performance annuelle pré-calculée. */
function bienCashYield(state, bien, annual) {
  const v = bienValue(state, bien);
  if (v <= 0) return null;
  const a = annual || bienAnnualFlows(state, bien);
  return a.cashflowNet / v;
}

/* Rendement brut = loyers annuels / valeur */
function bienGrossYield(state, bien) {
  const v = bienValue(state, bien);
  if (v <= 0) return null;
  return (bienFlows(state, bien).incomeMonthly * 12) / v;
}

/* Rendement net = (loyers − charges) / valeur */
function bienNetYield(state, bien) {
  const v = bienValue(state, bien);
  if (v <= 0) return null;
  const f = bienFlows(state, bien);
  return ((f.incomeMonthly - f.chargesMonthly) * 12) / v;
}

/* Suivi des travaux d'un bien */
function bienTravaux(state, bien) {
  const t = bien.travaux || {};
  return { budget: Number(t.budget) || 0, spent: Number(t.spent) || 0 };
}

/* Mois de trésorerie couverts par les liquidités liées au bien
   (comptes liquides du bien / charges + mensualités mensuelles) */
function bienReserveMonths(state, bien) {
  /* Aucun compte liquide lié au bien : réserve non mesurable (pas 0 mois,
     ce qui déclencherait une fausse alerte sur un bien créé via la modale). */
  const liquidAccounts = (bien.accountIds || []).filter(id => {
    const a = state.accounts.find(x => x.id === id);
    return a && ACCOUNT_TYPES[a.type] && ACCOUNT_TYPES[a.type].liquid;
  });
  if (liquidAccounts.length === 0) return null;
  const liquid = liquidAccounts.reduce((s, id) => s + (Number(state.accounts.find(x => x.id === id).balance) || 0), 0);
  const f = bienFlows(state, bien);
  const out = f.chargesMonthly + f.loansMonthly;
  if (out <= 0) return null;
  return liquid / out;
}

/* Nb de classes d'actifs significatives pour la diversification : l'immobilier compte
   comme une classe à part entière ; les autres classes sont mesurées sur la base des
   actifs HORS immobilier (sinon une grosse valorisation immobilière masquerait toutes
   les autres classes sous le seuil de 3 %). */
function diversificationClasses(state) {
  const totals = groupTotals(state);
  const immo = totals.immobilier || 0;
  const assets = state.accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const base = Math.max(0, assets - immo);
  const classes = Object.keys(totals)
    .filter(g => g !== "immobilier" && (totals[g] || 0) > base * 0.03).length;
  return classes + (immo > 0 ? 1 : 0);
}

/* Migration v9 : reclassification de comptes particuliers pour refléter la
   réalité — « CPF » est un budget formation de l'État (crédité ~500 €/an,
   financé par les entreprises via la contribution formation, utilisable en
   formation professionnelle), pas un placement à terme ; « CA - Tommy Carte
   Débit Différé » est une ligne de débits CB à venir (différé de paiement),
   pas un compte courant. Idempotent : ne change le type que s'il est encore
   l'ancien, sans écraser un choix ultérieur de l'utilisateur. */
function ensureAccountTypes(state) {
  const reclass = {
    "CPF": { from: "terme", to: "formation" },
    "CA - Tommy Carte Débit Différé": { from: "courant", to: "debit_differe" },
  };
  state.accounts.forEach(a => {
    const r = reclass[a.name];
    if (r && a.type === r.from) a.type = r.to;
  });
}

/* Migration : propriétaire (personne/entreprise) + adresse sur les biens, et
   détenteur (personne/entreprise) sur les prêts. Idempotent : ne remplit que
   les champs absents, sans écraser un choix ultérieur de l'utilisateur. */
function ensureBienOwners(state) {
  biensConfig(state).forEach(b => {
    if (!b.owner || !b.owner.kind || !b.owner.id) {
      b.owner = b.entityId ? { kind: "entity", id: b.entityId } : { kind: "person", id: "tommy" };
    }
    if (b.address === undefined) b.address = "";
  });
}

function ensureLoanHolders(state) {
  (state.loans || []).forEach(l => {
    if (l.holder && l.holder.kind && l.holder.id) return;
    /* Un prêt lié à un seul bien hérite du propriétaire de ce bien */
    const biens = biensConfig(state).filter(b => (b.loanIds || []).includes(l.id));
    l.holder = biens.length === 1 ? bienOwner(state, biens[0]) : { kind: "person", id: "tommy" };
  });
}

/* Migration : ajoute le module « Biens immobiliers » à un état existant.
   Crée les comptes immo manquants, lie le bien Chrl à la SCI TODA, construit
   la table biens et re-tague les transactions historiques par libellé. */
function ensureBiens(state) {
  const byName = n => state.accounts.find(a => a.name === n);
  const ensureAccount = (name, type, institution, balance) => {
    let a = byName(name);
    if (!a) {
      a = { id: uid("a"), type, name, institution, balance, rate: null, limit: null, opened: null };
      state.accounts.push(a);
    }
    return a;
  };
  const valImmo = ensureAccount("Bien — VAL (Ste)", "immo", "LCL", 185000);
  const chrlImmo = ensureAccount("Bien — Chrl (SCI)", "immo", "Crédit Agricole", 420000);

  /* Lien du compte immo Chrl à la SCI TODA (consolidation) */
  const toda = (state.holdings?.entities || []).find(e => e.id === "h-toda");
  if (toda && !(toda.accountIds || []).includes(chrlImmo.id)) {
    if (!Array.isArray(toda.accountIds)) toda.accountIds = [];
    toda.accountIds.push(chrlImmo.id);
  }

  /* Re-tague les transactions historiques connues par libellé */
  const tag = {
    "Loyers — VAL": "b-val",
    "Assurance de prêt": "b-val",
    "Assurance habitation — Friday": "b-val",
    "Charges copropriété": "b-chrl",
    "Taxe foncière": "b-chrl",
  };
  state.transactions.forEach(t => {
    if (tag[t.label] && !t.bien) t.bien = tag[t.label];
  });

  state.biens = buildBiens(state.accounts, state.loans);
}

/* ============================================================
   Simulateur : remontée de trésorerie (mère-fille)
   ============================================================ */

/* Trouve une entité par id connu, sinon par nom (insensible à la casse) */
function holdingByHint(state, hint) {
  const cfg = holdingsConfig(state);
  return cfg.entities.find(e => e.id === hint)
    || cfg.entities.find(e => e.name.toLowerCase().includes(String(hint).toLowerCase()))
    || null;
}

/* Premier compte LIQUIDE lié à une entité (ou null) */
function entityLiquidAccount(state, entity) {
  if (!entity) return null;
  const list = (entity.accountIds || [])
    .map(id => state.accounts.find(a => a.id === id))
    .filter(Boolean);
  return list.find(a => ACCOUNT_TYPES[a.type] && ACCOUNT_TYPES[a.type].liquid) || list[0] || null;
}

/* Mensualités des prêts liés à une entité */
function entityLoanMonthly(state, entity) {
  if (!entity) return 0;
  return (entity.loanIds || []).reduce((s, id) => {
    const l = (state.loans || []).find(x => x.id === id);
    return s + (l ? Number(l.monthly) || 0 : 0);
  }, 0);
}

/* PFU (prélèvement forfaitaire unique) sur les dividendes de personnes physiques :
   12,8 % d'impôt sur le revenu + 17,2 % de prélèvements sociaux = 30 % retenus à la source. */
const PFU_RATE = 0.30;

/* Crédit d'impôt IR-PME (art. 199 terdecies-0 B du CGI) : 18 % de la souscription au
   capital d'une PME éligible (jeune entreprise < 7 ans, conservation 5 ans, secteurs
   éligibles), plafonné à 9 000 €/an pour un contribuable célibataire (50 000 € investis). */
const IR_PME_RATE = 0.18;
const IR_PME_CAP = 9000;

/* Simulation d'une remontée de trésorerie fille → mère (ex : SCI TODA → Space Unity),
   optionnellement distribuée jusqu'à la personne physique (étape « perso »), versée
   comme dividende de la holding à Tommy avec PFU 30 % retenu à la source (étape « dividende »),
   ou apportée par Tommy au capital de sa SASU avec crédit d'impôt IR-PME (étape « apport »).
   NE MUTE PAS l'état. Retourne les métriques avant/après pour le widget.
   stage : "holding" | "perso" | "dividende" | "apport". */
function cashRemittanceSim(state, amount, stage) {
  const sci = holdingByHint(state, "h-toda");
  const su  = holdingByHint(state, "h-space");
  const sciAcc = entityLiquidAccount(state, sci);
  const suAcc  = entityLiquidAccount(state, su);
  if (!sciAcc || !suAcc) return null;

  const isDividend = stage === "dividende";
  const isApport = stage === "apport";
  const toPerson = stage === "perso" || isDividend;

  /* Source du montant : Space Unity verse (dividende), la SCI TODA remonte
     (holding/perso), ou la poche perso de Tommy apporte (apport). */
  const srcAcc = isDividend ? suAcc : sciAcc;
  const max = isApport
    ? Math.max(0, personalLiquidAssets(state))
    : Math.max(0, Number(srcAcc.balance) || 0);
  const gross = Math.max(0, Math.min(Number(amount) || 0, max));

  /* Fiscalité par étape */
  const pfu = isDividend ? PFU_RATE : 0;
  const tax = gross * pfu;
  /* IR-PME : crédit d'impôt = 18 % de l'apport, plafonné à 9 000 €/an */
  const credit = isApport ? Math.min(gross * IR_PME_RATE, IR_PME_CAP) : 0;
  const net = gross - tax; /* net perçu par Tommy (dividende) ou montant remonté */

  const sciBal = Number(sciAcc.balance) || 0;
  const suBal  = Number(suAcc.balance) || 0;

  let sciAfter, suAfter;
  if (isDividend) {
    /* Space Unity verse le dividende à Tommy */
    sciAfter = sciBal;
    suAfter  = suBal - gross;
  } else if (isApport) {
    /* Tommy apporte au capital de sa SASU : la trésorerie de Space Unity augmente */
    sciAfter = sciBal;
    suAfter  = suBal + gross;
  } else if (stage === "perso") {
    /* SCI remonte, la mère reverse immédiatement à Tommy */
    sciAfter = sciBal - gross;
    suAfter  = suBal;
  } else {
    /* holding : remontée SCI → Space Unity */
    sciAfter = sciBal - gross;
    suAfter  = suBal + gross;
  }

  const cLiqBefore = companyLiquidAssets(state);
  let cLiqAfter;
  if (isApport) cLiqAfter = cLiqBefore + gross;      /* le cash entre dans les sociétés */
  else if (toPerson) cLiqAfter = cLiqBefore - gross; /* perso/dividende : il en sort */
  else cLiqAfter = cLiqBefore;                        /* holding : il circule en interne */

  const pLiqBefore = personalLiquidAssets(state);
  let pLiqAfter;
  if (isApport) pLiqAfter = pLiqBefore - gross + credit; /* − apport + crédit d'impôt */
  else if (toPerson) pLiqAfter = pLiqBefore + net;       /* + net reçu */
  else pLiqAfter = pLiqBefore;                            /* holding : inchangé */

  const avgSpend = avgMonthly(state, 12).spending;
  const mosBefore = avgSpend > 0 ? pLiqBefore / avgSpend : null;
  const mosAfter  = avgSpend > 0 ? pLiqAfter / avgSpend : null;

  /* Propriété effective du cash des sociétés (SCI + Space Unity) */
  const eff = effectiveOwnership(state);
  const shareOf = (entId, personId) => (eff[entId] || []).find(x => x.person === personId)?.share || 0;
  const effTommyBefore = shareOf(sci.id, "tommy") * sciBal + shareOf(su.id, "tommy") * suBal;
  const effDavidBefore = shareOf(sci.id, "david") * sciBal + shareOf(su.id, "david") * suBal;
  const effTommyAfter  = shareOf(sci.id, "tommy") * sciAfter + shareOf(su.id, "tommy") * suAfter;
  const effDavidAfter  = shareOf(sci.id, "david") * sciAfter + shareOf(su.id, "david") * suAfter;

  const hBefore = computeHealthScore(state);
  const hAfter  = simulateHealthScore(state, gross, stage);

  return {
    stage, isDividend, isApport, toPerson,
    gross, tax, net, credit, pfu, max,
    sciName: sciAcc.name, suName: suAcc.name,
    sciBal, suBal, sciAfter, suAfter,
    cLiqBefore, cLiqAfter,
    pLiqBefore, pLiqAfter,
    mosBefore, mosAfter,
    effTommyBefore, effTommyAfter, effDavidBefore, effDavidAfter,
    scoreBefore: hBefore.score, scoreAfter: hAfter.score,
    gradeBefore: hBefore.grade, gradeAfter: hAfter.grade,
    sciMonthly: entityLoanMonthly(state, sci),
    sciTommyShare: shareOf(sci.id, "tommy"),
    sciDavidShare: shareOf(sci.id, "david"),
  };
}

/* Compte perso liquide principal (courant de préférence, sinon premier liquide perso).
   Les fonds reçus (perso/dividende) et le crédit d'impôt y sont crédités. */
function mainPersonalCashAccount(state) {
  const excl = holdingAccountIds(state);
  const list = state.accounts.filter(a => ACCOUNT_TYPES[a.type] && ACCOUNT_TYPES[a.type].liquid && !excl.has(a.id));
  return list.find(a => a.type === "courant" || a.type === "joint" || a.type === "cash") || list[0] || null;
}

/* Répartit un débit (apport au capital) sur les comptes perso liquides, proportionnellement
   à leur solde : aucun compte ne passe en fort découvert artificiel (l'épargne réglementée
   finance la plus grosse part). Le crédit d'impôt IR-PME est ensuite crédité sur le principal. */
function applyApportToClone(clone, amount, credit) {
  const excl = holdingAccountIds(clone);
  const list = clone.accounts.filter(a => ACCOUNT_TYPES[a.type] && ACCOUNT_TYPES[a.type].liquid && !excl.has(a.id));
  const total = list.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  if (total <= 0) return;
  let remaining = amount;
  list.forEach((a, i) => {
    const bal = Math.max(0, Number(a.balance) || 0); // un compte à découvert n'apporte pas
    const share = i === list.length - 1
      ? remaining
      : Math.min(bal, bal / total * amount);
    a.balance = (Number(a.balance) || 0) - share;
    remaining -= share;
  });
  const main = mainPersonalCashAccount(clone);
  if (main) main.balance = (Number(main.balance) || 0) + credit;
}

/* Score de santé sur un état simulé (clone profond, aucune mutation) */
function simulateHealthScore(state, amount, stage) {
  if (!(amount > 0)) return computeHealthScore(state);
  const clone = JSON.parse(JSON.stringify(state));
  const sci = holdingByHint(clone, "h-toda");
  const su  = holdingByHint(clone, "h-space");
  const sciAcc = entityLiquidAccount(clone, sci);
  const suAcc  = entityLiquidAccount(clone, su);
  if (!sciAcc || !suAcc) return computeHealthScore(state);
  const isDividend = stage === "dividende";
  const isApport = stage === "apport";
  if (isApport) {
    /* Apport : la SASU reçoit gross ; la poche perso débourse gross, répartie
       proportionnellement, et récupère le crédit IR-PME sur le compte principal. */
    suAcc.balance = (Number(suAcc.balance) || 0) + amount;
    applyApportToClone(clone, amount, Math.min(amount * IR_PME_RATE, IR_PME_CAP));
  } else {
    /* La source est la SCI pour holding/perso, Space Unity pour le dividende */
    const srcAcc = isDividend ? suAcc : sciAcc;
    srcAcc.balance = (Number(srcAcc.balance) || 0) - amount;
    if (stage === "holding") {
      suAcc.balance = (Number(suAcc.balance) || 0) + amount;
    } else {
      /* perso : net = brut (pas de PFU) ; dividende : net = brut × (1 − PFU) */
      const main = mainPersonalCashAccount(clone);
      if (main) main.balance = (Number(main.balance) || 0) + amount * (isDividend ? (1 - PFU_RATE) : 1);
    }
  }
  return computeHealthScore(clone);
}

/* ============================================================
   Import de transactions (CSV collé ou fichier)
   ============================================================ */

/* Normalise une date : YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY → YYYY-MM-DD */
function normImportDate(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return m[1] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0");
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }
  return null;
}

/* Normalise un montant : gère virgule française (123,45), point (123.45),
   séparateurs de milliers (1 234,56 / 1,234.56 / 1.234,56), négatif (−, parenthèses). */
function normImportAmount(v) {
  if (v === undefined || v === null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  const neg = s.startsWith("-") || s.startsWith("−") || (s.startsWith("(") && s.endsWith(")"));
  s = s.replace(/^[+\-(]/, "").replace(/[)\]\u20ac]/g, "").replace(/\s/g, "");
  const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
  if (comma > -1 && dot > -1) {
    s = comma > dot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (comma > -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return isNaN(n) ? NaN : (neg ? -Math.abs(n) : n);
}

/* Découpe une ligne CSV en respectant les guillemets (RFC 4180 : un guillemet
   doublé « "" » à l'intérieur d'un champ cité est un guillemet littéral). */
function splitCsvLine(line, sep) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (c === sep && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(c => c.trim());
}

/* Détecte le séparateur : celui qui apparaît le plus sur la première ligne */
function detectCsvSep(line) {
  const semi = (line.match(/;/g) || []).length;
  const coma = (line.match(/,/g) || []).length;
  return semi >= coma ? ";" : ",";
}

const _ACCENTS = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/* Mappe une catégorie textuelle vers un id de catégorie connu */
function mapImportCategory(text, type) {
  const t = _ACCENTS(text);
  const list = CATEGORY_OPTIONS[type];
  /* correspondance exacte par libellé */
  for (const c of list) {
    if (_ACCENTS(c.label) === t || t.includes(_ACCENTS(c.label)) || _ACCENTS(c.label).includes(t)) return c.id;
  }
  /* correspondances pratiques */
  const map = {
    income: { salaire: "salaire", loyer: "locatif", loyers: "locatif", dividende: "dividendes", interet: "dividendes", renumeration: "salaire", prime: "salaire", remboursement: "autre_rev" },
    expense: { courses: "alimentation", alimentation: "alimentation", restaurant: "loisirs", essence: "transport", carburant: "transport", transport: "transport", loyer: "logement", logement: "logement", electricite: "energie", eau: "energie", assurance: "assurances", telephone: "abonnements", internet: "abonnements", abonnement: "abonnements", impot: "impots", impots: "impots", taxe: "impots", vetement: "shopping", vetements: "shopping", loisir: "loisirs", loisirs: "loisirs", sante: "sante", medical: "sante", cadeau: "cadeaux", voyage: "voyages", sport: "sport", gym: "sport", banque: "frais_banc", frais: "frais_banc" },
  };
  for (const [key, id] of Object.entries(map[type] || {})) {
    if (t.includes(key)) return id;
  }
  return type === "income" ? "autre_rev" : "autre";
}

/* Détecte les colonnes d'un en-tête CSV (retourne {date,label,amount,debit,credit,category,type,necessity} ou null si aucun en-tête reconnu) */
function mapImportHeader(cells) {
  const found = {};
  const hit = (names, key) => {
    if (found[key] !== undefined) return;
    const i = cells.findIndex(c => names.some(n => _ACCENTS(c) === n || _ACCENTS(c).includes(n)));
    if (i > -1) found[key] = i;
  };
  hit(["date", "jour", "operation"], "date");
  hit(["libelle", "libellé", "label", "description", "intitule", "designation"], "label");
  hit(["debit", "débit", "depense", "montant debiteur"], "debit");
  hit(["credit", "crédit", "recette", "montant crediteur"], "credit");
  hit(["montant", "amount", "somme", "valeur", "total"], "amount");
  hit(["categorie", "catégorie", "category", "poste"], "category");
  hit(["type", "sens"], "type");
  hit(["necessite", "nécessité", "necessity"], "necessity");
  return found.date !== undefined || found.label !== undefined ? found : null;
}

/* Parse un texte CSV de transactions.
   Retourne { rows: [{date,label,category,type,amount,necessity}], errors: [messages] }. */
function parseTxImport(text) {
  const errors = [];
  /* Retire le BOM UTF-8 éventuel (présent dans nos fichiers exportés pour Excel)
     pour que la détection d'en-tête fonctionne au réimport. */
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], errors: ["Aucune ligne à importer."] };
  const sep = detectCsvSep(lines[0]);
  const cols = mapImportHeader(splitCsvLine(lines[0], sep));
  const start = cols ? 1 : 0;
  const rows = [];
  lines.slice(start).forEach((line, i) => {
    const cells = splitCsvLine(line, sep);
    if (cells.length < 2) { errors.push("Ligne " + (i + start + 1) + " : ignorée (champs insuffisants)."); return; }
    const date = normImportDate(cols ? (cols.date !== undefined ? cells[cols.date] : cells[0]) : cells[0]);
    const label = (cols ? (cols.label !== undefined ? cells[cols.label] : cells[1]) : cells[1] || "").trim();
    if (!date || !label) { errors.push("Ligne " + (i + start + 1) + " : ignorée (date ou libellé manquant)."); return; }

    let amount, type;
    if (cols && cols.debit !== undefined && cols.credit !== undefined) {
      const cr = normImportAmount(cells[cols.credit]);
      amount = !isNaN(cr) && cr !== 0 ? cr : normImportAmount(cells[cols.debit]);
      type = !isNaN(cr) && cr !== 0 ? "income" : "expense";
    } else if (cols && cols.amount !== undefined) {
      amount = normImportAmount(cells[cols.amount]);
      type = cols.type !== undefined ? (_ACCENTS(cells[cols.type]).startsWith("cr") || _ACCENTS(cells[cols.type]).includes("revenu") ? "income" : "expense") : (amount >= 0 ? "income" : "expense");
    } else if (cols && cols.debit !== undefined) {
      amount = normImportAmount(cells[cols.debit]); type = "expense";
    } else if (cols && cols.credit !== undefined) {
      amount = normImportAmount(cells[cols.credit]); type = "income";
    } else {
      /* sans en-tête : [date, libellé, montant] ou [date, libellé, débit, crédit] */
      if (cells.length >= 4) {
        const cr = normImportAmount(cells[3]);
        amount = !isNaN(cr) && cr !== 0 ? cr : normImportAmount(cells[2]);
        type = !isNaN(cr) && cr !== 0 ? "income" : "expense";
      } else {
        amount = normImportAmount(cells[2]);
        type = amount >= 0 ? "income" : "expense";
      }
    }
    if (isNaN(amount) || amount === 0) { errors.push("Ligne " + (i + start + 1) + " : ignorée (montant invalide)."); return; }
    amount = Math.abs(amount);
    /* Catégorie : colonne dédiée sinon inférée du libellé (ex : « Courses » → alimentation) */
    const category = cols && cols.category !== undefined
      ? mapImportCategory(cells[cols.category], type)
      : mapImportCategory(label, type);
    let necessity;
    if (cols && cols.necessity !== undefined) {
      const n = _ACCENTS(cells[cols.necessity]);
      necessity = n.includes("option") ? "optionnelle" : n.includes("ponct") ? "ponctuelle" : "obligatoire";
    }
    rows.push({ date, label, category, type, amount, necessity: type === "expense" ? (necessity || "ponctuelle") : undefined });
  });
  return { rows, errors };
}

/* Ajoute les transactions parsées à un compte, sans doublon (même compte,
   date, libellé, type et montant au centime près). Retourne {added, skipped}. */
function importTxRows(state, accountId, rows) {
  let added = 0, skipped = 0;
  rows.forEach(r => {
    const dup = state.transactions.some(t =>
      t.account === accountId && t.date === r.date && t.label === r.label &&
      t.type === r.type && Math.abs((Number(t.amount) || 0) - r.amount) < 0.005
    );
    if (dup) { skipped++; return; }
    state.transactions.push({
      id: uid("t"), date: r.date, label: r.label, category: r.category, type: r.type,
      amount: r.amount, account: accountId, recurring: false,
      necessity: r.type === "expense" ? (r.necessity || "ponctuelle") : undefined,
    });
    added++;
  });
  return { added, skipped };
}

/* Sérialise des transactions au format CSV Date;Libellé;Montant — le format
   reconnu par parseTxImport (export ↔ import symétriques).
   Montant signé : positif = revenu, négatif = dépense, virgule décimale FR.
   Dates DD/MM/YYYY. Les cellules contenant ; , " ou un saut de ligne sont
   entre guillemets (doublés à l'intérieur). */
function serializeTxCSV(rows) {
  const esc = v => {
    const s = String(v ?? "");
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = ["Date;Libellé;Montant"];
  rows.forEach(r => {
    const [y, m, d] = String(r.date || "").split("-");
    const date = y && m && d ? d + "/" + m + "/" + y : (r.date || "");
    const amt = Math.abs(Number(r.amount) || 0);
    const signed = r.type === "income" ? amt : -amt;
    lines.push([esc(date), esc(r.label), String(signed).replace(".", ",")].join(";"));
  });
  return lines.join("\n");
}

/* ============================================================
   Transactions récurrentes : propagation & projection
   ============================================================ */

/* Clé d'identité d'une série récurrente (hors montant : une mise à jour du
   montant se propage au mois suivant) */
function recurringSeriesKey(t) {
  return [t.type, t.label, t.category, t.account || "", t.necessity || ""].join("|");
}

/* Modèle de chaque série récurrente : l'occurrence la plus récente fait foi
   (montant, catégorie, compte, rattachement bien…). */
function recurringSeriesTemplates(state) {
  const byKey = {};
  state.transactions.forEach(t => {
    if (!t.recurring) return;
    const k = recurringSeriesKey(t);
    if (!byKey[k] || t.date > byKey[k].date) byKey[k] = t;
  });
  return Object.values(byKey);
}

/* Nb de jours d'un mois (pour ramener le jour de versement à une date valide) */
function daysInMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/* Génère une occurrence pour un mois donné à partir d'un modèle (même jour,
   ramené au dernier jour du mois si nécessaire) */
function recurringOccurrence(model, key) {
  const day = Math.min(Number(model.date.slice(8, 10)) || 1, daysInMonth(key));
  return { ...model, id: uid("t"), date: key + "-" + String(day).padStart(2, "0") };
}

/* Propage chaque série récurrente jusqu'au mois courant + horizon (défaut : +1).
   Idempotent : ne crée que les mois manquants, sans jamais dupliquer. Retourne
   les transactions créées. */
function propagateRecurring(state, horizon = 1) {
  const target = addMonths(currentMonthKey(), horizon);
  /* L'occurrence la plus récente de chaque série fait foi : c'est son flag
     « recurring » qui décide. Décocher la case sur l'occurrence la plus récente
     arrête définitivement la série (elle ne sera pas régénérée au boot). */
  const latestBySeries = {};
  state.transactions.forEach(t => {
    const k = recurringSeriesKey(t);
    if (!latestBySeries[k] || t.date > latestBySeries[k].date) latestBySeries[k] = t;
  });
  const created = [];
  Object.values(latestBySeries).forEach(latest => {
    if (!latest.recurring) return; // série arrêtée : on ne la régénère pas
    const key = recurringSeriesKey(latest);
    /* Mois déjà présents (récurrents OU ponctuels) : pas de doublon */
    const present = new Set(
      state.transactions.filter(t => recurringSeriesKey(t) === key).map(t => monthOf(t.date))
    );
    let m = addMonths(monthOf(latest.date), 1);
    while (m <= target) {
      if (!present.has(m)) {
        const clone = recurringOccurrence(latest, m);
        state.transactions.push(clone);
        created.push(clone);
      }
      m = addMonths(m, 1);
    }
  });
  return created;
}

/* Après l'enregistrement d'une transaction récurrente : crée ou met à jour
   l'occurrence du mois suivant pour que la série reste à jour immédiatement.
   oldTx (optionnel) : ancienne version avant édition — si sa clé de série a
   changé (compte, catégorie…), l'ancienne occurrence du mois suivant est retirée
   pour éviter un doublon. */
function syncRecurringNextMonth(state, tx, oldTx) {
  const nextKey = addMonths(monthOf(tx.date), 1);
  const key = recurringSeriesKey(tx);
  if (!tx.recurring) {
    /* On arrête la série : on retire les occurrences futures déjà générées de
       l'ancienne clé de série (décocher la case stoppe la récurrence).
       Garde oldTx.recurring : une NOUVELLE transaction non récurrente partageant
       la clé d'une série existante ne doit pas supprimer les occurrences futures. */
    if (oldTx && oldTx.recurring) {
      const oldKey = recurringSeriesKey(oldTx);
      state.transactions = state.transactions.filter(t =>
        !(t.id !== tx.id && recurringSeriesKey(t) === oldKey && monthOf(t.date) > monthOf(tx.date))
      );
    }
    return;
  }
  /* On n'arrête l'ancienne série que si l'occurrence éditée était elle-même
     RÉCURRENTE : éditer une transaction ponctuelle partageant la clé d'une série
     (même libellé/compte/catégorie, ex. import) ne doit pas tuer la série. */
  if (oldTx && oldTx.recurring && recurringSeriesKey(oldTx) !== key) {
    const oldKey = recurringSeriesKey(oldTx);
    /* L'édition a changé l'identité de la série (compte, libellé, catégorie…) :
       on ARRÊTE l'ancienne série. On retire ses occurrences futures déjà
       générées et on dé-récurrence les occurrences historiques restantes — sinon
       propagateRecurring (qui se base sur l'occurrence la plus récente de
       l'ancienne clé) la régénérerait au prochain chargement, créant un doublon
       avec la nouvelle série. Si on édite une occurrence ANCIENNE (l'ancienne
       série garde des occurrences plus récentes), on ne touche à rien. Comme pour
       stopRecurringAfterDelete, un clone restant à la MÊME date que l'occurrence
       éditée (comparaison stricte >) laisse la série vivre. */
    const oldRemaining = state.transactions.filter(t =>
      t.id !== tx.id && recurringSeriesKey(t) === oldKey
    );
    const latestOld = oldRemaining.reduce((m, t) => (!m || t.date > m.date ? t : m), null);
    if (!latestOld || tx.date > latestOld.date) {
      state.transactions = state.transactions.filter(t =>
        !(t.id !== tx.id && recurringSeriesKey(t) === oldKey && monthOf(t.date) > monthOf(tx.date))
      );
      state.transactions.forEach(t => {
        if (t.id !== tx.id && recurringSeriesKey(t) === oldKey) t.recurring = false;
      });
    }
  }
  const existing = state.transactions.find(t =>
    t.id !== tx.id && t.recurring && recurringSeriesKey(t) === key && monthOf(t.date) === nextKey
  );
  if (existing) {
    existing.label = tx.label;
    existing.amount = tx.amount;
    existing.category = tx.category;
    existing.necessity = tx.necessity;
    existing.account = tx.account;
  } else {
    state.transactions.push(recurringOccurrence(tx, nextKey));
  }
}

/* Après suppression de transactions récurrentes : si l'occurrence supprimée
   était la PLUS RÉCENTE de sa série (celle qui sert de modèle à la propagation),
   on retire le flag « recurring » des occurrences restantes pour ARRÊTER la
   série. Sans cela, propagateRecurring régénérerait les mois supprimés au
   prochain chargement — ce qui rendrait la suppression (simple ou en masse)
   inopérante. Un doublon restant à la même date (clone) laisse la série vivre. */
function stopRecurringAfterDelete(state, deletedTxs) {
  deletedTxs.forEach(dt => {
    if (!dt.recurring) return;
    const key = recurringSeriesKey(dt);
    const remaining = state.transactions.filter(t =>
      t.id !== dt.id && recurringSeriesKey(t) === key && t.recurring
    );
    const latestRemaining = remaining.reduce((m, t) => (!m || t.date > m.date ? t : m), null);
    if (!latestRemaining || dt.date > latestRemaining.date) {
      remaining.forEach(t => { t.recurring = false; });
    }
  });
}

/* Projection des flux récurrents sur les n prochains mois. Le modèle de chaque
   série est son occurrence la plus récente ; le solde part des liquidités actuelles. */
function recurringProjection(state, months = 12) {
  const bySeries = {};
  state.transactions.forEach(t => {
    if (!t.recurring) return;
    const k = recurringSeriesKey(t);
    if (!bySeries[k] || t.date > bySeries[k].date) bySeries[k] = t;
  });
  const templates = Object.values(bySeries);
  const out = [];
  let balance = liquidAssets(state);
  for (let i = 1; i <= months; i++) {
    const key = addMonths(currentMonthKey(), i);
    let income = 0, spending = 0, epargne = 0, drain = 0;
    templates.forEach(t => {
      const a = Number(t.amount) || 0;
      if (t.type === "income") {
        income += a;
      } else if (t.category === "epargne") {
        epargne += a;
        /* L'épargne vers un support non liquide (Trading212, Nexo…) sort des
           liquidités : elle réduit le solde projeté, contrairement à l'épargne
           sur livret qui reste liquide. */
        const acc = state.accounts.find(x => x.id === t.account);
        /* Compte inconnu → on considère l'épargne comme liquide (défaut prudent) */
        const isLiquid = !acc ? true : !!(ACCOUNT_TYPES[acc.type] && ACCOUNT_TYPES[acc.type].liquid);
        if (!isLiquid) drain += a;
      } else {
        spending += a;
      }
    });
    const net = income - spending - drain;
    balance += net;
    out.push({ key, income, spending, epargne, drain, net, balance });
  }
  return out;
}
