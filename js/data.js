/* ============================================================
   Moonee — Données : constantes, catégories, jeu de données
   ============================================================ */

/* ---------- Types de comptes ---------- */
const ACCOUNT_TYPES = {
  courant: { label: "Compte courant", icon: "🏦", group: "liquidites", color: "#3b82f6", liquid: true },
  joint:   { label: "Compte joint",   icon: "👥", group: "liquidites", color: "#60a5fa", liquid: true },
  cash:    { label: "Espèces",        icon: "💶", group: "liquidites", color: "#84cc16", liquid: true },
  livret:  { label: "Livret d'épargne (A / LDDS / Jeune)", icon: "🌱", group: "epargne", color: "#10b981", liquid: true },
  pel:     { label: "PEL / CEL",      icon: "🏘️", group: "epargne", color: "#059669", liquid: true },
  pea:     { label: "PEA",            icon: "📈", group: "invest", color: "#8b5cf6", liquid: false },
  pea_pme: { label: "PEA-PME",        icon: "📊", group: "invest", color: "#a78bfa", liquid: false },
  av:      { label: "Assurance-vie",  icon: "🛡️", group: "invest", color: "#6366f1", liquid: false },
  titres:  { label: "Compte-titres",  icon: "🧾", group: "invest", color: "#7c3aed", liquid: false },
  trading: { label: "Compte de trading", icon: "📉", group: "invest", color: "#f43f5e", liquid: false },
  crypto:  { label: "Cryptomonnaies", icon: "🪙", group: "crypto", color: "#f97316", liquid: false },
  immo:    { label: "Immobilier (résidence)", icon: "🏠", group: "immobilier", color: "#14b8a6", liquid: false },
  pro:     { label: "Compte professionnel", icon: "💼", group: "pro", color: "#0ea5e9", liquid: true },
  terme:   { label: "Compte à terme", icon: "⏳", group: "terme", color: "#0d9488", liquid: false },
  /* CPF : budget formation de l'État (crédité ~500 €/an, financé par les
     entreprises via la contribution formation) — PAS un placement. */
  formation: { label: "CPF — Budget formation", icon: "🎓", group: "formation", color: "#6366f1", liquid: false },
  /* Carte débit différé : ligne des débits CB à venir (différé de paiement),
     PAS un compte. */
  debit_differe: { label: "Carte débit différé", icon: "💳", group: "carte", color: "#94a3b8", liquid: false },
};

const GROUPS = {
  liquidites:  { label: "Comptes & liquidités", icon: "💳", color: "#3b82f6" },
  epargne:     { label: "Épargne réglementée", icon: "🌱", color: "#10b981" },
  invest:      { label: "Investissements", icon: "📈", color: "#8b5cf6" },
  crypto:      { label: "Cryptomonnaies", icon: "🪙", color: "#f97316" },
  immobilier:  { label: "Immobilier", icon: "🏠", color: "#14b8a6" },
  pro:         { label: "Activité professionnelle", icon: "💼", color: "#0ea5e9" },
  terme:       { label: "Placements à terme", icon: "⏳", color: "#0d9488" },
  formation:   { label: "Formation (CPF)", icon: "🎓", color: "#6366f1" },
  carte:       { label: "Cartes & lignes de débit", icon: "💳", color: "#94a3b8" },
  autre:       { label: "Autres", icon: "🏦", color: "#86868b" },
};

