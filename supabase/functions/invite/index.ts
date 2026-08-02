// ============================================================
// Moonee — Edge Function « invite »
// ============================================================
// Inscription contrôlée (option 6B) : un admin de foyer invite un
// membre par email. La fonction :
//   1. vérifie que l'appelant est authentifié ET admin d'un foyer ;
//   2. refuse les doublons (une invitation en attente par email) ;
//   3. crée l'utilisateur via l'Admin API (inviteUserByEmail) — un
//      email avec lien de définition du mot de passe est envoyé ;
//   4. trace l'invitation et lie le nouvel utilisateur au foyer.
//
// Déploiement :
//   supabase functions deploy invite --no-verify-jwt
//   (le JWT est vérifié manuellement ci-dessous pour distinguer
//    l'appelant ; la clé service role reste côté serveur)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    /* 1. L'appelant : session portée par le header Authorization */
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return json({ error: "Non authentifié." }, 401);

    const { email } = await req.json();
    if (!email || typeof email !== "string") return json({ error: "Email manquant." }, 400);
    const mail = email.trim().toLowerCase();

    /* 2. L'appelant doit être admin d'au moins un foyer */
    const { data: memberships, error: mErr } = await supabase
      .from("household_members")
      .select("household_id, role")
      .eq("user_id", user.id);
    if (mErr) return json({ error: mErr.message }, 400);
    const adminHh = (memberships || []).find(m => m.role === "admin");
    if (!adminHh) return json({ error: "Vous n'administrez aucun foyer." }, 403);

    /* 3. Pas de doublon (invitation en attente ou acceptée pour cet email) */
    const { data: existing, error: dupErr } = await supabase
      .from("invitations")
      .select("id, status")
      .eq("household_id", adminHh.household_id)
      .eq("email", mail);
    if (dupErr) return json({ error: dupErr.message }, 400);
    if (existing && existing.length > 0) {
      return json({ error: "Une invitation existe déjà pour cet email." }, 409);
    }

    /* 4. Crée l'utilisateur + email de définition du mot de passe */
    const { data: invited, error: invErr } = await supabase.auth.admin.inviteUserByEmail(mail, {
      data: { pseudo: mail.split("@")[0] },
    });
    if (invErr) return json({ error: invErr.message }, 400);

    /* 5. Trace l'invitation (en attente tant que l'invité n'a pas défini son
       mot de passe) et lie le membre au foyer. La contrainte unique empêche
       les doublons d'invitation. */
    const { error: invRowErr } = await supabase.from("invitations").insert({
      household_id: adminHh.household_id,
      email: mail,
      role: "member",
      status: "pending",
      created_by: user.id,
    });
    if (invRowErr) {
      /* Email déjà invité : on lie quand même s'il s'agit d'un compte existant */
      if (/duplicate/i.test(invRowErr.message)) {
        return json({ error: "Une invitation existe déjà pour cet email." }, 409);
      }
      return json({ error: invRowErr.message }, 400);
    }
    await supabase.from("household_members").insert({
      household_id: adminHh.household_id,
      user_id: invited.user.id,
      role: "member",
    });

    return json({ ok: true, email: mail });
  } catch (e) {
    return json({ error: e.message || "Erreur interne." }, 500);
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
