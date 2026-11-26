-- BFS Habelec — patch_2026-11-26_bf_hf_2_titres.sql — (c) Jérémy Bizeul / Vigie-lance
-- BF, BF (chargé de chantier), HF, HF (chargé de chantier) passent dans la sous-catégorie
-- « BF / HF » de la grille (affichage seulement : gabarits et questions inchangés).
-- Prérequis : patch_2026-11-26_bf_hf_1_enum.sql. Idempotent.
update habelec.symboles set ordre = 'bf_hf' where code in ('BF','BF_CDC','HF','HF_CDC');
notify pgrst, 'reload schema';
select code, libelle, domaine, ordre, role from habelec.symboles where ordre = 'bf_hf' order by ordre_affichage;