/* ---------- Catégories ---------- */
const EXPENSE_CATEGORIES = [
  { id: "logement",    label: "Logement & crédits",   icon: "🏠", necessity: "obligatoire", color: "#6366f1" },
  { id: "alimentation",label: "Alimentation",         icon: "🛒", necessity: "obligatoire", color: "#22c55e" },
  { id: "energie",     label: "Énergie & eau",        icon: "⚡", necessity: "obligatoire", color: "#f59e0b" },
  { id: "transport",   label: "Transports",           icon: "🚗", necessity: "obligatoire", color: "#06b6d4" },
  { id: "sante",       label: "Santé & mutuelle",     icon: "🏥", necessity: "obligatoire", color: "#ef4444" },
  { id: "assurances",  label: "Assurances",           icon: "🛡️", necessity: "obligatoire", color: "#8b5cf6" },
  { id: "impots",      label: "Impôts & taxes",       icon: "🏛️", necessity: "obligatoire", color: "#64748b" },
  { id: "abonnements", label: "Abonnements essentiels", icon: "📱", necessity: "obligatoire", color: "#0ea5e9" },
  { id: "frais_banc",  label: "Frais bancaires",      icon: "🏦", necessity: "obligatoire", color: "#94a3b8" },
  { id: "loisirs",     label: "Loisirs & sorties",    icon: "🎭", necessity: "optionnelle", color: "#ec4899" },
  { id: "streaming",   label: "Streaming & médias",   icon: "🎬", necessity: "optionnelle", color: "#a855f7" },
  { id: "shopping",    label: "Shopping & vêtements", icon: "🛍️", necessity: "optionnelle", color: "#f97316" },
  { id: "voyages",     label: "Voyages",              icon: "✈️", necessity: "optionnelle", color: "#3b82f6" },
  { id: "sport",       label: "Sport & fitness",      icon: "🏋️", necessity: "optionnelle", color: "#84cc16" },
  { id: "cadeaux",     label: "Cadeaux",              icon: "🎁", necessity: "optionnelle", color: "#fb7185" },
  { id: "travaux",     label: "Travaux & maison",     icon: "🔨", necessity: "ponctuelle", color: "#92400e" },
  { id: "electromen",  label: "Électroménager",       icon: "🔧", necessity: "ponctuelle", color: "#78350f" },
  { id: "imprevus",    label: "Imprévus",             icon: "🚑", necessity: "ponctuelle", color: "#b91c1c" },
  { id: "autre",       label: "Autres dépenses",      icon: "💸", necessity: "ponctuelle", color: "#6b7280" },
  { id: "epargne",     label: "Épargne & investissements", icon: "💰", necessity: "epargne", color: "#10b981" },
];

const INCOME_CATEGORIES = [
  { id: "salaire",      label: "Salaire",             icon: "💼", color: "#22c55e" },
  { id: "freelance",    label: "Freelance / activité",icon: "🧑‍💻", color: "#0ea5e9" },
  { id: "locatif",      label: "Revenus locatifs",    icon: "🏘️", color: "#8b5cf6" },
  { id: "dividendes",   label: "Dividendes & intérêts", icon: "📈", color: "#f59e0b" },
  { id: "crypto_rev",   label: "Gains crypto",        icon: "🪙", color: "#f97316" },
  { id: "autre_rev",    label: "Autres revenus",      icon: "💰", color: "#6b7280" },
];

const NECESSITY_META = {
  obligatoire: { label: "Obligatoires", color: "#ef4444" },
  optionnelle: { label: "Optionnelles", color: "#f59e0b" },
  ponctuelle:  { label: "Ponctuelles",  color: "#8b5cf6" },
  epargne:     { label: "Épargne & invest.", color: "#10b981" },
};

const LOAN_TYPES = {
  immobilier: { label: "Immobilier", icon: "🏠" },
  travaux:    { label: "Travaux", icon: "🔨" },
  conso:      { label: "Consommation", icon: "🛍️" },
  auto:       { label: "Automobile", icon: "🚗" },
  autre:      { label: "Autre", icon: "💳" },
};

/* ---------- Personnes physiques & types de sociétés ---------- */
const PERSONS = [
  { id: "tommy", name: "Tommy", color: "#10b981" },
  { id: "david", name: "David", color: "#3b6df0" },
];

const HOLDING_TYPES = {
  sasu:   { label: "SASU / EURL", icon: "💼" },
  sci:    { label: "SCI", icon: "🏢" },
  holding:{ label: "Holding", icon: "🏛️" },
  sarl:   { label: "SARL", icon: "🤝" },
  autre:  { label: "Autre société", icon: "📄" },
};

const CAT_BY_ID = {};
EXPENSE_CATEGORIES.concat(INCOME_CATEGORIES).forEach(c => { CAT_BY_ID[c.id] = c; });

const CATEGORY_OPTIONS = {
  expense: EXPENSE_CATEGORIES,
  income: INCOME_CATEGORIES,
};

