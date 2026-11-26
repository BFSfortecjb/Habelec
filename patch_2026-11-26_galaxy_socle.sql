-- =====================================================================
-- BFS Habelec — patch_2026-11-26_galaxy_socle.sql — (c) Jérémy Bizeul / Vigie-lance
-- Socle de l'intégration Galaxy (étape 1, aucun envoi) :
--   1) stagiaires : galaxy_stagiaire_id + galaxy_nom / galaxy_prenom (valeurs d'origine,
--      pour ne pas écraser un nom corrigé dans Habélec) + index unique par session ;
--   2) symboles : code_galaxy (initial) et code_galaxy_rec (recyclage) ;
--   3) galaxy_envois : journal de chaque simulation / envoi, avec RLS par organisme.
-- Idempotent. Aucun DROP.
-- =====================================================================
alter table habelec.stagiaires
  add column if not exists galaxy_stagiaire_id text,
  add column if not exists galaxy_nom text,
  add column if not exists galaxy_prenom text;

create unique index if not exists stagiaires_session_galaxy_uniq
  on habelec.stagiaires (session_id, galaxy_stagiaire_id)
  where galaxy_stagiaire_id is not null;

alter table habelec.symboles
  add column if not exists code_galaxy text,
  add column if not exists code_galaxy_rec text;

update habelec.symboles s set code_galaxy = v.ini, code_galaxy_rec = v.rec
from (values
  ('B0','B0','B0 Rec.'),
  ('B0_CDC','B0 cdc','B0 cdc Rec'),
  ('H0','H0','H0 rec.'),
  ('H0_CDC','H0 cdc','H0 cdc Rec'),
  ('H0V','H0v','H0v Rec'),
  ('H0V_CDC','H0v cdc','H0v cdc Rec'),
  ('BF','BF','BF Rec'),
  ('BF_CDC','BF cdc','BF cdc Rec'),
  ('HF','HF','HF Rec'),
  ('HF_CDC','HF cdc','HF cdc Rec'),
  ('B1','B1','B1 Rec'),
  ('B1V','B1V','B1v Rec'),
  ('B1T','B1T','B1T Rec'),
  ('B1N','B1N','B1N Rec'),
  ('H1','H1','H1 Rec'),
  ('H1V','H1v','H1v Rec'),
  ('B2','B2','B2 Rec'),
  ('B2V','B2v','B2v Rec'),
  ('B2T','B2T','B2T Rec'),
  ('B2N','B2N','B2N Rec'),
  ('B2V_ESSAI','B2v E','B2v E Rec'),
  ('H2','H2','H2 Rec'),
  ('H2V','H2v','H2v Rec'),
  ('H2V_ESSAI','H2v E','H2v E Rec'),
  ('BS','BS','BS Rec.'),
  ('BR','BR','BR Rec'),
  ('BC','BC','BC Rec'),
  ('HC','HC','HC Rec'),
  ('BP','BP','BP Rec'),
  ('BE_MANOEUVRE','BEM','BEM Rec.'),
  ('BE_ESSAI','BEE','BEE Rec'),
  ('BE_VERIFICATION','BE Vé','BE Vé Rec'),
  ('BE_MESURAGE','BEME','BEME Rec'),
  ('HE_MANOEUVRE','HE Ma','HE Ma Rec'),
  ('HE_ESSAI','HEE','HEE Rec'),
  ('HE_VERIFICATION','HE Vé','HE Vé Rec'),
  ('HE_MESURAGE','HE Me','HE Me Rec'),
  ('B1V_PH','B1v Ph','B1v Ph Rec'),
  ('B2V_PH','B2v Ph','B2v Ph Rec'),
  ('BR_PH','BR Ph','BR Ph Rec'),
  ('BC_PH','BC Ph','BC Ph Rec'),
  ('BE_PH','BE Ph','BE Ph Rec')
) as v(code, ini, rec)
where s.code = v.code and (s.code_galaxy is distinct from v.ini or s.code_galaxy_rec is distinct from v.rec);

create table if not exists habelec.galaxy_envois (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references habelec.sessions_formation(id) on delete cascade,
  stagiaire_id  uuid references habelec.stagiaires(id) on delete set null,
  galaxy_stagiaire_id text,
  nature        text not null check (nature in ('resultat','document')),
  symbole_code  text,
  code_galaxy   text,
  mode          text not null check (mode in ('simulation','reel')),
  statut        text not null check (statut in ('ok','erreur')),
  reponse       jsonb,
  envoye_par    uuid default auth.uid(),
  cree_le       timestamptz not null default now()
);
create index if not exists galaxy_envois_session_idx on habelec.galaxy_envois (session_id, cree_le desc);

alter table habelec.galaxy_envois enable row level security;

drop policy if exists genv_lecture on habelec.galaxy_envois;
create policy genv_lecture on habelec.galaxy_envois for select to authenticated
using (habelec.utilisateur_autorise() and exists (
  select 1 from habelec.sessions_formation s
  where s.id = session_id and s.organisme_id is not distinct from habelec.utilisateur_organisme()));

drop policy if exists genv_ecriture on habelec.galaxy_envois;
create policy genv_ecriture on habelec.galaxy_envois for insert to authenticated
with check (habelec.utilisateur_autorise() and exists (
  select 1 from habelec.sessions_formation s
  where s.id = session_id and s.organisme_id is not distinct from habelec.utilisateur_organisme()));

revoke all on habelec.galaxy_envois from public, anon;
grant select, insert on habelec.galaxy_envois to authenticated;

notify pgrst, 'reload schema';

-- Contrôle : 42 titres avec leurs codes Galaxy
select count(*) filter (where code_galaxy is not null) titres_avec_code,
       (select count(*) from information_schema.tables where table_schema='habelec' and table_name='galaxy_envois') journal
from habelec.symboles;
