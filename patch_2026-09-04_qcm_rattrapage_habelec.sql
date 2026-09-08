-- =====================================================================
--  COLLE UNIVERS BFS — schéma dédié « habelec »
-- =====================================================================

set search_path = habelec, public, extensions;

-- =====================================================================
--  PATCH 2026-09-04 — QCM de rattrapage
--
--  Le formateur peut déclencher, titre par titre en échec, un second QCM
--  plus court (uniquement sur les titres ratés au premier passage). Les
--  titres déjà validés au premier passage ne sont pas repassés. Les deux
--  résultats (premier passage + rattrapage) restent visibles dans
--  l'historique du stagiaire — le rattrapage fait autorité pour les
--  titres qu'il couvre une fois corrigé, l'avis (theorie_gabarit_detail)
--  pioche déjà dans le bon selon HE_pdf.js.
--
--  Un stagiaire a donc au maximum 2 lignes epreuves_theoriques :
--  'initiale' (tous les titres visés) et 'rattrapage' (les titres ratés
--  seulement) — un seul rattrapage possible par défaut (le formateur peut
--  le régénérer tant qu'il n'est pas corrigé, comme pour l'initiale).
--
--  Idempotent, rejouable sans risque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Schéma : un stagiaire peut avoir jusqu'à 2 épreuves théoriques.
-- ---------------------------------------------------------------------
alter table epreuves_theoriques
  add column if not exists type_epreuve text not null default 'initiale'
    check (type_epreuve in ('initiale', 'rattrapage'));

alter table epreuves_theoriques drop constraint if exists epreuves_theoriques_stagiaire_id_key;

-- ADD CONSTRAINT ne supporte pas IF NOT EXISTS : on le fait à la main pour
-- que ce patch reste rejouable même après un échec partiel précédent.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'epreuves_theoriques_stagiaire_type_key'
  ) then
    alter table epreuves_theoriques
      add constraint epreuves_theoriques_stagiaire_type_key unique (stagiaire_id, type_epreuve);
  end if;
end $$;

comment on column epreuves_theoriques.type_epreuve is
  '2026-09-04 : ''initiale'' (tous les titres visés) ou ''rattrapage'' (titres ratés au premier '
  'passage uniquement, généré à la demande du formateur via generer_qcm_rattrapage).';

-- ---------------------------------------------------------------------
-- 2) generer_qcm() : identique, marque juste explicitement 'initiale'.
-- ---------------------------------------------------------------------
create or replace function generer_qcm(p_stagiaire_id uuid, p_seed bigint default null)
returns uuid
language plpgsql security definer set search_path = habelec, public, extensions as $$
declare
  v_seed      bigint := coalesce(p_seed, (random() * 2147483647)::bigint);
  v_epreuve   uuid;
  v_gabarits  text[];
  v_symboles  text[];
  v_pos       int := 0;
  v_actives   boolean;
  v_gabarit   text;
  r           record;
  q           record;
  v_manquant  text;