/* ---------- Données réelles : Budget 2027 ---------- */
function buildSeedData() {
  const now = new Date();
  const mk = monthKey(now);
  const months = [];
  for (let i = 11; i >= 0; i--) months.push(addMonths(mk, -i));

  const accounts = [
    { id: uid("a"), type: "formation", name: "CPF",                              institution: "CPF",            balance: 3305.25, rate: null, limit: null, opened: "2024-05-05" },
    { id: uid("a"), type: "courant", name: "Pressing - ID 287",                institution: "—",               balance: 0,       rate: null, limit: null, opened: null },
    { id: uid("a"), type: "courant", name: "CA - Tommy",                       institution: "Crédit Agricole", balance: 935.39,  rate: null, limit: null, opened: "2015-01-01" },
    { id: uid("a"), type: "debit_differe", name: "CA - Tommy Carte Débit Différé",   institution: "Crédit Agricole", balance: 0,       rate: null, limit: null, opened: null },
    { id: uid("a"), type: "livret",  name: "CA - Tommy Livret A",              institution: "Crédit Agricole", balance: 16000.00, rate: 3.0, limit: 22950, opened: "2015-01-01" },
    { id: uid("a"), type: "livret",  name: "CA - Tommy LDD Solidaire",         institution: "Crédit Agricole", balance: 10.00,   rate: 3.0, limit: 12000, opened: "2018-01-01" },
    { id: uid("a"), type: "pea",     name: "CA - Tommy Plan Épargne Action",   institution: "Crédit Agricole", balance: 1046.36, rate: null, limit: 225000, opened: "2015-01-01" },
    { id: uid("a"), type: "pea",     name: "CA - Tommy Compte espèce PEA",     institution: "Crédit Agricole", balance: 1.00,    rate: null, limit: 225000, opened: "2015-01-01" },
    { id: uid("a"), type: "livret",  name: "CA - Space Unity",                 institution: "Crédit Agricole", balance: 9169.71, rate: null, limit: null, opened: "2020-01-01" },
    { id: uid("a"), type: "pro",     name: "CA - SCI TODA Compte",             institution: "Crédit Agricole", balance: 60699.90, rate: null, limit: null, opened: "2021-01-01" },
    { id: uid("a"), type: "courant", name: "Bourso - Tommy",                   institution: "BoursoBank",      balance: 1726.88, rate: null, limit: null, opened: "2016-01-01" },
    { id: uid("a"), type: "livret",  name: "Bourso - Tommy Livret Bourso+",    institution: "BoursoBank",      balance: 1000.00, rate: 3.0,  limit: null, opened: "2023-01-01" },
    { id: uid("a"), type: "courant", name: "LCL - Immo",                       institution: "LCL",             balance: 2127.33, rate: null, limit: null, opened: "2021-05-01" },
    { id: uid("a"), type: "livret",  name: "LCL Livret Dev Durable Solidaire", institution: "LCL",             balance: 53.80,   rate: 3.0,  limit: 12000, opened: "2021-05-01" },
    { id: uid("a"), type: "pea",     name: "LCL - Plan Épargne Action",        institution: "LCL",             balance: 30.28,   rate: null, limit: 225000, opened: "2021-05-01" },
    { id: uid("a"), type: "av",      name: "LCL - Acuity Evolution",           institution: "LCL",             balance: 2033.13, rate: null, limit: null, opened: "2021-06-01" },
    { id: uid("a"), type: "courant", name: "Revolut - Tommy",                  institution: "Revolut",         balance: 200.64,  rate: null, limit: null, opened: "2019-01-01" },
    { id: uid("a"), type: "livret",  name: "Revolut - Flexible Cash",          institution: "Revolut",         balance: 3079.67, rate: 1.47, limit: null, opened: "2023-01-01" },
    { id: uid("a"), type: "titres",  name: "Revolut Invest",                   institution: "Revolut",         balance: 2001.96, rate: null, limit: null, opened: "2021-01-01" },
    { id: uid("a"), type: "crypto",  name: "Nexo - USDC",                      institution: "Nexo",            balance: 9167.28, rate: 5.5,  limit: null, opened: "2022-01-01" },
    { id: uid("a"), type: "crypto",  name: "Nexo - NEXO",                      institution: "Nexo",            balance: 3173.28, rate: 3.0,  limit: null, opened: "2022-01-01" },
    { id: uid("a"), type: "trading", name: "Trading212",                       institution: "Trading212",      balance: 2358.84, rate: null, limit: null, opened: "2023-01-01" },
    { id: uid("a"), type: "titres",  name: "Natixis",                          institution: "Natixis",         balance: 2501.44, rate: null, limit: null, opened: "2020-01-01" },
    { id: uid("a"), type: "immo",    name: "Bien — VAL (Ste)",                  institution: "LCL",             balance: 185000, rate: null, limit: null, opened: "2021-05-01" },
    { id: uid("a"), type: "immo",    name: "Bien — Chrl (SCI)",                 institution: "Crédit Agricole", balance: 420000, rate: null, limit: null, opened: "2026-08-01" },
  ];
  const acct = name => accounts.find(a => a.name === name);

  const loans = [
    /* holder : personne physique (Tommy) ou entreprise (SCI TODA) qui porte le crédit */
    { id: uid("l"), name: "Prêt immo — VAL (Ste)", type: "immobilier", institution: "LCL",             initial: 74000,  remaining: 56039,  monthly: 341.64, rate: 1.05, years: 20, start: "2021-05-01", holder: { kind: "person", id: "tommy" } },
    { id: uid("l"), name: "Prêt immo — Chrl",      type: "immobilier", institution: "Crédit Agricole", initial: 149509, remaining: 149509, monthly: 852,    rate: 3.3,  years: 20, start: "2026-08-01", holder: { kind: "entity", id: "h-toda" } },
    { id: uid("l"), name: "Prêt travaux — SCI",    type: "travaux",    institution: "Crédit Agricole", initial: 160000, remaining: 160000, monthly: 912,    rate: 3.3,  years: 20, start: "2026-08-01", holder: { kind: "entity", id: "h-toda" } },
  ];

  /* Budget mensuel 2027 : [jour, libellé, catégorie, type, montant, compte, nécessité, bien (optionnel)]
     NB : les lignes à 0,00 € (Contabo, Électricité) sont ignorées.
     Structure « réalité » (éclatement par bien) :
       - Les charges liées à un immeuble sont éclatées par bien : Eau Val/Chrl,
         Femme de ménage - Val/-Dav, Taxe foncière Val/Chrl, Charges copropriété (Chrl)
         + Charges copropriété Val.
       - Les mensualités de prêt (« Crédits immo — VAL » / « Crédits immo — CHRL »)
         ne sont volontairement PAS taguées : chaque prêt est déjà lié à son bien via
         loanIds (sinon le cashflow du bien compterait la mensualité deux fois).
       - Google Cloud / Domains / Namecheap sont payés depuis CA - Tommy.
     Tag « bien » : les flux rattachés à un immeuble (loyers, assurances, copro, taxes). */
  const B = [
    /* --- Revenus --- */
    ["28", "Salaire — Converteo",              "salaire",    "income", 5300,  "CA - Tommy",                 null],
    ["05", "Loyers — VAL",                     "locatif",    "income", 600,   "LCL - Immo",                 null, "b-val"],
    ["28", "Avantages — Swile",                "autre_rev",  "income", 150,   "CA - Tommy",                 null],
    ["01", "Intérêts Nexo (USDC 5,5 % APY)",   "dividendes", "income", 48.90, "Nexo - USDC",                null],
    ["01", "Intérêts Revolut (1,19 % APY)",    "dividendes", "income", 3.05,  "Revolut - Flexible Cash",    null],
    /* --- Débits perso (optionnelles) --- */
    ["12", "Vêtements",                        "shopping",   "expense", 200,   "CA - Tommy",                 "optionnelle"],
    ["15", "Compléments alimentaires",         "alimentation","expense", 33,   "CA - Tommy",                 "optionnelle"],
    ["08", "Claude (IA)",                      "abonnements", "expense", 110,  "CA - Tommy",                 "optionnelle"],
    ["18", "Jeux",                             "loisirs",    "expense", 60,    "CA - Tommy",                 "optionnelle"],
    ["10", "Bouffe / perso",                   "alimentation","expense", 800,  "CA - Tommy",                 "optionnelle"],
    ["20", "Carte CA",                         "frais_banc", "expense", 29,    "CA - Tommy",                 "optionnelle"],
    ["03", "Salle de gym",                     "sport",      "expense", 13.66, "CA - Tommy",                 "optionnelle"],
    ["09", "Superhuman / Coda",                "abonnements", "expense", 10,   "CA - Tommy",                 "optionnelle"],
    /* --- Charges entreprises (obligatoires) --- */
    ["25", "Google Cloud",                     "abonnements", "expense", 0.08, "CA - Tommy",                 "obligatoire"],
    ["25", "Google Domains",                   "abonnements", "expense", 3,    "CA - Tommy",                 "obligatoire"],
    ["27", "Comptable SASU / SCI",             "autre",      "expense", 100,   "CA - SCI TODA Compte",       "obligatoire"],
    ["25", "Namecheap",                        "abonnements", "expense", 4,    "CA - Tommy",                 "obligatoire"],
    ["05", "Crédits immo — VAL",               "logement",   "expense", 341.64,"LCL - Immo",                 "obligatoire"],
    ["05", "Crédits immo — CHRL",              "logement",   "expense", 391.22,"CA - SCI TODA Compte",       "obligatoire"],
    ["05", "Assurance de prêt",                "assurances", "expense", 3.50,  "LCL - Immo",                 "obligatoire", "b-val"],
    ["10", "Charges copropriété",              "logement",   "expense", 31.32, "CA - SCI TODA Compte",       "obligatoire", "b-chrl"],
    ["10", "Charges copropriété Val",          "logement",   "expense", 31.32, "LCL - Immo",                 "obligatoire", "b-val"],
    ["15", "Taxe foncière Val",                "impots",     "expense", 57.33, "LCL - Immo",                 "obligatoire", "b-val"],
    ["15", "Taxe foncière Chrl",               "impots",     "expense", 306,   "CA - SCI TODA Compte",       "obligatoire", "b-chrl"],
    ["20", "Assurance habitation — Friday",    "assurances", "expense", 8.29,  "LCL - Immo",                 "obligatoire", "b-val"],
    ["12", "Eau Val",                          "energie",    "expense", 20,    "LCL - Immo",                 "obligatoire", "b-val"],
    ["12", "Eau Chrl",                         "energie",    "expense", 20,    "CA - SCI TODA Compte",       "obligatoire", "b-chrl"],
    ["04", "Internet — Sosh",                  "abonnements", "expense", 24.99,"LCL - Immo",                 "obligatoire", "b-val"],
    ["22", "Femme de ménage - Val",            "autre",      "expense", 30,    "LCL - Immo",                 "obligatoire", "b-val"],
    ["22", "Femme de ménage - Dav",            "autre",      "expense", 130,   "CA - Tommy",                 "obligatoire"],
    ["06", "Téléphone — YouPrice",             "abonnements", "expense", 8.99, "CA - Tommy",                 "obligatoire"],
    ["16", "Coiffeur",                         "autre",      "expense", 40,    "CA - Tommy",                 "obligatoire"],
    ["02", "RATP / SAS",                       "transport",  "expense", 90,    "CA - Tommy",                 "obligatoire"],
    ["01", "Logement — Davout",                "logement",   "expense", 1050,  "CA - Tommy",                 "obligatoire"],
    /* --- Épargne --- */
    ["28", "Épargne — Livret A",               "epargne",    "expense", 200,   "CA - Tommy Livret A",        "epargne"],
    ["28", "Épargne — Bourso+",                "epargne",    "expense", 50,    "Bourso - Tommy Livret Bourso+", "epargne"],
    ["28", "Épargne — Revolut",                "epargne",    "expense", 100,   "Revolut - Flexible Cash",    "epargne"],
    /* --- Investissements --- */
    ["28", "Investissement — Trading212",      "epargne",    "expense", 100,   "Trading212",                 "epargne"],
    ["28", "Investissement — Nexo (USDC)",     "epargne",    "expense", 1400,  "Nexo - USDC",                "epargne"],
  ];

  const tx = [];
  months.forEach(m => {
    B.forEach(([d, label, cat, type, amt, accName, nec, bien]) => {
      tx.push({
        id: uid("t"),
        date: m + "-" + d,
        label, category: cat, type,
        amount: amt,
        account: acct(accName).id,
        recurring: true,
        necessity: nec || undefined,
        bien: bien || undefined,
      });
    });
  });

  return { accounts, loans, transactions: tx, split: buildSplit(), holdings: buildHoldings(accounts, loans), biens: buildBiens(accounts, loans), createdAt: new Date().toISOString() };
}

