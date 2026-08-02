/* ============================================================
   Moonee — Configuration Supabase (active)
   ============================================================
   Projet : moonee (tqrthtbohqwzbthokfam) — West EU (Paris)
   La clé « anon public » est PUBLIQUE par conception — la sécurité
   est assurée par le Row Level Security, jamais par cette clé.
   La clé service_role reste côté serveur (Edge Function invite).

   Déploiement Edge Function (déjà fait) :
     supabase functions deploy invite --no-verify-jwt
   */

window.MOONEE_CONFIG = {
  supabaseUrl: "https://tqrthtbohqwzbthokfam.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxcnRodGJvaHF3emJ0aG9rZmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2OTI0MTgsImV4cCI6MjEwMTI2ODQxOH0.GxkORI97kAmF4Xz4Ktn-HL1xGX2_mdmnMmCRqkS1mr4",
};