begin
  select array_agg(symbole_code) into v_symboles
  from stagiaire_symboles where stagiaire_id = p_stagiaire_id;

  if v_symboles is null then
    raise exception 'Aucun titre visé pour ce stagiaire : impossible de générer le QCM.';
  end if;

  select array_agg(distinct sg.gabarit_code) into v_gabarits
  from stagiaire_symboles ss
  join symbole_gabarits sg on sg.symbole_code = ss.symbole_code
  where ss.stagiaire_id = p_stagiaire_id;

  select coalesce(o.fondamentales_actives, true) into v_actives
  from stagiaires st join sessions_formation s on s.id = st.session_id
  join organismes o on o.id = s.organisme_id
  where st.id = p_stagiaire_id;

  select string_agg(format('%s (%s/%s requis, %s/%s fondamentales)',
                           theme_code, dispo, requis, dispo_fond, requis_fond), ' ; ')
    into v_manquant
  from verifier_faisabilite(p_stagiaire_id) where not ok;

  if v_manquant is not null then
    raise exception 'Banque de questions insuffisante pour respecter l''Annexe D.3 : %', v_manquant;
  end if;

  delete from epreuves_theoriques
  where stagiaire_id = p_stagiaire_id and type_epreuve = 'initiale' and statut = 'non_demarree';

  insert into epreuves_theoriques (stagiaire_id, gabarits, seed, statut, type_epreuve)
  values (p_stagiaire_id, v_gabarits, v_seed, 'non_demarree', 'initiale')
  returning id into v_epreuve;

  perform setseed((v_seed % 1000000)::double precision / 1000000.0);

  for r in select * from plan_tirage(p_stagiaire_id) order by theme_code loop
    for q in
      select id, theme_code, fondamentale from questions
      where active and theme_code = r.theme_code and fondamentale
        and (cardinality(symboles_cibles) = 0 or symboles_cibles && v_symboles)
      order by random() limit r.nb_fondamentales
    loop
      v_pos := v_pos + 1;
      insert into epreuve_questions (epreuve_id, question_id, position, theme_code, fondamentale)
      values (v_epreuve, q.id, v_pos, q.theme_code, true);
    end loop;

    for q in
      select id, theme_code, fondamentale from questions
      where active and theme_code = r.theme_code
        and (cardinality(symboles_cibles) = 0 or symboles_cibles && v_symboles)
        and id not in (select question_id from epreuve_questions where epreuve_id = v_epreuve)
      order by random() limit (r.nb - r.nb_fondamentales)
    loop
      v_pos := v_pos + 1;
      insert into epreuve_questions (epreuve_id, question_id, position, theme_code, fondamentale)
      values (v_epreuve, q.id, v_pos, q.theme_code, q.fondamentale);
    end loop;
  end loop;

  if v_actives then
    update epreuve_questions set fondamentale = false where epreuve_id = v_epreuve;

    update epreuve_questions set fondamentale = true
    where id = (
      select eq.id from epreuve_questions eq
      join questions bq on bq.id = eq.question_id
      join themes t on t.code = eq.theme_code
      where eq.epreuve_id = v_epreuve and bq.fondamentale and t.commun
      order by random() limit 1
    );

    foreach v_gabarit in array v_gabarits loop
      update epreuve_questions set fondamentale = true
      where id = (
        select eq.id from epreuve_questions eq
        join questions bq on bq.id = eq.question_id
        where eq.epreuve_id = v_epreuve and bq.fondamentale and eq.fondamentale = false
          and eq.theme_code in (select gq.theme_code from gabarit_quotas gq where gq.gabarit_code = v_gabarit)
        order by random() limit 1
      );
    end loop;
  else
    update epreuve_questions set fondamentale = false where epreuve_id = v_epreuve;
  end if;

  with melange as (
    select id, row_number() over (order by random()) as np
    from epreuve_questions where epreuve_id = v_epreuve
  )
  update epreuve_questions eq
     set position = -m.np
    from melange m where m.id = eq.id;
  update epreuve_questions set position = -position where epreuve_id = v_epreuve;

  update epreuve_questions eq
     set ordre_reponses = (select array_agg(qr.id order by random())
                           from question_reponses qr where qr.question_id = eq.question_id)
   where eq.epreuve_id = v_epreuve;

  update epreuves_theoriques
     set score_total = (select count(*) from epreuve_questions where epreuve_id = v_epreuve)
   where id = v_epreuve;

  insert into journal_audit (acteur_id, entite, entite_id, action, details)
  values (auth.uid(), 'epreuve_theorique', v_epreuve, 'generation',
          jsonb_build_object('seed', v_seed, 'gabarits', v_gabarits));

  return v_epreuve;
end $$;

grant execute on function generer_qcm(uuid, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 3) generer_qcm_rattrapage() : uniquement les titres en échec au premier
--    passage. Même logique de tirage et de plafonnage des fondamentales
--    que generer_qcm(), restreinte aux thématiques des titres ratés.
-- ---------------------------------------------------------------------
create or replace function generer_qcm_rattrapage(p_stagiaire_id uuid, p_seed bigint default null)
returns uuid
language plpgsql security definer set search_path = habelec, public, extensions as $$
declare
  v_seed        bigint := coalesce(p_seed, (random() * 2147483647)::bigint);
  v_ep_init     uuid;
  v_epreuve     uuid;
  v_symboles    text[];
  v_gabarits    text[];  -- titres ratés seulement
  v_pos         int := 0;
  v_actives     boolean;
  v_gabarit     text;
  r             record;
  q             record;
  v_manquant    text;
