-- BFS Habelec — patch_2026-11-26_bf_hf_1_enum.sql — (c) Jérémy Bizeul / Vigie-lance
-- Valeur d'enum « bf_hf » (sous-catégorie BF / HF de la grille des titres).
-- À exécuter AVANT patch_2026-11-26_bf_hf_2_titres.sql, dans un onglet séparé. Idempotent.
alter type habelec.ordre_operation add value if not exists 'bf_hf';
