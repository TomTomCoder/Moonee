/* ============================================================
   Moonee — Migration localStorage → Supabase (option 5A)
   ============================================================
   Au premier sign-in cloud réussi, pousse l'état local (Budget
   2027 : comptes, prêts, transactions, biens, holdings, dividendes,
   répartition David/Tommy) dans le foyer Supabase de l'utilisateur.

   Idempotent : un foyer « Foyer de <pseudo> » est créé s'il
   n'existe pas encore ; les lignes ne sont pas dupliquées si la
   migration a déjà eu lieu (flag localStorage par utilisateur).

   Ordre des insertions : comptes → prêts → biens (et leurs
   jointures) → transactions (bien_id mappé) → holdings (associés,
   comptes/prêts liés) → dividendes → répartition.
   ============================================================ */

const MOONEE_MIGRATED_KEY = "moonee_migrated_";

/* Migration complète. Retourne { ok, created, skipped, message } */
async function migrateLocalStateToSupabase(state, profile) {
  const sb = await getSupabase();
  if (!sb) return { ok: false, message: "Cloud non configuré (js/config.js)" };

  const user = await cloudUser();
  if (!user) return { ok: false, message: "Connectez-vous d'abord au cloud." };

  const migratedFlag = MOONEE_MIGRATED_KEY + user.id;
  if (localStorage.getItem(migratedFlag)) {
    return { ok: true, skipped: true, message: "Données déjà migrées." };
  }

  const created = { accounts: 0, loans: 0, transactions: 0, biens: 0, holdings: 0, dividends: 0, split: 0 };

  try {
    /* 1. Foyer du profil. S'il existe déjà pour cet utilisateur (migration
       partielle ou re-exécution), on le réutilise : pas de doublon. */
    let hh = null;
    const { data: existingMemberships } = await sb
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .limit(1);
    if (existingMemberships && existingMemberships.length > 0) {
      hh = { id: existingMemberships[0].household_id };
    } else {
      const { data: created, error: hhErr } = await sb
        .from("households")
        .insert({ name: "Foyer de " + (profile.pseudo || user.email || "Moonee"), created_by: user.id })
        .select("id")
        .single();
      if (hhErr) throw new Error(hhErr.message);
      hh = created;
      await sb.from("household_members").insert({
        household_id: hh.id, user_id: user.id, role: "admin",
      });
    }
    /* Sécurité : si le foyer contient déjà des données (migration précédente
       aboutie mais flag localStorage perdu), on ne duplique rien. */
    const { count, error: countErr } = await sb
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("household_id", hh.id);
    if (countErr) throw new Error(countErr.message);
    if (count > 0) {
      localStorage.setItem(migratedFlag, "1");
      return { ok: true, skipped: true, message: "Données déjà présentes dans le cloud." };
    }

    /* 2. Comptes */
    const accIdMap = {};
    for (const a of state.accounts || []) {
      const { data, error } = await sb.from("accounts").insert({
        household_id: hh.id, type: a.type, name: a.name, institution: a.institution,
        balance: Number(a.balance) || 0, rate: a.rate, limit_amount: a.limit,
        opened: a.opened || null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      accIdMap[a.id] = data.id;
      created.accounts++;
    }

    /* 3. Prêts (holder_kind / holder_id conservés) */
    const loanIdMap = {};
    for (const l of state.loans || []) {
      const { data, error } = await sb.from("loans").insert({
        household_id: hh.id, name: l.name, type: l.type, institution: l.institution,
        initial: Number(l.initial) || 0, remaining: Number(l.remaining) || 0,
        monthly: Number(l.monthly) || 0, rate: Number(l.rate) || 0, years: l.years,
        start: l.start || null, holder_kind: l.holder?.kind || null, holder_id: l.holder?.id || null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      loanIdMap[l.id] = data.id;
      created.loans++;
    }

    /* 4. Biens immobiliers + jointures comptes/prêts + flow_keys */
    const bienIdMap = {};
    for (const b of state.biens || []) {
      const trav = b.travaux || {};
      const { data, error } = await sb.from("biens").insert({
        household_id: hh.id, name: b.name, address: b.address || "",
        status: b.status || "loue", valeur: Number(b.valeur) || 0,
        owner_kind: b.owner?.kind || null, owner_id: b.owner?.id || null,
        travaux_budget: Number(trav.budget) || 0, travaux_spent: Number(trav.spent) || 0,
        notes: b.notes || "", flow_keys: Array.isArray(b.flowKeys) ? b.flowKeys : null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      bienIdMap[b.id] = data.id;
      for (const aid of (b.accountIds || [])) {
        if (accIdMap[aid]) await sb.from("bien_accounts").insert({ bien_id: data.id, account_id: accIdMap[aid] });
      }
      for (const lid of (b.loanIds || [])) {
        if (loanIdMap[lid]) await sb.from("bien_loans").insert({ bien_id: data.id, loan_id: loanIdMap[lid] });
      }
      created.biens++;
    }

    /* 5. Transactions (bien_id mappé vers le cloud) */
    for (const t of state.transactions || []) {
      const { error } = await sb.from("transactions").insert({
        household_id: hh.id, account_id: accIdMap[t.account] || null,
        date: t.date, label: t.label, category: t.category, type: t.type,
        amount: Number(t.amount) || 0, necessity: t.necessity || null,
        recurring: !!t.recurring, bien_id: bienIdMap[t.bien] || null,
      });
      if (error) throw new Error(error.message);
      created.transactions++;
    }

    /* 6. Holdings + associés + comptes/prêts liés */
    const holdingIdMap = {};
    for (const e of (state.holdings?.entities || [])) {
      const { data, error } = await sb.from("holdings").insert({
        household_id: hh.id, name: e.name, type: e.type, color: e.color || null,
        notes: e.notes || "",
      }).select("id").single();
      if (error) throw new Error(error.message);
      holdingIdMap[e.id] = data.id;
      for (const o of (e.owners || [])) {
        await sb.from("holding_owners").insert({
          holding_id: data.id, owner_kind: o.kind, owner_id: o.id, share: Number(o.share) || 0,
        });
      }
      for (const aid of (e.accountIds || [])) {
        if (accIdMap[aid]) await sb.from("holding_accounts").insert({ holding_id: data.id, account_id: accIdMap[aid] });
      }
      for (const lid of (e.loanIds || [])) {
        if (loanIdMap[lid]) await sb.from("holding_loans").insert({ holding_id: data.id, loan_id: loanIdMap[lid] });
      }
      created.holdings++;
    }

    /* 7. Dividendes mère-fille */
    for (const d of (state.holdings?.dividends || [])) {
      if (!holdingIdMap[d.from] || !holdingIdMap[d.to]) continue;
      const { error } = await sb.from("dividends").insert({
        household_id: hh.id, from_holding: holdingIdMap[d.from], to_holding: holdingIdMap[d.to],
        month: d.month + "-01", amount: Number(d.amount) || 0, note: d.note || "",
      });
      if (error) throw new Error(error.message);
      created.dividends++;
    }

    /* 8. Répartition David / Tommy */
    const cfg = splitConfig(state);
    const { error: cfgErr } = await sb.from("split_config").insert({
      household_id: hh.id, rent: cfg.rent, salary_david: cfg.salaryDavid,
      salary_tommy: cfg.salaryTommy, share_david: cfg.shareDavid,
      share_tommy: cfg.shareTommy, debt_david: cfg.debtDavid, debt_tommy: cfg.debtTommy,
    });
    if (cfgErr) throw new Error(cfgErr.message);
    for (const m of (cfg.months || [])) {
      await sb.from("split_payments").insert({
        household_id: hh.id, month: m.key + "-01",
        david_paid: Number(m.davidPaid) || 0, tommy_paid: Number(m.tommyPaid) || 0,
        note: m.note || "",
      });
      created.split++;
    }

    localStorage.setItem(migratedFlag, "1");
    return { ok: true, created, message: "Données migrées vers le cloud." };
  } catch (e) {
    return { ok: false, message: e.message || "Échec de la migration." };
  }
}
