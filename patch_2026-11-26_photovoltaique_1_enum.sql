-- =====================================================================
-- BFS Habelec — patch_2026-11-26_photovoltaique_1_enum.sql
-- (c) Jérémy Bizeul / Vigie-lance
-- Objet : nouvelle valeur « photovoltaique » pour le regroupement des titres
--   (grille de choix des titres : groupes Non électrique / Électrique /
--   Photovoltaïque). À exécuter AVANT patch_2026-11-26_photovoltaique_2_titres.sql,
--   dans un onglet SQL Editor séparé (une valeur d'enum n'est utilisable
--   qu'après validation de la transaction qui l'ajoute). Idempotent.
-- =====================================================================
alter type habelec.ordre_operation add value if not exists 'photovoltaique';
