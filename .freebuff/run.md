# Moonee — Run doc

Static vanilla-JS single-page app (no framework, no build step, no package.json).
Serving the folder with any static file server is sufficient; `index.html` loads
`styles.css`, `js/data.js`, `js/store.js`, `js/alerts.js`, `js/charts.js`,
`js/supabase.js`, `js/migrate.js`, `js/config.js` and `js/app.js` (all local),
plus Chart.js, Google Fonts and the Supabase JS SDK from CDNs (requires internet).

## Reproduce artifacts

No build step and no generated artifacts — the source files in the checkout are
what gets served. There are no `.env` files to copy and no dependencies to
install. A fresh checkout is runnable as-is in **mode local** (data kept in
`localStorage`).

## Run the server

From the project root, with Python 3 (preinstalled on macOS):

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open http://127.0.0.1:8765/index.html.

If port 8765 is taken, pick any free port (e.g. `8800`). The app keeps its data
in `localStorage` per browser origin, so a different port isolates a separate
data store.

## Mode local → Mode cloud (Supabase + multi-utilisateurs)

L'app fonctionne entièrement en local (bouton « Mon profil » en mode local,
données dans le navigateur) jusqu'à ce qu'un projet Supabase soit configuré.

### 1. Créer le projet Supabase (gratuit)

1. Aller sur https://supabase.com → New project (région proche, ex. `eu-west-3`).
2. Dans **SQL Editor**, coller le contenu de `supabase/schema.sql` et l'exécuter
   (une seule fois). Cela crée : `profiles`, `households`, `household_members`,
   `invitations`, `accounts`, `loans`, `transactions`, `biens` (+ jointures),
   `holdings` (+ associés/comptes/prêts), `dividends`, `split_config`,
   `split_payments` — avec **Row Level Security** par foyer, et le trigger
   `handle_new_user` (création du profil à l'inscription).
3. Dans **Authentication → Providers → Email**, vérifier que Email est activé.
   Pour l'**inscription contrôlée** (par invitation), désactiver
   « Allow new users to sign up » — la création de comptes passe alors par
   l'Edge Function « invite » (étape 3). Optionnel : activer les passkeys
   (WebAuthn) dans Authentication → Settings.

### 2. Configurer le frontend

Ouvrir `js/config.js` et renseigner :

```js
window.MOONEE_CONFIG = {
  supabaseUrl: "https://VOTRE-PROJET.supabase.co",
  supabaseAnonKey: "votre-cle-anon-public",
};
```

- URL : Project Settings → API → Project URL.
- Clé **anon public** : Project Settings → API → anon public (elle est PUBLIQUE
  par conception — la sécurité est assurée par le RLS, jamais par cette clé).
- Dès que ces champs sont remplis, la sidebar affiche « Mon profil · <pseudo> »
  avec une section de connexion (email + mot de passe, passkey), l'invitation de
  membres au foyer et la migration des données locales.

### 3. Déployer l'Edge Function d'invitation (inscription contrôlée)

```bash
npx supabase login
npx supabase link --project-ref VOTRE_PROJET_REF
npx supabase functions deploy invite --no-verify-jwt
```

La fonction `supabase/functions/invite/index.ts` vérifie que l'appelant est
authentifié et admin d'un foyer, crée l'utilisateur via l'Admin API
(`inviteUserByEmail`, email avec lien de définition du mot de passe), trace
l'invitation et lie le membre au foyer.

### 4. Migration des données locales (Budget 2027)

Connecté au cloud, ouvrir **Mon profil** → « ⬆ Migrer mes données locales ».
La migration (`js/migrate.js`) pousse comptes, prêts, biens (avec jointures
comptes/prêts et flow_keys), transactions (bien_id mappé), holdings (associés,
comptes/prêts liés), dividendes et répartition David/Tommy dans le foyer.
Idempotente : un flag localStorage par utilisateur empêche toute duplication.

### 5. Héberger sur Vercel

```bash
npx vercel
```

- Framework : **Other** (site statique) — pas de build.
- Root directory : racine du repo (ou le dossier de l'app).
- Le site statique + Supabase fonctionnent sans backend Vercel (toute la logique
  est client-side, la sécurité vient du RLS).

## Notes de sécurité

- La clé anon est publique par conception ; **jamais** la clé `service_role`.
- Le RLS PostgreSQL bloque tout accès aux données hors du foyer de l'utilisateur,
  même en requête directe à l'API.
- L'Edge Function est la seule à utiliser la clé service role, et uniquement côté
  serveur (elle n'est jamais exposée au navigateur).
