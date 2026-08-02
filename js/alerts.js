/* ============================================================
   Moonee — Alertes automatiques, score de santé, bonnes pratiques
   ============================================================ */

/* ---------- Alertes ---------- */
function computeAlerts(state) {
  const alerts = [];
  const avg = avgMonthly(state, 12);
  const mos = monthsOfSafety(state);
  const dr = debtRatio(state);
  const sr = savingsRate(state);
  const split = necessitySplit(state);
  const totals = groupTotals(state);
  const assets = state.accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);

  /* Découvert / solde faible */
  state.accounts.forEach(a => {
    const t = ACCOUNT_TYPES[a.type];
    if (!t || !t.liquid || a.type === "cash") return;
    const b = Number(a.balance) || 0;
    if (b < 0) {
      alerts.push({
        severity: "danger", icon: "⚠️",
        title: "Compte à découvert : " + a.name,
        detail: "Solde de " + fmtEUR(b) + " chez " + (a.institution || "—") + ". Les agios s'accumulent rapidement : régularisez dès que possible.",
        action: "Virez des liquidités vers ce compte",
      });
    } else if (b < 100) {
      alerts.push({
        severity: "warning", icon: "🪫",
        title: "Solde faible sur " + a.name,
        detail: "Il reste " + fmtEUR(b) + ". Gardez toujours un coussin de trésorerie de quelques centaines d'euros.",
        action: "Reconstituez le solde",
      });
    }
  });

  /* Marge de sécurité */
  if (mos !== null) {
    if (mos < 3) {
      alerts.push({
        severity: "danger", icon: "🚨",
        title: "Marge de sécurité critique (" + mos.toFixed(1) + " mois)",
        detail: "Vos liquidités couvrent moins de 3 mois de dépenses. Objectif : 3 à 6 mois de dépenses (soit " + fmtEUR0(avg.spending * 3) + " à " + fmtEUR0(avg.spending * 6) + ").",
        action: "Priorisez la constitution de votre fonds d'urgence",
      });
    } else if (mos < 6) {
      alerts.push({
        severity: "warning", icon: "🛟",
        title: "Marge de sécurité insuffisante (" + mos.toFixed(1) + " mois)",
        detail: "Vous couvrez " + mos.toFixed(1) + " mois de dépenses. Visez 6 mois (≈ " + fmtEUR0(avg.spending * 6) + ") pour un revenu indépendant.",
        action: "Renforcez vos livrets réglementés",
      });
    } else {
      alerts.push({
        severity: "info", icon: "💚",
        title: "Marge de sécurité solide (" + mos.toFixed(1) + " mois)",
        detail: "Vos liquidités couvrent " + mos.toFixed(1) + " mois de dépenses. Au-delà de 12 mois, l'excédent dort : investissez-le.",
        action: "Pensez à investir l'excédent",
      });
    }
  }

  /* Taux d'épargne */
  if (sr !== null) {
    if (sr < 0.1) {
      alerts.push({
        severity: "warning", icon: "🐢",
        title: "Taux d'épargne faible (" + fmtPct(sr) + ")",
        detail: "Vous épargnez " + fmtPct(sr) + " de vos revenus. La règle d'or : 10 à 20 % minimum, idéalement 20 %.",
        action: "Automatisez un virement vers l'épargne le jour du salaire",
      });
    } else if (sr < 0.2) {
      alerts.push({
        severity: "info", icon: "📈",
        title: "Taux d'épargne correct (" + fmtPct(sr) + ")",
        detail: "Vous épargnez " + fmtPct(sr) + ". En visant 20 %, votre patrimoine progresserait nettement plus vite.",
        action: "Augmentez votre épargne programmée de 1 à 2 % par an",
      });
    } else {
      alerts.push({
        severity: "success", icon: "🏆",
        title: "Excellent taux d'épargne (" + fmtPct(sr) + ")",
        detail: "Au-delà de 20 %, bravo ! Vérifiez que cet argent travaille (investissements) plutôt que de dormir.",
        action: "Aucune action requise",
      });
    }
  }

  /* Ratio d'endettement */
  if (dr !== null) {
    if (dr > 0.4) {
      alerts.push({
        severity: "danger", icon: "🏗️",
        title: "Ratio d'endettement très élevé (" + fmtPct(dr) + ")",
        detail: "Vos mensualités représentent " + fmtPct(dr) + " de vos revenus. Les banques plafonnent généralement à 35 % assurance comprise.",
        action: "Négociez un rachat de crédit ou rallongez la durée",
      });
    } else if (dr > 0.35) {
      alerts.push({
        severity: "warning", icon: "🧮",
        title: "Ratio d'endettement élevé (" + fmtPct(dr) + ")",
        detail: "Vous approchez du plafond de 35 % recommandé. Une marge de manœuvre limitée pour de nouveaux crédits.",
        action: "Remboursez les crédits les plus chers en priorité",
      });
    } else {
      alerts.push({
        severity: "success", icon: "✅",
        title: "Endettement maîtrisé (" + fmtPct(dr) + ")",
        detail: "Vos mensualités représentent " + fmtPct(dr) + " de vos revenus, sous le seuil recommandé de 35 %.",
        action: "Aucune action requise",
      });
    }
  }

  /* Charges obligatoires */
  const totalSpent = split.obligatoire + split.optionnelle + split.ponctuelle;
  const obliShare = totalSpent > 0 ? split.obligatoire / totalSpent : 0;
  if (obliShare > 0.6) {
    alerts.push({
      severity: "warning", icon: "🔒",
      title: "Charges obligatoires prépondérantes (" + fmtPct(obliShare) + " des dépenses)",
      detail: "Plus de 60 % de vos dépenses sont incompressibles. Peu de flexibilité en cas de coup dur.",
      action: "Cherchez à réduire les postes fixes (énergie, assurances, abonnements)",
    });
  } else if (obliShare > 0.4) {
    alerts.push({
      severity: "info", icon: "⚖️",
      title: "Équilibre des charges correct",
      detail: "Les charges obligatoires représentent " + fmtPct(obliShare) + " des dépenses — une structure saine (cible 50/30/20).",
      action: "Aucune action requise",
    });
  }

  /* Plafonds réglementés */
  state.accounts.forEach(a => {
    const lim = Number(a.limit) || 0;
    const bal = Number(a.balance) || 0;
    if (lim > 0 && bal >= lim) {
      const limits = { "22 950": "Livret A", "12 000": "LDDS", "1 600": "Livret Jeune", "61 200": "PEL", "225 000": "PEA/PEA-PME" };
      const limitKey = Object.keys(limits).find(k => Number(k.replace(/\s/g, "")) === lim);
      const which = limitKey ? limits[limitKey] : a.type;
      alerts.push({
        severity: "warning", icon: "🛑",
        title: (a.type === "pea" || a.type === "pea_pme") ? "Enveloppe " + which + " saturée" : a.name + " au plafond",
        detail: a.name + " est à " + fmtEUR0(bal) + " sur " + fmtEUR0(lim) + ". Pour " + (which === "Livret A" || which === "LDDS" || which === "Livret Jeune" ? "continuer à épargner, orientez l'excédent vers d'autres supports (PEA, assurance-vie)." : "continuer à investir, utilisez l'autre enveloppe (PEA / PEA-PME) ou un compte-titres."),
        action: "Redirigez l'excédent vers un autre support",
      });
    } else if (lim > 0 && bal >= lim * 0.9) {
      alerts.push({
        severity: "info", icon: "🪙",
        title: a.name + " proche du plafond (" + fmtPct(bal / lim) + ")",
        detail: "Vous approchez du plafond de " + fmtEUR0(lim) + ". Anticipez la bascule vers d'autres supports d'épargne.",
        action: "Préparez votre prochain support d'épargne",
      });
    }
  });

  /* Concentration crypto */
  const cryptoTotal = totals.crypto || 0;
  if (assets > 0) {
    const share = cryptoTotal / assets;
    if (share > 0.1) {
      alerts.push({
        severity: "warning", icon: "🪙",
        title: "Exposition crypto élevée (" + fmtPct(share) + " du patrimoine)",
        detail: "Les cryptomonnaies représentent " + fmtPct(share) + " de vos actifs. Le consensus recommande 1 à 5 % maximum au vu de la volatilité.",
        action: "Rééquilibrez vers des actifs plus stables",
      });
    } else if (share > 0.05) {
      alerts.push({
        severity: "info", icon: "📉",
        title: "Exposition crypto à surveiller (" + fmtPct(share) + ")",
        detail: "Vous détenez " + fmtPct(share) + " de vos actifs en crypto — proche de la limite haute de 5 % conseillée.",
        action: "Pensez à prendre des gains partiels",
      });
    }
  }

  /* Excédent de liquidités qui dort */
  if (mos !== null && mos > 12) {
    alerts.push({
      severity: "info", icon: "😴",
      title: "Liquidités excédentaires (" + mos.toFixed(1) + " mois)",
      detail: "Vous détenez plus de 12 mois de dépenses en liquidités. Cet argent subit l'inflation (~2 %/an) sans travailler.",
      action: "Investissez l'excédent (PEA, assurance-vie, SCPI)",
    });
  }

  /* Dépense ponctuelle importante */
  const avgSpend = avg.spending;
  const bigOnes = state.transactions
    .filter(t => t.type === "expense" && (t.necessity === "ponctuelle" || t.necessity === "optionnelle"))
    .filter(t => avgSpend > 0 && (Number(t.amount) || 0) > avgSpend * 0.35)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  bigOnes.forEach(t => {
    alerts.push({
      severity: "info", icon: "🎢",
      title: "Dépense ponctuelle notable : " + t.label,
      detail: fmtEUR(t.amount) + " le " + dayLabel(t.date) + ". Assurez-vous qu'elle était budgétée.",
      action: "Créez une provision mensuelle pour ce type de dépense",
    });
  });

  /* ---------- Répartition David / Tommy ---------- */
  const splitAlerts = computeSplitAlerts(state);
  splitAlerts.forEach(a => alerts.push(a));

  /* ---------- Holdings & sociétés ---------- */
  computeHoldingAlerts(state).forEach(a => alerts.push(a));

  /* ---------- Biens immobiliers ---------- */
  computeRealEstateAlerts(state).forEach(a => alerts.push(a));

  /* ---------- Projection des flux récurrents ---------- */
  const proj = recurringProjection(state, 12);
  if (proj.length > 0) {
    const minBal = proj.reduce((m, p) => Math.min(m, p.balance), Infinity);
    const endBal = proj[proj.length - 1].balance;
    if (minBal < 0) {
      alerts.push({
        severity: "warning", icon: "📅",
        title: "Trésorerie projetée en négatif",
        detail: "Sur la base de vos flux récurrents, votre trésorerie passerait sous zéro (" + fmtEUR0(minBal) + " au plus bas, solde à 12 mois : " + fmtEUR0(endBal) + "). Anticipez : réduisez une dépense récurrente ou déplacez de l'épargne.",
        action: "Rééquilibrez vos flux récurrents",
      });
    }
  }

  /* Tri : danger → warning → info → success */
  const order = { danger: 0, warning: 1, info: 2, success: 3 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* Alertes spécifiques à la répartition David / Tommy */
function computeSplitAlerts(state) {
  const alerts = [];
  const cfg = splitConfig(state);
  if (!cfg.rent) return alerts;

  const curKey = currentMonthKey();
  const cur = splitMonth(state, curKey);
  const gap = splitGap(state, curKey);
  const debt = cfg.debtDavid;
  const streak = splitStreak(state);
  const monthsCovered = cfg.shareDavid > 0 ? Math.round(Math.abs(debt) / cfg.shareDavid) : 0;

  /* Versement du mois courant */
  if (gap > 0.005) {
    alerts.push({
      severity: "warning", icon: "👥",
      title: "Part de David non versée ce mois",
      detail: "Il manque " + fmtEUR(gap) + " sur " + fmtEUR(cfg.shareDavid) + " attendus pour " + monthLabel(curKey) + ". Tommy a versé " + fmtEUR(cur.tommyPaid) + " à sa place.",
      action: "Rappeler à David de verser sa part du loyer Davout",
    });
  } else {
    alerts.push({
      severity: "success", icon: "🤝",
      title: "Part de David versée ce mois",
      detail: monthLabel(curKey) + " : David a versé " + fmtEUR(cur.davidPaid) + " sur " + fmtEUR(cfg.shareDavid) + ". Partage en règle.",
      action: "Aucune action requise",
    });
  }

  /* Dette cumulée de David */
  if (debt < 0) {
    const sev = monthsCovered >= 6 ? "danger" : (monthsCovered >= 3 ? "warning" : "info");
    alerts.push({
      severity: sev, icon: "📉",
      title: "Dette de David : " + fmtEUR0(-debt),
      detail: "David doit " + fmtEUR0(-debt) + " à Tommy (≈ " + monthsCovered + " mois de part du loyer)." + (streak >= 2 ? " Aucun versement complet depuis " + streak + " mois." : ""),
      action: "Établir un échéancier de remboursement de la dette",
    });
  } else {
    alerts.push({
      severity: "success", icon: "✅",
      title: "Aucune dette entre vous",
      detail: "David ne doit rien à Tommy sur le loyer Davout. Partage équilibré.",
      action: "Aucune action requise",
    });
  }

  /* Écart de salaire (pédagogique) */
  if (cfg.salaryDavid > 0 && cfg.salaryTommy > 0) {
    alerts.push({
      severity: "info", icon: "⚖️",
      title: "Clé de répartition : " + fmtPct(cfg.shareTommy / cfg.rent, 2) + " / " + fmtPct(cfg.shareDavid / cfg.rent, 2),
      detail: "Salaires David " + fmtEUR0(cfg.salaryDavid) + " / Tommy " + fmtEUR0(cfg.salaryTommy) + " (écart " + fmtEUR0(cfg.salaryDavid - cfg.salaryTommy) + "). Les parts sont proportionnelles aux revenus : " + fmtEUR(cfg.shareTommy) + " / " + fmtEUR(cfg.shareDavid) + ".",
      action: "Revoir la clé de répartition si les salaires évoluent",
    });
  }

  return alerts;
}

/* Alertes spécifiques aux holdings & sociétés */
function computeHoldingAlerts(state) {
  const alerts = [];
  const cfg = holdingsConfig(state);
  if (cfg.entities.length === 0) return alerts;

  const total = totalHoldingsValue(state);
  const summaries = holdingSummaries(state);

  /* Entité à valeur nette négative */
  summaries.forEach(s => {
    if (s.value < 0) {
      alerts.push({
        severity: "warning", icon: "🏢",
        title: "Entité à valeur nette négative : " + s.entity.name,
        detail: s.entity.name + " affiche une valeur nette de " + fmtEUR(s.value) + " (comptes liés " + fmtEUR(holdingAssets(state, s.entity)) + " − prêts liés " + fmtEUR(holdingDebts(state, s.entity)) + "). La dette est portée par la structure.",
        action: "Vérifiez la capacité de remboursement et la trésorerie de " + s.entity.name,
      });
    }
  });

  /* Détention à 100 % par une seule personne (risque de concentration) */
  summaries.forEach(s => {
    const eff = s.effective;
    if (eff.length === 1 && eff[0].share >= 0.999) {
      const p = PERSONS.find(x => x.id === eff[0].person);
      alerts.push({
        severity: "info", icon: "👤",
        title: s.entity.name + " détenue à 100 % par " + (p ? p.name : eff[0].person),
        detail: "La propriété effective est concentrée sur une seule personne. En cas de succession ou de liquidation, tout le risque repose sur elle.",
        action: "Envisagez une diversification de la détention si pertinent",
      });
    }
  });

  /* Chaîne de détention indirecte (pédagogique) */
  summaries.forEach(s => {
    const indirect = (s.entity.owners || []).some(o => o.kind === "entity");
    if (indirect) {
      const parts = s.effective.map(({ person, share }) => {
        const p = PERSONS.find(x => x.id === person);
        return (p ? p.name : person) + " " + fmtPct(share, 1);
      }).join(" · ");
      alerts.push({
        severity: "info", icon: "🔗",
        title: "Propriété effective de " + s.entity.name,
        detail: "La chaîne de détention indirecte aboutit à : " + parts + ". Les flux (dividendes, plus-values) suivent cette répartition.",
        action: "Gardez les statuts et pactes à jour",
      });
    }
  });

  /* Répartition des parts incomplète */
  summaries.forEach(s => {
    const sum = (s.entity.owners || []).reduce((x, o) => x + (Number(o.share) || 0), 0);
    if ((s.entity.owners || []).length > 0 && Math.abs(sum - 100) > 0.5) {
      alerts.push({
        severity: "warning", icon: "🧩",
        title: "Parts incomplètes sur " + s.entity.name,
        detail: "Les parts déclarées totalisent " + fmtNum(sum) + " % au lieu de 100 %. Complétez la répartition pour un calcul fiable.",
        action: "Complétez la répartition des parts",
      });
    }
  });

  /* Valeur nette consolidée très négative */
  if (total < -100000) {
    alerts.push({
      severity: "danger", icon: "⚠️",
      title: "Holdings à valeur nette consolidée très négative",
      detail: "L'ensemble de vos sociétés affiche " + fmtEUR0(total) + " de valeur nette. Le poids des prêts immobiliers est important : surveillez la trésorerie et le taux d'occupation.",
      action: "Établissez un plan de trésorerie pluriannuel",
    });
  }

  /* Mère-fille : structure de détention en cascade */
  const mothers = cfg.entities.filter(e => holdingChildren(state, e.id).length > 0);
  if (mothers.length > 0) {
    alerts.push({
      severity: "info", icon: "🏢",
      title: "Régime mère-fille actif (" + mothers.map(m => m.name).join(", ") + ")",
      detail: mothers.length + " société(s) mère(s) consolident leurs filiales : les dividendes remontés sont exonérés à 95 % d'IS sous conditions (détention ≥ 5 % depuis ≥ 2 ans). Les parts intra-groupe évitent la double imposition.",
      action: "Documentez la remontée des dividendes dans le registre mère-fille",
    });
  }

  /* Aucune remontée de dividendes alors qu'une chaîne mère-fille existe */
  if (mothers.length > 0 && holdingDividends(state).length === 0) {
    alerts.push({
      severity: "warning", icon: "💸",
      title: "Aucune remontée de dividendes enregistrée",
      detail: "Votre structure mère-fille (" + mothers.map(m => m.name).join(", ") + ") n'a encore remonté aucun dividende. Pensez à enregistrer les distributions de la fille vers la mère pour suivre le cash remonté et l'exonération de 95 % d'IS.",
      action: "Enregistrez un dividende dans l'onglet Holdings",
    });
  }

  return alerts;
}

/* Actifs / dettes directs d'une entité (comptes et prêts liés) */
function holdingAssets(state, entity) {
  return (entity.accountIds || []).reduce((s, id) => {
    const a = state.accounts.find(x => x.id === id);
    return s + (a ? Number(a.balance) || 0 : 0);
  }, 0);
}
function holdingDebts(state, entity) {
  return (entity.loanIds || []).reduce((s, id) => {
    const l = (state.loans || []).find(x => x.id === id);
    return s + (l ? Number(l.remaining) || 0 : 0);
  }, 0);
}

/* Alertes spécifiques aux biens immobiliers */
function computeRealEstateAlerts(state) {
  const alerts = [];
  const biens = biensConfig(state);
  if (biens.length === 0) return alerts;

  biens.forEach(b => {
    const value = bienValue(state, b);
    const debt = bienDebt(state, b);
    const f = bienFlows(state, b);
    const t = bienTravaux(state, b);
    const reserve = bienReserveMonths(state, b);
    const lever = value > 0 ? debt / value : 0;

    /* Cashflow du bien */
    if (b.status === "loue" && f.cashflowMonthly < 0) {
      alerts.push({
        severity: "warning", icon: "📉",
        title: "Cashflow négatif : " + b.name,
        detail: "Le bien dégage " + fmtEUR(f.cashflowMonthly) + "/mois (loyers " + fmtEUR(f.incomeMonthly) + " − charges " + fmtEUR(f.chargesMonthly) + " − prêts " + fmtEUR(f.loansMonthly) + "). Le loyer ne couvre pas les mensualités : il faut renégocier ou restructurer.",
        action: "Renégocier le loyer ou restructurer le crédit",
      });
    } else if (b.status === "en_travaux" && f.cashflowMonthly < 0) {
      alerts.push({
        severity: "info", icon: "🏗️",
        title: "Bien en travaux : cashflow négatif attendu (" + b.name + ")",
        detail: "Aucun loyer pendant les travaux : le bien coûte " + fmtEUR(-f.cashflowMonthly) + "/mois (prêts " + fmtEUR(f.loansMonthly) + " + charges " + fmtEUR(f.chargesMonthly) + "). C'est normal, mais la trésorerie doit tenir jusqu'à la mise en location.",
        action: "Vérifier le plan de trésorerie jusqu'à la location",
      });
    } else if (b.status === "vacant") {
      alerts.push({
        severity: "warning", icon: "🏚️",
        title: "Bien vacant : " + b.name,
        detail: "Le bien ne génère aucun loyer (charges " + fmtEUR(f.chargesMonthly) + " + prêts " + fmtEUR(f.loansMonthly) + "/mois). Chaque mois de vacance coûte ≈ " + fmtEUR0(value * 0.04 / 12) + " de loyer potentiel (4 %/an).",
        action: "Relancer la mise en location",
      });
    }

    /* Suivi travaux : budget vs dépensé */
    if (t.budget > 0) {
      if (t.spent > t.budget) {
        alerts.push({
          severity: "danger", icon: "🚧",
          title: "Budget travaux dépassé : " + b.name,
          detail: fmtEUR(t.spent) + " dépensés pour un budget de " + fmtEUR(t.budget) + " (dépassement " + fmtEUR(t.spent - t.budget) + "). Chaque jour de chantier coûte aussi les intérêts intercalaires.",
          action: "Auditer le chantier et arrêter les dérives",
        });
      } else if (t.spent >= t.budget * 0.8) {
        alerts.push({
          severity: "info", icon: "🚧",
          title: "Budget travaux presque atteint : " + b.name,
          detail: fmtEUR(t.spent) + " dépensés sur " + fmtEUR(t.budget) + " (" + fmtPct(t.spent / t.budget) + "). Anticipez les dernières factures et la mise en location.",
          action: "Clôturer les derniers postes du chantier",
        });
      }
    }

    /* Endettement du bien (dette / valeur) */
    if (lever > 0.8) {
      alerts.push({
        severity: "warning", icon: "🏗️",
        title: "Bien fortement endetté : " + b.name,
        detail: "La dette (" + fmtEUR0(debt) + ") représente " + fmtPct(lever) + " de la valeur du bien (" + fmtEUR0(value) + "). Fonds propres : " + fmtEUR0(value - debt) + ".",
        action: "Prioriser le remboursement de ce crédit",
      });
    }

    /* Réserve de trésorerie du bien */
    if (reserve !== null && reserve < 6) {
      alerts.push({
        severity: "warning", icon: "🛟",
        title: "Réserve de trésorerie faible : " + b.name,
        detail: "Les liquidités liées au bien couvrent " + reserve.toFixed(1) + " mois de charges et mensualités. Objectif : 6 mois minimum pour un bien locatif.",
        action: "Reconstituez la trésorerie du bien",
      });
    }
  });

  return alerts;
}

/* ---------- Score de santé financière (0-100) ---------- */
function computeHealthScore(state) {
  const mos = monthsOfSafety(state);
  const dr = debtRatio(state);
  const sr = savingsRate(state);
  const totals = groupTotals(state);
  const assets = state.accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);

  const parts = [];

  /* Liquidités (25 pts) */
  let liqScore = 0;
  if (mos !== null) liqScore = Math.min(25, Math.round((mos / 6) * 25));
  parts.push({ label: "Marge de sécurité", score: liqScore, max: 25, note: mos !== null ? mos.toFixed(1) + " mois de dépenses" : "—", color: "#3b82f6" });

  /* Épargne (25 pts) */
  let savScore = 0;
  if (sr !== null) savScore = Math.min(25, Math.round((sr / 0.2) * 25));
  parts.push({ label: "Taux d'épargne", score: savScore, max: 25, note: sr !== null ? fmtPct(sr, 1) : "—", color: "#10b981" });

  /* Endettement (25 pts) */
  let debtScore = 25;
  if (dr !== null) {
    if (dr >= 0.5) debtScore = 0;
    else if (dr > 0.35) debtScore = Math.round(25 * (0.5 - dr) / 0.15);
    else debtScore = 25;
  }
  parts.push({ label: "Endettement", score: debtScore, max: 25, note: dr !== null ? fmtPct(dr, 1) : "—", color: "#f59e0b" });

  /* Diversification (15 pts) */
  let divScore = 0;
  const invested = assets > 0 ? (totals.invest || 0) + (totals.crypto || 0) + (totals.immobilier || 0) + (totals.terme || 0) : 0;
  const nbClasses = diversificationClasses(state);
  divScore = Math.min(15, nbClasses * 3);
  const cryptoShare = assets > 0 ? (totals.crypto || 0) / assets : 0;
  if (cryptoShare > 0.1) divScore = Math.max(0, divScore - 5);
  parts.push({ label: "Diversification", score: divScore, max: 15, note: nbClasses + " classes d'actifs", color: "#8b5cf6" });

  /* Coûts & trésorerie (10 pts) */
  let costScore = 10;
  if (mos !== null && mos > 15) costScore -= 3; // liquidités qui dorment
  if (avgMonthly(state, 12).spending > 0) {
    const rate = savingsRate(state) ?? 0;
    if (rate < 0.05) costScore -= 2;
  }
  parts.push({ label: "Trésorerie optimisée", score: costScore, max: 10, note: costScore >= 8 ? "Bon usage" : "À optimiser", color: "#0ea5e9" });

  const total = parts.reduce((s, p) => s + p.score, 0);
  let grade = "À consolider", color = "#f59e0b";
  if (total >= 80) { grade = "Excellente santé"; color = "#16a34a"; }
  else if (total >= 60) { grade = "Bonne santé"; color = "#3b6df0"; }
  else if (total >= 40) { grade = "À surveiller"; color = "#d97706"; }
  else { grade = "À redresser"; color = "#dc2626"; }

  return { score: total, grade, color, parts };
}

