/* =====================================================================
   CONFIGURATION — à renseigner une seule fois

   Où trouver ces deux valeurs :
   Supabase > ton projet > Project Settings > API
     - "Project URL"        -> SUPABASE_URL
     - "anon public" key    -> SUPABASE_ANON_KEY

   La clé « anon » est faite pour être publique : elle ne donne accès
   qu'à ce que les règles de sécurité (RLS) autorisent. Ne jamais
   mettre ici la clé « service_role ».
   ===================================================================== */

const CONFIG = {
  SUPABASE_URL: 'https://dqraobwozowtnrieitkp.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_UhkImOyooXPnAqTCNMJ4wA_VVqscCmK',

  // Schéma Postgres dédié à Habelec dans le projet Supabase partagé Univers BFS.
  // Ne jamais mettre 'public' : c'est la règle commune Univers BFS (chaque appli
  // a son propre schéma). Doit être ajouté aux "Exposed schemas" dans
  // Supabase > Project Settings > API avant de fonctionner.
  SUPABASE_SCHEMA: 'habelec',

  // Nom affiché en haut de l'application
  NOM_APPLICATION: 'BFS Habelec',

  // Mode diagnostic : true = affiche le journal technique à l'écran
  DEBUG: false,
};
