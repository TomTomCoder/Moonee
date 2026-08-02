/* ============================================================
   Moonee — Client Supabase (chargement paresseux) + profil
   ============================================================
   - Tant que js/config.js ne contient pas d'URL/clé Supabase,
     Moonee reste en MODE LOCAL : données dans localStorage,
     profil géré localement (id unique + pseudo).
   - Dès que le cloud est configuré, le SDK Supabase est chargé
     à la demande (CDN) et l'authentification (email+mdp, passkey)
     prend le relais. Le Row Level Security protège les données.
   ============================================================ */

const MOONEE_PROFILE_KEY = "moonee_profile";

/* Cloud configuré ? (URL + clé anon présentes dans js/config.js) */
function cloudConfigured() {
  const c = window.MOONEE_CONFIG || {};
  return !!(c.supabaseUrl && c.supabaseAnonKey);
}

/* ---------- Profil local (fonctionne sans cloud) ---------- */
function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(MOONEE_PROFILE_KEY) || "null");
    if (p && p.id) return p;
  } catch (e) { /* ignore */ }
  const fresh = { id: uid("u"), pseudo: "Tommy", personId: "tommy", email: "" };
  saveProfile(fresh);
  return fresh;
}

function saveProfile(p) {
  try { localStorage.setItem(MOONEE_PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
}

/* ---------- Client Supabase paresseux (CDN, une seule fois) ---------- */
let _sb = null;
let _sbPromise = null;

async function getSupabase() {
  if (!cloudConfigured()) return null;
  if (_sb) return _sb;
  if (!_sbPromise) {
    _sbPromise = import("https://esm.sh/@supabase/supabase-js@2")
      .then(({ createClient }) => {
        _sb = createClient(window.MOONEE_CONFIG.supabaseUrl, window.MOONEE_CONFIG.supabaseAnonKey);
        return _sb;
      })
      .catch(err => { _sbPromise = null; throw err; });
  }
  return _sbPromise;
}

/* ---------- Authentification (email + mot de passe) ---------- */

/* Inscription : crée le compte cloud. Le trigger handle_new_user crée le
   profil (pseudo transmis en metadata). */
async function cloudSignUp(email, password, pseudo) {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: "Cloud non configuré (js/config.js)" };
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { pseudo } },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function cloudSignIn(email, password) {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: "Cloud non configuré (js/config.js)" };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function cloudSignOut() {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: "Cloud non configuré" };
  const { error } = await sb.auth.signOut();
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* Demande un email de réinitialisation de mot de passe */
async function cloudResetPassword(email) {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: "Cloud non configuré (js/config.js)" };
  const { error } = await sb.auth.resetPasswordForEmail(email);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* Changement de mot de passe (session active) */
async function cloudUpdatePassword(newPassword) {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: "Cloud non configuré" };
  const { error } = await sb.auth.updateUser({ password: newPassword });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ---------- Passkeys (WebAuthn — Touch ID / iCloud Keychain) ---------- */

/* Enregistre une passkey sur l'appareil (session active requise) */
async function cloudRegisterPasskey() {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: "Cloud non configuré (js/config.js)" };
  try {
    if (sb.auth.mfa && typeof sb.auth.mfa.webauthn?.enroll === "function") {
      const { data, error } = await sb.auth.mfa.webauthn.enroll();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    return { ok: false, error: "Passkeys indisponibles avec cette version du SDK Supabase." };
  } catch (e) {
    return { ok: false, error: e.message || "Échec de l'enregistrement de la passkey." };
  }
}

/* Connexion avec une passkey (découvrable : pas besoin d'email) */
async function cloudSignInWithPasskey() {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: "Cloud non configuré (js/config.js)" };
  try {
    if (typeof sb.auth.signInWithWebAuthn === "function") {
      const { data, error } = await sb.auth.signInWithWebAuthn();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    return { ok: false, error: "Passkeys indisponibles avec cette version du SDK Supabase." };
  } catch (e) {
    return { ok: false, error: e.message || "Échec de la connexion par passkey." };
  }
}

/* Utilisateur connecté au cloud ? */
async function cloudUser() {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user || null;
}

/* Écoute les changements de session (connexion / déconnexion) */
function onCloudAuthChange(cb) {
  getSupabase().then(sb => {
    if (sb) sb.auth.onAuthStateChange((event, session) => cb(event, session));
  }).catch(() => {});
}