/* ---------- Bonnes pratiques ---------- */
function computePractices(state) {
  const avg = avgMonthly(state, 12);
  const mos = monthsOfSafety(state);
  const sr = savingsRate(state);
  const dr = debtRatio(state);
  const split = necessitySplit(state);
  const totals = groupTotals(state);
  const assets = state.accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const cryptoShare = assets > 0 ? (totals.crypto || 0) / assets : 0;
  const totalSpent = split.obligatoire + split.optionnelle + split.ponctuelle;
  const obliShare = totalSpent > 0 ? split.obligatoire / totalSpent : 0;
  const nbClasses = diversificationClasses(state);

  const P = [];

  function push(id, icon, title, desc, status, level) {
    P.push({ id, icon, title, desc, status, level });
  }

  /* 1. Fonds d'urgence */
  if (mos === null) push("urgence", "🛟", "Constituer un fonds d'urgence", "Visez 3 à 6 mois de dépenses sur des supports liquides (Livret A, LDDS).", "À constituer", "bad");
  else if (mos < 3) push("urgence", "🛟", "Fonds d'urgence insuffisant", "Vous couvrez " + mos.toFixed(1) + " mois. Priorité n°1 : atteindre 3 mois, puis 6.", "À renforcer", "bad");
  else if (mos < 6) push("urgence", "🛟", "Fonds d'urgence en cours", "Vous couvrez " + mos.toFixed(1) + " mois sur 6 recommandés. Continuez.", "En bonne voie", "warn");
  else push("urgence", "🛟", "Fonds d'urgence constitué", "Vous couvrez " + mos.toFixed(1) + " mois de dépenses. Excellent rempart contre les imprévus.", "Objectif atteint", "ok");

  /* 2. Règle 50/30/20 */
  const rules = [];
  rules.push(obliShare <= 0.5 ? "50 % obligatoires ✔" : "50 % obligatoires ✘ (" + fmtPct(obliShare) + ")");
  rules.push(sr !== null && sr >= 0.2 ? "20 % épargne ✔" : "20 % épargne ✘ (" + (sr !== null ? fmtPct(sr) : "—") + ")");
  push("50-30-20", "⚖️", "Règle 50 / 30 / 20",
    "Vos dépenses : " + rules.join(" · ") + ". Cible : 50 % charges fixes, 30 % loisirs, 20 % épargne.",
    rules.every(r => r.includes("✔")) ? "Règle respectée" : "À ajuster", rules.every(r => r.includes("✔")) ? "ok" : "warn");

  /* 3. Épargne automatisée (mois courant uniquement) */
  const curKey = currentMonthKey();
  const autoTx = state.transactions.filter(t => t.type === "expense" && t.category === "epargne" && t.recurring && monthOf(t.date) === curKey);
  const autoAmt = autoTx.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  if (autoAmt > 0) push("auto", "⏰", "Épargne automatisée", "Vous épargnez automatiquement " + fmtEUR0(autoAmt) + "/mois. C'est la méthode la plus efficace : payez-vous en premier.", "En place ✔", "ok");
  else push("auto", "⏰", "Automatiser son épargne", "Programmez un virement automatique vers l'épargne le jour du salaire : vous ne dépenserez jamais ce que vous ne voyez pas.", "À mettre en place", "warn");

  /* 4. Diversification */
  if (nbClasses >= 4) push("divers", "🌍", "Patrimoine diversifié", "Vos actifs sont répartis sur " + nbClasses + " classes (liquidités, épargne, investissements, immobilier…). Moins de risques, meilleure résilience.", "Diversifié ✔", "ok");
  else push("divers", "🌍", "Diversifier les classes d'actifs", "Vos actifs sont concentrés sur " + nbClasses + " classe(s). Répartissez entre liquidités, épargne réglementée, actions (PEA) et immobilier.", "À diversifier", "warn");

  /* 5. PEA avant compte-titres */
  const hasPea = state.accounts.some(a => a.type === "pea" || a.type === "pea_pme");
  if (hasPea) push("pea", "🎁", "Profiter de l'enveloppe PEA", "Le PEA offre une fiscalité avantageuse (17,2 % après 5 ans vs 30 % au compte-titres). Vous l'utilisez déjà — privilégiez-le pour vos actions.", "Optimisé ✔", "ok");
  else push("pea", "🎁", "Ouvrir un PEA", "Avant d'investir en actions hors enveloppe, ouvrez un PEA (plafond 225 000 €) : fiscalité allégée après 5 ans de détention.", "À ouvrir", "warn");

  /* 6. Crypto limitée */
  if (cryptoShare <= 0.05) push("crypto", "🪙", "Crypto maîtrisée", "Votre exposition crypto (" + fmtPct(cryptoShare, 1) + ") reste sous le plafond conseillé de 5 % du patrimoine.", "Maîtrisée ✔", "ok");
  else push("crypto", "🪙", "Limiter la part crypto", "Les cryptomonnaies (" + fmtPct(cryptoShare, 1) + " du patrimoine) sont très volatiles : le consensus recommande 1 à 5 % maximum.", "À réduire", "warn");

  /* 7. Suivre ses abonnements */
  const streamTotal = categoryTotals(state, "expense").streaming || 0;
  const optionalTotal = split.optionnelle;
  if (streamTotal > 0 && optionalTotal > 0) {
    const streamShare = streamTotal / optionalTotal;
    push("abos", "📺", "Auditer ses abonnements", "Streaming & médias = " + fmtPct(streamShare) + " de vos dépenses optionnelles. Faites le tri : 1 ou 2 plateformes suffisent souvent.", streamShare > 0.3 ? "À auditer" : "Sous contrôle", streamShare > 0.3 ? "warn" : "ok");
  }

  /* 8. Négocier ses crédits */
  const highRates = state.loans.filter(l => (Number(l.rate) || 0) > 3.5);
  if (highRates.length === 0 && state.loans.length > 0) push("credit", "🤝", "Crédits aux taux avantageux", "Vos crédits sont sous les taux de marché (~3,5 %). Ne rachetez pas inutilement ; gardez le cap des remboursements.", "Optimisé ✔", "ok");
  else if (highRates.length > 0) push("credit", "🤝", "Renégocier les crédits chers", highRates.map(l => l.name + " (" + fmtPct(l.rate / 100, 2) + ")").join(", ") + " : au-dessus des taux actuels. Un rachat de crédit peut réduire la mensualité.", "À négocier", "warn");

  /* 9. Ratios d'endettement */
  if (dr !== null) {
    if (dr <= 0.35) push("endett", "🏗️", "Endettement sous contrôle", "Mensualités = " + fmtPct(dr, 1) + " des revenus (max recommandé : 35 %). Vous gardez une capacité d'emprunt.", "Maîtrisé ✔", "ok");
    else push("endett", "🏗️", "Réduire le ratio d'endettement", "Vos mensualités représentent " + fmtPct(dr, 1) + " des revenus, au-delà du seuil de 35 %. Remboursez les crédits les plus chers en priorité.", "À réduire", "bad");
  }

  /* 10. Faire travailler son argent (liquidités PERSONNELLES, hors sociétés) */
  if (mos !== null && mos > 12) push("travailler", "💪", "Faire travailler son argent", "Plus de 12 mois de liquidités personnelles : l'excédent (" + fmtEUR0(personalLiquidAssets(state) - avg.spending * 6) + ") subit l'inflation. Investissez-le sur du moyen/long terme.", "À investir", "warn");
  else push("travailler", "💪", "Faire travailler son argent", "Votre trésorerie personnelle est calibrée. Continuez à alimenter vos enveloppes (PEA, assurance-vie) avec une stratégie DCA.", "En place ✔", "ok");

  /* 11. Répartition équitable des charges */
  const sc = splitConfig(state);
  if (sc.rent > 0) {
    const debt = sc.debtDavid;
    const monthsCovered = sc.shareDavid > 0 ? Math.round(Math.abs(debt) / sc.shareDavid) : 0;
    if (debt < 0 && monthsCovered >= 3) {
      push("partage", "🤝", "Répartir équitablement les charges", "David doit " + fmtEUR0(-debt) + " à Tommy (≈ " + monthsCovered + " mois de part du loyer Davout). La règle d'or : chacun paie sa part proportionnelle à ses revenus, le mois même.", "À rééquilibrer", "bad");
    } else if (debt < 0) {
      push("partage", "🤝", "Garder le partage des charges à jour", "David doit encore " + fmtEUR0(-debt) + " sur le loyer Davout. Évitez que la dette s'accumule : virement automatique le jour du salaire.", "À surveiller", "warn");
    } else {
      push("partage", "🤝", "Partage des charges équitable", "Chacun verse sa part proportionnelle à ses revenus (" + fmtPct(sc.shareTommy / sc.rent, 1) + " / " + fmtPct(sc.shareDavid / sc.rent, 1) + ") et aucune dette ne subsiste.", "Équilibré ✔", "ok");
    }
  }

  /* 12. Structuration des holdings & sociétés */
  const hCfg = holdingsConfig(state);
  if (hCfg.entities.length > 0) {
    const incomplete = hCfg.entities.some(e => {
      const sum = (e.owners || []).reduce((x, o) => x + (Number(o.share) || 0), 0);
      return (e.owners || []).length === 0 || Math.abs(sum - 100) > 0.5;
    });
    if (incomplete) {
      push("holdings", "🏛️", "Compléter la structuration des sociétés", "Certaines entités ont des parts incomplètes ou absentes. Une détention claire (100 %) est essentielle pour la consolidation, la succession et la fiscalité.", "À compléter", "warn");
    } else {
      const t = totalHoldingsValue(state);
      push("holdings", "🏛️", "Structurer son patrimoine en sociétés", hCfg.entities.length + " entité(s) avec une détention complète (100 %) et tracée. Valeur nette consolidée : " + fmtEUR0(t) + ".", "Structuré ✔", "ok");
    }
  } else {
    push("holdings", "🏛️", "Structurer son patrimoine en sociétés", "Aucune société n'est déclarée. Les holdings permettent de séparer les patrimoines (perso / pro / immo) et d'optimiser la fiscalité à long terme.", "À explorer", "warn");
  }

  /* 13. Régime mère-fille : consolidation & remontée de dividendes */
  const mothers = hCfg.entities.filter(e => holdingChildren(state, e.id).length > 0);
  if (mothers.length > 0) {
    const div12 = holdingDividends(state)
      .filter(d => lastNMonthKeys(12).includes(d.month))
      .reduce((x, d) => x + (Number(d.amount) || 0), 0);
    if (div12 > 0) {
      push("mere-fille", "🏢", "Exploiter le régime mère-fille", "" + mothers.length + " société(s) mère(s) consolident leurs filiales. " + fmtEUR0(div12) + " de dividendes remontés sur 12 mois — 95 % exonérés d'IS sous conditions (détention ≥ 5 % depuis ≥ 2 ans).", "Remontée active ✔", "ok");
    } else {
      push("mere-fille", "🏢", "Remonter les dividendes (mère-fille)", "" + mothers.length + " société(s) mère(s) consolident leurs filiales mais aucun dividende n'a encore été remonté. Les dividendes fille → mère sont exonérés à 95 % d'IS (détention ≥ 5 %, ≥ 2 ans).", "À activer", "warn");
    }
  }

  return P;
}
