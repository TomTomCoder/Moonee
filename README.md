# 🌙 Moonee

Gestion financière personnelle et familiale — comptes, épargne, investissements,
immobilier, holdings, répartition des charges et alertes automatiques.

Application web **100 % statique** (vanilla JS, sans build) avec un design
inspiré de macOS, hébergeable gratuitement sur Vercel. Les données peuvent être
stockées localement (localStorage) **ou** dans un backend **Supabase**
(Postgres + Auth + Row Level Security) pour le multi-utilisateurs et le partage
en foyer.

## ✨ Fonctionnalités

- **Tableau de bord** : patrimoine net, trésorerie, coussin de sécurité, taux
  d'épargne, endettement, score de santé financière (0-100)
- **Comptes & patrimoine** : comptes courants, livrets, PEA, crypto, comptes pro,
  avec groupes (épargne réglementée, investissements, immobilier…)
- **Revenus & charges** : transactions catégorisées, dépenses récurrentes
  (génération automatique du mois suivant), projection 12 mois, import/export CSV
- **Prêts** : immobilier, travaux, consommation — capital restant, mensualités,
  ratio d'endettement
- **Immobilier** : valeur, fonds propres, cashflow net, rendement brut/net,
  suivi des travaux (budget vs dépensé), performance annuelle
- **Holdings & sociétés** : SASU, SCI, chaîne de détention, propriété effective,
  dividendes mère-fille, simulateur de remontée de trésorerie
- **Répartition** : partage du loyer entre personnes (David / Tommy), suivi des
  dettes et des versements
- **Alertes automatiques** : bonnes pratiques financières surveillées en continu
- **Multi-utilisateurs** (optionnel, Supabase) : comptes email + mot de passe,
  passkeys (Touch ID / iCloud Keychain), invitation de membres, partage en foyer
  avec Row Level Security

## 🚀 Démarrage rapide (mode local)

Aucune installation, aucun build. Servez le dossier avec n'importe quel serveur
statique :

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Puis ouvrez http://127.0.0.1:8765/index.html.

En mode local, toutes les données restent dans le navigateur (localStorage) et
un profil « Mon profil » est créé automatiquement (ID unique + pseudo).

## ☁️ Activer le cloud (Supabase + multi-utilisateurs)

1. Créez un projet gratuit sur https://supabase.com
2. Exécutez `supabase/schema.sql` dans le SQL Editor (tables + Row Level Security)
3. Renseignez l'URL du projet et la clé **anon public** dans `js/config.js`
4. Déployez la fonction d'invitation :

   ```bash
   npx supabase login
   npx supabase link --project-ref VOTRE_PROJET_REF
   npx supabase functions deploy invite --no-verify-jwt
   ```

5. Connectez-vous via « Mon profil » → « ⬆ Migrer mes données locales » pour
   pousser vos données (Budget 2027) dans votre foyer Supabase.

> 🔒 La clé anon est **publique par conception** — la sécurité est assurée par le
> Row Level Security PostgreSQL, jamais par la clé. La clé `service_role` reste
> exclusivement côté serveur (Edge Function).

## 🌍 Déployer sur Vercel

```bash
npx vercel
```

Framework : **Other** (site statique) — pas de build, pas de configuration.

## 📁 Structure

```
index.html          Interface (sidebar, pages, modales)
styles.css          Design system macOS
js/config.js        Configuration Supabase (à remplir)
js/supabase.js      Client Supabase + auth (email/passkey) + profil
js/migrate.js       Migration localStorage → Supabase
js/data.js          Constantes, catégories, jeu de données initial
js/store.js         Persistance, helpers, statistiques
js/alerts.js        Alertes automatiques, score de santé
js/charts.js        Graphiques Chart.js
js/app.js           Rendu UI, navigation, formulaires
supabase/schema.sql Schéma Postgres + Row Level Security
supabase/functions  Edge Functions (invitation de membres)
```

## 📄 Licence

Projet personnel — usage privé.
