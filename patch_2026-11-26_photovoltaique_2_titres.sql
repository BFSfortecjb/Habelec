-- =====================================================================
-- BFS Habelec — patch_2026-11-26_photovoltaique_2_titres.sql
-- (c) Jérémy Bizeul / Vigie-lance
-- Objet : sous-catégorie « Photovoltaïque » de la grille des titres, avec
--   les titres B1V Ph, B2V Ph, BR Ph, BC Ph, BE Ph (nouveaux) et BP (déjà
--   existant, déplacé dans ce groupe : affichage seulement, son gabarit et
--   ses questions ne changent pas).
--   Chaque variante « Ph » reprend le gabarit du titre de base (aucune
--   question spécifique photovoltaïque pour l'instant) :
--     B1V Ph -> B1V ; B2V Ph -> B2V ; BR Ph -> BR ; BC Ph -> BC ;
--     BE Ph  -> BP (à confirmer : « opérations spécifiques photovoltaïques »).
--   Prérequis : patch_2026-11-26_photovoltaique_1_enum.sql déjà exécuté.
--   Idempotent.
-- =====================================================================
update habelec.symboles set ordre = 'photovoltaique' where code = 'BP';

insert into habelec.symboles (code, libelle, domaine, ordre, role, ligne_titre, ordre_affichage, actif)
select v.code, v.libelle, 'BT', 'photovoltaique', v.role, v.ligne, v.pos, true
from (values
  ('B1V_PH', 'B1V Ph', 'Exécutant',               'OE_EXEC', 37),
  ('B2V_PH', 'B2V Ph', 'Chargé de travaux',       'OE_CDT',  38),
  ('BR_PH',  'BR Ph',  'Chargé d''intervention BT','OE_CDI', 39),
  ('BC_PH',  'BC Ph',  'Chargé de consignation',  'OE_CDC',  40),
  ('BE_PH',  'BE Ph',  'Chargé d''opérations',    'OE_CDO',  41)
) as v(code, libelle, role, ligne, pos)
where not exists (select 1 from habelec.symboles s where s.code = v.code);

insert into habelec.symbole_gabarits (symbole_code, gabarit_code)
select v.s, v.g
from (values ('B1V_PH','B1V'), ('B2V_PH','B2V'), ('BR_PH','BR'), ('BC_PH','BC'), ('BE_PH','BP')) as v(s, g)
where not exists (select 1 from habelec.symbole_gabarits x
                  where x.symbole_code = v.s and x.gabarit_code = v.g);

notify pgrst, 'reload schema';

-- Contrôle : 6 lignes, groupe photovoltaique, avec leur gabarit
select s.code, s.libelle, s.ordre, s.role, s.ordre_affichage,
       (select string_agg(gabarit_code, ',' order by gabarit_code)
          from habelec.symbole_gabarits where symbole_code = s.code) as gabarits
from habelec.symboles s where s.ordre = 'photovoltaique' order by s.ordre_affichage;