/* ---------- Holdings & sociétés ---------- */
/* Structure de détention réelle :
   - Space Unity : SASU de Tommy, détenue à 100 % par Tommy
   - Margooya : SASU de David, détenue à 100 % par David
   - SCI TODA : détenue à 75 % par la SASU Space Unity (Tommy) et à 25 % par la SASU Margooya (David)
   Comptes liés : « CA - Space Unity » (trésorerie de la SASU) et « CA - SCI TODA Compte ».
   Prêts liés : « Prêt immo — Chrl » et « Prêt travaux — SCI » portés par la SCI. */
function buildHoldings(accounts, loans) {
  const acct = name => accounts.find(a => a.name === name);
  const loan = name => (loans || []).find(l => l.name === name);
  return {
    entities: [
      {
        id: "h-space",
        type: "sasu",
        name: "Space Unity",
        color: "#0ea5e9",
        owners: [{ kind: "person", id: "tommy", share: 100 }],
        accountIds: [acct("CA - Space Unity")?.id].filter(Boolean),
        loanIds: [],
        notes: "SASU de Tommy — détenue à 100 % par Tommy",
      },
      {
        id: "h-margooya",
        type: "sasu",
        name: "Margooya",
        color: "#8b5cf6",
        owners: [{ kind: "person", id: "david", share: 100 }],
        accountIds: [],
        loanIds: [],
        notes: "SASU de David — détenue à 100 % par David",
      },
      {
        id: "h-toda",
        type: "sci",
        name: "SCI TODA",
        color: "#f59e0b",
        owners: [
          { kind: "entity", id: "h-space", share: 75 },
          { kind: "entity", id: "h-margooya", share: 25 },
        ],
        accountIds: [acct("CA - SCI TODA Compte")?.id, acct("Bien — Chrl (SCI)")?.id].filter(Boolean),
        loanIds: [loan("Prêt immo — Chrl")?.id, loan("Prêt travaux — SCI")?.id].filter(Boolean),
        notes: "SCI détenue à 75 % par Space Unity (Tommy) et à 25 % par Margooya (David)",
      },
    ],
    /* Dividendes remontés de la fille vers la mère (régime mère-fille) */
    dividends: [],
  };
}

