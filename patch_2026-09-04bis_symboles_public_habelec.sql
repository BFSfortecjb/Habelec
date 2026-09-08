-- =====================================================================
--  COLLE UNIVERS BFS — schéma dédié « habelec »
-- =====================================================================

set search_path = habelec, public, extensions;

-- =====================================================================
--  PATCH 2026-09-04 (bis) — Liste des titres accessible sans compte
--
--  Le QCM de positionnement (#entrainement) affiche la liste des titres
--  visables (symboles) à un visiteur SANS compte, pour qu'il les coche.
--  L'écran s'appuyait à tort sur S.referentiel (chargé par de simples
--  SELECT directs sur les tables, soumis aux policies RLS — qui
--  n'autorisent pas le rôle anonyme). Sur #stagiaire, ça passait inaperçu
--  car rien à l'écran n'utilise réellement S.referentiel (tout arrive déjà
--  tout fait via les fonctions sécurisées sujet_stagiaire etc.) — mais
--  #entrainement en a réellement besoin pour construire la liste à cocher.
--
--  Nouvelle fonction dédiée, en lecture seule, sans rien d'autre exposé.
-- =====================================================================

create or replace function liste_symboles_public()
returns table (code text, libelle text)
language sql stable security definer set search_path = habelec, public, extensions as $$
  select code, libelle from symboles where actif order by ordre_affichage, libelle;
$$;

grant execute on function liste_symboles_public() to anon, authenticated;