begin
  select id into v_ep_init from epreuves_theoriques
  where stagiaire_id = p_stagiaire_id and type_epreuve = 'initiale' and statut = 'corrigee';
  if v_ep_init is null then
    raise exception 'Le premier passage doit être corrigé avant de proposer un rattrapage.';
  end if;

  select array_agg(g) into v_gabarits
  from unnest((select gabarits from epreuves_theoriques where id = v_ep_init)) g
  where not theorie_gabarit_ok(v_ep_init, g);

  if v_gabarits is null or cardinality(v_gabarits) = 0 then
    raise exception 'Tous les titres visés sont déjà validés : aucun rattrapage nécessaire.';
  end if;

  select array_agg(symbole_code) into v_symboles
  from stagiaire_symboles where stagiaire_id = p_stagiaire_id;

  select coalesce(o.fondamentales_actives, true) into v_actives
  from stagiaires st join sessions_formation s on s.id = st.session_id
  join organismes o on o.id = s.organisme_id
  where st.id = p_stagiaire_id;

  select string_agg(format('%s (%s/%s requis, %s/%s fondamentales)',
                           f.theme_code, f.dispo, f.requis, f.dispo_fond, f.requis_fond), ' ; ')
    into v_manquant
  from verifier_faisabilite(p_stagiaire_id) f
  where not f.ok
    and f.theme_code in (select gq.theme_code from gabarit_quotas gq
                         where gq.gabarit_code = any(v_gabarits) and gq.nb > 0);

  if v_manquant is not null then
    raise exception 'Banque de questions insuffisante pour respecter l''Annexe D.3 : %', v_manquant;
  end if;

  delete from epreuves_theoriques
  where stagiaire_id = p_stagiaire_id and type_epreuve = 'rattrapage' and statut = 'non_demarree';

  insert into epreuves_theoriques (stagiaire_id, gabarits, seed, statut, type_epreuve)
  values (p_stagiaire_id, v_gabarits, v_seed, 'non_demarree', 'rattrapage')
  returning id into v_epreuve;

  perform setseed((v_seed % 1000000)::double precision / 1000000.0);

  for r in
    select p.theme_code, p.nb, p.nb_fondamentales from plan_tirage(p_stagiaire_id) p
    where p.theme_code in (select gq.theme_code from gabarit_quotas gq
                           where gq.gabarit_code = any(v_gabarits) and gq.nb > 0)
    order by p.theme_code
  loop
    for q in
      select id, theme_code, fondamentale from questions
      where active and theme_code = r.theme_code and fondamentale
        and (cardinality(symboles_cibles) = 0 or symboles_cibles && v_symboles)
      order by random() limit r.nb_fondamentales
    loop
      v_pos := v_pos + 1;
      insert into epreuve_questions (epreuve_id, question_id, position, theme_code, fondamentale)
      values (v_epreuve, q.id, v_pos, q.theme_code, true);
    end loop;

    for q in
      select id, theme_code, fondamentale from questions
      where active and theme_code = r.theme_code
        and (cardinality(symboles_cibles) = 0 or symboles_cibles && v_symboles)
        and id not in (select question_id from epreuve_questions where epreuve_id = v_epreuve)
      order by random() limit (r.nb - r.nb_fondamentales)
    loop
      v_pos := v_pos + 1;
      insert into epreuve_questions (epreuve_id, question_id, position, theme_code, fondamentale)
      values (v_epreuve, q.id, v_pos, q.theme_code, q.fondamentale);
    end loop;
  end loop;

  if v_actives then
    update epreuve_questions set fondamentale = false where epreuve_id = v_epreuve;

    update epreuve_questions set fondamentale = true
    where id = (
      select eq.id from epreuve_questions eq
      join questions bq on bq.id = eq.question_id
      join themes t on t.code = eq.theme_code
      where eq.epreuve_id = v_epreuve and bq.fondamentale and t.commun
      order by random() limit 1
    );

    foreach v_gabarit in array v_gabarits loop
      update epreuve_questions set fondamentale = true
      where id = (
        select eq.id from epreuve_questions eq
        join questions bq on bq.id = eq.question_id
        where eq.epreuve_id = v_epreuve and bq.fondamentale and eq.fondamentale = false
          and eq.theme_code in (select gq.theme_code from gabarit_quotas gq where gq.gabarit_code = v_gabarit)
        order by random() limit 1
      );
    end loop;
  else
    update epreuve_questions set fondamentale = false where epreuve_id = v_epreuve;
  end if;

  with melange as (
    select id, row_number() over (order by random()) as np
    from epreuve_questions where epreuve_id = v_epreuve
  )
  update epreuve_questions eq
     set position = -m.np
    from melange m where m.id = eq.id;
  update epreuve_questions set position = -position where epreuve_id = v_epreuve;

  update epreuve_questions eq
     set ordre_reponses = (select array_agg(qr.id order by random())
                           from question_reponses qr where qr.question_id = eq.question_id)
   where eq.epreuve_id = v_epreuve;

  update epreuves_theoriques
     set score_total = (select count(*) from epreuve_questions where epreuve_id = v_epreuve)
   where id = v_epreuve;

  insert into journal_audit (acteur_id, entite, entite_id, action, details)
  values (auth.uid(), 'epreuve_theorique', v_epreuve, 'generation_rattrapage',
          jsonb_build_object('seed', v_seed, 'gabarits', v_gabarits));

  return v_epreuve;