/* ---------- Biens immobiliers ---------- */
/* Deux biens : VAL (Ste) — bien locatif de Tommy, et Chrl — bien en travaux porté
   par la SCI TODA. Chaque bien relie : son compte immo (valeur), ses prêts, son
   statut (loue / en_travaux / vacant) et son suivi de travaux. */
function buildBiens(accounts, loans) {
  const acct = name => accounts.find(a => a.name === name);
  const loan = name => (loans || []).find(l => l.name === name);
  return [
    {
      id: "b-val",
      name: "VAL (Ste)",
      address: "",
      status: "loue",
      valeur: 185000,
      accountIds: [acct("LCL - Immo")?.id, acct("Bien — VAL (Ste)")?.id].filter(Boolean),
      loanIds: [loan("Prêt immo — VAL (Ste)")?.id].filter(Boolean),
      owner: { kind: "person", id: "tommy" },
      travaux: null,
      notes: "Bien locatif — loyer 600 €/mois reçu sur LCL - Immo. Prêt restant : 56 039 €.",
    },
    {
      id: "b-chrl",
      name: "Chrl",
      address: "",
      status: "en_travaux",
      valeur: 420000,
      accountIds: [acct("CA - SCI TODA Compte")?.id, acct("Bien — Chrl (SCI)")?.id].filter(Boolean),
      loanIds: [loan("Prêt immo — Chrl")?.id, loan("Prêt travaux — SCI")?.id].filter(Boolean),
      owner: { kind: "entity", id: "h-toda" },
      travaux: { budget: 160000, spent: 0 },
      notes: "Bien en travaux — pas encore de revenus. Porté par la SCI TODA (75 % Space Unity / 25 % Margooya).",
    },
  ];
}

/* ---------- Répartition David / Tommy ---------- */
function buildSplit() {
  const keys = lastNMonthKeys(12);
  /* Historique des versements (12 mois, du plus ancien au plus récent).
     David a régularisé toutes ses mensualités : part versée chaque mois,
     dette soldée à 0 €. */
  const months = keys.map(m => ({ key: m, davidPaid: 1237.91, tommyPaid: 1049.74, note: "Part versée" }));
  return {
    rent: 2287.65,
    salaryDavid: 6250.00,
    salaryTommy: 5300.00,
    shareDavid: 1237.91,   /* 54,11 % du loyer */
    shareTommy: 1049.74,   /* 45,89 % du loyer */
    debtDavid: 0,          /* dette de David envers Tommy (négatif = David doit) — soldée */
    debtTommy: 0,          /* dette de Tommy envers David (négatif = Tommy doit) — soldée */
    months,
  };
}