end $$;

grant execute on function generer_qcm_rattrapage(uuid, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 4) La passation (#stagiaire) sert le rattrapage s'il existe, sinon
--    l'initiale — c'est la seule épreuve "à passer" à un instant donné.
-- ---------------------------------------------------------------------
create or replace function sujet_stagiaire(p_jeton text)
returns jsonb
language plpgsql security definer set search_path = habelec, public, extensions as $$
declare v_st uuid; v_ep uuid; v_res jsonb;
begin
  select st.id into v_st
  from stagiaires st join sessions_formation s on s.id = st.session_id
  where st.jeton = p_jeton and s.statut = 'ouverte';
  if v_st is null then raise exception 'Jeton invalide ou session non ouverte.'; end if;

  select id into v_ep from epreuves_theoriques
  where stagiaire_id = v_st order by (type_epreuve = 'rattrapage') desc limit 1;
  if v_ep is null then raise exception 'Aucun sujet généré pour ce stagiaire.'; end if;

  update epreuves_theoriques
     set statut = 'en_cours', demarree_le = coalesce(demarree_le, now())
   where id = v_ep and statut = 'non_demarree';

  select jsonb_build_object(
    'epreuve_id', v_ep,
    'duree_max_min', (select s.duree_max_min from stagiaires st
                      join sessions_formation s on s.id = st.session_id where st.id = v_st),
    'stagiaire', (select jsonb_build_object('nom', nom, 'prenom', prenom) from stagiaires where id = v_st),
    'fondamentales_actives', coalesce((select o.fondamentales_actives from organismes o
      join sessions_formation s on s.organisme_id = o.id
      join stagiaires st2 on st2.session_id = s.id where st2.id = v_st), true),
    'questions', coalesce(jsonb_agg(x order by x->>'position') , '[]'::jsonb))
    into v_res
  from (
    select jsonb_build_object(
      'id', eq.id,
      'position', eq.position,
      'theme', t.libelle,
      'enonce', q.enonce,
      'numero', q.numero,
      'image_url', q.image_url,
      'choix_multiple', q.choix_multiple,
      'fondamentale', eq.fondamentale,
      'reponses', (select jsonb_agg(jsonb_build_object('id', qr.id, 'libelle', qr.libelle)
                                    order by array_position(eq.ordre_reponses, qr.id))
                   from question_reponses qr where qr.question_id = q.id),
      'reponse_donnee', (select rs.reponses_ids from reponses_stagiaire rs where rs.epreuve_question_id = eq.id)
    ) as x
    from epreuve_questions eq
    join questions q on q.id = eq.question_id
    join themes t on t.code = eq.theme_code
    where eq.epreuve_id = v_ep
  ) s;

  return v_res;
end $$;

grant execute on function sujet_stagiaire(text) to anon, authenticated;

-- liste_stagiaires_session() faisait un simple LEFT JOIN sur
-- epreuves_theoriques (une seule ligne par stagiaire jusqu'ici) : avec
-- jusqu'à 2 lignes désormais, on ne doit regarder que l'épreuve "à passer"
-- (même règle que sujet_stagiaire : rattrapage si présent, sinon initiale).
create or replace function liste_stagiaires_session(p_code text)
returns table (jeton text, nom text, prenom text, deja_termine boolean,
               date_naissance date, entreprise text)
language sql security definer set search_path = habelec, public, extensions as $$
  select st.jeton, st.nom, st.prenom,
         coalesce((
           select et.statut in ('terminee','corrigee')
           from epreuves_theoriques et where et.stagiaire_id = st.id
           order by (et.type_epreuve = 'rattrapage') desc limit 1
         ), false),
         st.date_naissance, st.entreprise
  from sessions_formation s
  join stagiaires st on st.session_id = s.id
  where upper(s.code_acces) = upper(p_code) and s.statut = 'ouverte'
  order by st.ordre, st.nom, st.prenom;
$$;

-- ---------------------------------------------------------------------
-- 5) calculer_resultats() : pour chaque titre visé, on retient l'épreuve
--    qui fait autorité pour LUI — le rattrapage s'il le couvre et est
--    corrigé, sinon l'initiale. Un titre peut donc être validé par
--    l'initiale pendant qu'un autre l'est (ou non) par le rattrapage.
-- ---------------------------------------------------------------------
create or replace function calculer_resultats(p_stagiaire_id uuid)
returns void
language plpgsql security definer set search_path = habelec, public, extensions as $$
declare
  v_ep_init uuid; v_init_statut statut_epreuve;
  v_ep_ratt uuid; v_ratt_statut statut_epreuve; v_ratt_gabarits text[];
  s record; v_theorie boolean; v_prat boolean; v_motif text;
begin
  select id, statut into v_ep_init, v_init_statut
  from epreuves_theoriques where stagiaire_id = p_stagiaire_id and type_epreuve = 'initiale';

  select id, statut, gabarits into v_ep_ratt, v_ratt_statut, v_ratt_gabarits
  from epreuves_theoriques where stagiaire_id = p_stagiaire_id and type_epreuve = 'rattrapage';

  for s in select symbole_code from stagiaire_symboles where stagiaire_id = p_stagiaire_id loop
    if v_ep_init is null or v_init_statut not in ('terminee', 'corrigee') then
      v_theorie := null;
    else
      select coalesce(bool_and(
        case
          when v_ep_ratt is not null and v_ratt_statut = 'corrigee' and sg.gabarit_code = any(v_ratt_gabarits)
            then theorie_gabarit_ok(v_ep_ratt, sg.gabarit_code)
          else theorie_gabarit_ok(v_ep_init, sg.gabarit_code)
        end), false) into v_theorie
      from symbole_gabarits sg where sg.symbole_code = s.symbole_code;
    end if;

    select coalesce(bool_and(coalesce(ep.reussie, false)), false) into v_prat
    from symbole_gabarits sg
    left join epreuves_pratiques ep
      on ep.gabarit_code = sg.gabarit_code and ep.stagiaire_id = p_stagiaire_id
    where sg.symbole_code = s.symbole_code;

    v_motif := nullif(concat_ws(' ; ',
      case when coalesce(v_theorie, false) then null else 'Épreuve théorique non validée' end,
      case when v_prat then null else 'Épreuve pratique non validée' end), '');

    insert into resultats_symbole (stagiaire_id, symbole_code, theorie_ok, pratique_ok, avis, motif, calcule_le)
    values (p_stagiaire_id, s.symbole_code, coalesce(v_theorie, false), v_prat,
            case when coalesce(v_theorie, false) and v_prat then 'favorable'::avis_final
                 when v_theorie is null then 'en_attente'::avis_final
                 else 'defavorable'::avis_final end,
            v_motif, now())
    on conflict (stagiaire_id, symbole_code) do update
      set theorie_ok = excluded.theorie_ok, pratique_ok = excluded.pratique_ok,
          avis = excluded.avis, motif = excluded.motif, calcule_le = now();
  end loop;
end $$;

-- --- Contrôle après application ---------------------------------------------
select column_name, data_type from information_schema.columns
where table_schema = 'habelec' and table_name = 'epreuves_theoriques' and column_name = 'type_epreuve';
