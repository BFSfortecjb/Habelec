/* =====================================================================
   BFS Habelec — HE_galaxy.js  (c) Jérémy Bizeul / Vigie-lance
   Intégration Galaxy, étape 3 : LECTURE SEULE (aucun envoi vers Galaxy dans ce fichier).
   Passe par l'Edge Function « habelec-galaxy » (la clé API reste dans les secrets Supabase).
   Le n° de session Galaxy d'Habélec = « formation_id » Galaxy.
   - Création d'une session : le n° Galaxy préremplit intitulé, dates et lieu (modifiables).
   - Détail d'une session : bouton « Galaxy » = importer / synchroniser les inscrits (sens unique Galaxy → Habélec).
   Règles : jamais de suppression ; un nom corrigé dans Habélec n'est jamais écrasé (comparaison avec galaxy_nom /
   galaxy_prenom) ; les homonymes sont rapprochés par l'identifiant Galaxy, jamais par le nom seul.
   ===================================================================== */

async function galaxy(methode, parametres = {}, page = 1, nombre = 400) {
  const { data, error } = await sb.functions.invoke('habelec-galaxy', { body: { methode, parametres, page, nombre } });
  if (error) {
    let m = error.message;
    try { const j = await error.context.json(); m = j.error || m; } catch (_e) { /* garde le message */ }
    throw new Error(m);
  }
  if (!data?.ok) throw new Error(data?.error || 'Réponse Galaxy invalide');
  return data.reponse;
}

const jourGalaxy = v => String(v || '').slice(0, 10) || null;
// Comparaison de codes tolérante : casse, accents, points et espaces multiples ignorés (« B0 Rec. » = « b0 rec »)
const normCodeGalaxy = c => String(c || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
const normNomGalaxy = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** Table code Galaxy (normalisé) → { code Habélec, recyclage } d'après symboles.code_galaxy / code_galaxy_rec. */
function tableCodesGalaxy() {
  const t = new Map();
  (S.referentiel.symboles || []).forEach(sy => {
    if (sy.code_galaxy) t.set(normCodeGalaxy(sy.code_galaxy), { code: sy.code, rec: false });
    if (sy.code_galaxy_rec) t.set(normCodeGalaxy(sy.code_galaxy_rec), { code: sy.code, rec: true });
  });
  return t;
}
const categoriesGalaxy = texte => String(texte || '').split(/\s*(?:,|;|\/|\+|\s+et\s+)\s*/i).map(x => x.trim()).filter(Boolean);

/** Lieu Galaxy → lieu Habélec (Briec / Sèvremont), ou null si non reconnu. */
function lieuDepuisGalaxy(f) {
  const t = ((f?.nom_lieu || '') + ' ' + (f?.ville || '')).toLowerCase();
  if (/vend[ée]e|mont-mercure|s[èe]vremont/.test(t)) return 'Sèvremont';
  if (/briec|bretagne/.test(t)) return 'Briec';
  return null;
}

async function formationGalaxy(numero) {
  const n = Number(String(numero).trim());
  if (!n) throw new Error('N° de session Galaxy invalide');
  const rep = await galaxy('get_formations', { search: { formation_id: n }, avec_liste_des_formateur: 1 }, 1, 5);
  return (rep.result || [])[0] || null;
}

/** Inscrits d'une formation (sans annulés) avec la fiche stagiaire. Galaxy ne donne pas le formation_id dans get_sta_ins :
 *  rapprochement par produit + date de début + salle (comme BFS CACES). */
async function inscritsGalaxy(f) {
  const jour = jourGalaxy(f.date_debut);
  const rep = await galaxy('get_sta_ins', { search: { produit_id: f.produit_id, date_debut: jour } }, 1, 400);
  const lignes = (rep.result || []).filter(x => String(x.salle_id || '') === String(f.salle_id || '')
    && String(x.annule) !== '1' && jourGalaxy(x.date_debut) === jour);
  // Noms via les présences (la clé « BFS HABELEC » n'autorise pas get_stagiaires) : un appel pour toute la formation.
  const noms = new Map();
  try {
    const pr = await galaxy('get_presence_stagiaire', { formation_id: f.formation_id }, 1, 400);
    (pr.result || []).forEach(x => { if (x.stagiaire_id && !noms.has(String(x.stagiaire_id))) noms.set(String(x.stagiaire_id), { nom: x.nom, prenom: x.prenom }); });
  } catch (_e) { /* présences facultatives */ }
  let fichesOk = true;   // get_stagiaires non autorisé pour cette clé : on n'insiste pas après un échec
  const sortie = [];
  for (const l of lignes) {
    let fiche = noms.get(String(l.stagiaire_id)) || {};
    if (fichesOk) {
      try { fiche = { ...fiche, ...(((await galaxy('get_stagiaires', { search: { id: l.stagiaire_id } }, 1, 5)).result || [])[0] || {}) }; }
      catch (_e) { fichesOk = false; /* fiche facultative */ }
    }
    sortie.push({
      galaxy_id: String(l.stagiaire_id), nom: (l.nom || fiche.nom || '').trim(), prenom: (l.prenom || fiche.prenom || '').trim(),
      email: (l.mail_pro || l.mail_perso || fiche.mail_pro || fiche.mail_perso || '').trim() || null,
      fonction: (fiche.fonction || '').trim() || null,
      entreprise: (fiche.entreprise_rattache || fiche.nom_etablissement || '').trim() || null,
      naissance: jourGalaxy(fiche.date_naissance),
      categories: categoriesGalaxy(l.categorie_suivi),
    });
  }
  return sortie;
}

/* ============ Détail d'une session : importer / synchroniser ============ */
async function ouvrirImportGalaxy() {
  const s = S.session;
  if (!s.numero_session_galaxy) return toast('Renseigne d\'abord le n° de session Galaxy.', 'erreur');
  ouvrirModale('Galaxy — inscrits', '<p class="chargement">Lecture de Galaxy…</p>');
  try {
    const form = await formationGalaxy(s.numero_session_galaxy);
    if (!form) { fermerModale(); return toast('Aucune formation avec ce numéro dans Galaxy.', 'erreur', 6000); }
    const inscrits = await inscritsGalaxy(form);
    const { data: exist, error: ee } = await sb.from('stagiaires')
      .select('id, nom, prenom, galaxy_stagiaire_id, galaxy_nom, galaxy_prenom, recyclage, stagiaire_symboles(symbole_code)')
      .eq('session_id', s.id);
    if (ee) throw ee;
    const codes = tableCodesGalaxy();
    const parGalaxyId = new Map((exist || []).filter(x => x.galaxy_stagiaire_id).map(x => [x.galaxy_stagiaire_id, x]));
    const sansLien = (exist || []).filter(x => !x.galaxy_stagiaire_id);
    const idsInscrits = new Set(inscrits.map(i => i.galaxy_id));

    // Plan d'actions : aucune ligne n'est supprimée.
    const plan = inscrits.map(i => {
      const titres = i.categories.map(c => ({ brut: c, m: codes.get(normCodeGalaxy(c)) || null }));
      const connus = titres.filter(t => t.m);
      const rec = connus.some(t => t.m.rec);   // au moins un titre en recyclage => stagiaire en recyclage
      const lie = parGalaxyId.get(i.galaxy_id);
      if (lie) return { i, titres, rec, type: 'sync', st: lie };
      const cand = sansLien.filter(x => normNomGalaxy(x.nom) === normNomGalaxy(i.nom) && normNomGalaxy(x.prenom) === normNomGalaxy(i.prenom));
      if (cand.length === 1) return { i, titres, rec, type: 'rattacher', st: cand[0] };
      if (cand.length > 1) return { i, titres, rec, type: 'homonymes', st: null };
      return { i, titres, rec, type: 'nouveau', st: null };
    });
    const absents = (exist || []).filter(x => x.galaxy_stagiaire_id && !idsInscrits.has(x.galaxy_stagiaire_id));
    const aTraiter = plan.filter(p => p.type !== 'homonymes' && (p.type !== 'sync' || p.st.galaxy_nom !== p.i.nom.toUpperCase() || p.st.galaxy_prenom !== p.i.prenom)).length;
    const libType = { sync: 'déjà lié', rattacher: 'à rattacher (même nom)', nouveau: 'à importer', homonymes: 'homonymes : à lier à la main' };
    const puces = p => p.titres.map(t => `<span class="etat ${t.m ? 'ok' : 'ko'}" title="${t.m ? esc(libelleSymbole(t.m.code)) + (t.m.rec ? ' (recyclage)' : '') : 'Code inconnu dans Habélec : ignoré'}">${esc(t.brut)}</span>`).join(' ');

    ouvrirModale(`Galaxy — ${form.nom_produit || ''} (${dateFr(jourGalaxy(form.date_debut))})`, `
      <p class="aide">${inscrits.length} inscrit(s) dans Galaxy. Sens unique Galaxy → Habélec : rien n'est supprimé, un nom corrigé ici n'est jamais écrasé.</p>
      <table class="tableau"><thead><tr><th>Nom</th><th>Prénom</th><th>Entreprise</th><th>Titres (Galaxy)</th><th>État</th></tr></thead><tbody>
      ${plan.map(p => `<tr><td>${esc(p.i.nom)}</td><td>${esc(p.i.prenom)}</td><td>${esc(p.i.entreprise || '')}</td><td>${puces(p)}</td>
        <td><span class="etat ${p.type === 'homonymes' ? 'avertissement' : (p.type === 'sync' ? 'neutre' : 'ok')}">${libType[p.type]}</span></td></tr>`).join('')
        || '<tr><td colspan="5" class="vide">Aucun inscrit trouvé dans Galaxy pour cette formation.</td></tr>'}</tbody></table>
      ${absents.length ? `<p class="aide"><b>Présents dans Habélec mais plus inscrits dans Galaxy</b> (non supprimés) :
        ${absents.map(a => esc(a.nom + ' ' + a.prenom)).join(', ')}.</p>` : ''}
      <div class="pied-modale"><button type="button" onclick="fermerModale()">Fermer</button>
        <button class="principal" id="btn-import-galaxy" ${aTraiter ? '' : 'disabled'}>Importer / synchroniser (${aTraiter})</button></div>
      <p id="msg-import-galaxy" class="aide"></p>`);

    $('#btn-import-galaxy')?.addEventListener('click', async () => {
      const msg = $('#msg-import-galaxy'); $('#btn-import-galaxy').disabled = true;
      try {
        let n = 0;
        for (const p of plan) {
          if (p.type === 'homonymes') continue;
          const nomG = p.i.nom.toUpperCase();
          const titresOk = [...new Set(p.titres.filter(t => t.m).map(t => t.m.code))];
          if (p.type === 'sync' || p.type === 'rattacher') {
            const maj = { galaxy_stagiaire_id: p.i.galaxy_id, galaxy_nom: nomG, galaxy_prenom: p.i.prenom };
            // le nom/prénom d'Habélec ne change que s'il n'avait pas été corrigé à la main
            if (p.type === 'sync') {
              if (p.st.nom === p.st.galaxy_nom && p.st.galaxy_nom !== nomG) maj.nom = nomG;
              if (p.st.prenom === p.st.galaxy_prenom && p.st.galaxy_prenom !== p.i.prenom) maj.prenom = p.i.prenom;
            }
            const unchanged = p.type === 'sync' && p.st.galaxy_nom === nomG && p.st.galaxy_prenom === p.i.prenom && !maj.nom && !maj.prenom;
            if (!unchanged) {
              msg.textContent = `Synchronisation ${++n}…`;
              const { error } = await sb.from('stagiaires').update(maj).eq('id', p.st.id);
              if (error) throw error;
            }
            // titres : renseignés seulement si la fiche n'en a encore aucun
            if (!(p.st.stagiaire_symboles || []).length && titresOk.length) {
              const { error } = await sb.from('stagiaire_symboles').insert(titresOk.map(c => ({ stagiaire_id: p.st.id, symbole_code: c })));
              if (error) throw error;
            }
            // recyclage : passe à « recyclage » (couleur bleue) si Galaxy a un code « Rec » ; jamais remis en initial automatiquement
            if (p.rec && !p.st.recyclage) await sb.from('stagiaires').update({ recyclage: true }).eq('id', p.st.id);
          } else if (p.type === 'nouveau') {
            msg.textContent = `Import ${++n}…`;
            const { data, error } = await sb.from('stagiaires').insert({
              session_id: s.id, nom: nomG, prenom: p.i.prenom, fonction: p.i.fonction, entreprise: p.i.entreprise, email: p.i.email,
              date_naissance: /^\d{4}-\d{2}-\d{2}$/.test(p.i.naissance || '') ? p.i.naissance : null,
              recyclage: p.rec, galaxy_stagiaire_id: p.i.galaxy_id, galaxy_nom: nomG, galaxy_prenom: p.i.prenom }).select().single();
            if (error) throw error;
            if (titresOk.length) {
              const { error: e2 } = await sb.from('stagiaire_symboles').insert(titresOk.map(c => ({ stagiaire_id: data.id, symbole_code: c })));
              if (e2) throw e2;
            }
          }
        }
        fermerModale(); toast(`Galaxy : ${n} stagiaire(s) importé(s) / synchronisé(s)`);
        rendreDetailSession($('#contenu'));
      } catch (e) { msg.textContent = ''; $('#btn-import-galaxy').disabled = false; erreurSupabase('Import Galaxy', e); }
    });
  } catch (e) { fermerModale(); erreurSupabase('Lecture Galaxy', e); }
}


/* ============ Présences Galaxy (lecture seule) ============
 * Tableau des demi-journées suivies par stagiaire (comme la fiche Galaxy), via get_presence_stagiaire.
 * Une demi-journée est « prévue » si son créneau existe (début ≠ 00:00) ; « suivie » si Galaxy marque le stagiaire présent. */
const heuresGalaxy = t => { const m = /^(\d+):(\d+)/.exec(String(t || '')); return m ? Number(m[1]) + Number(m[2]) / 60 : 0; };
const formatHeures = h => { const e = Math.floor(h), mn = Math.round((h - e) * 60); return mn ? `${e} h ${String(mn).padStart(2, '0')}` : `${e} h`; };

async function chargerPresencesGalaxy(zone, s, stagiaires) {
  if (!zone) return;
  const formationId = Number(String(s.numero_session_galaxy || '').trim());
  if (!formationId) return;
  zone.innerHTML = '<p class="aide">Présences Galaxy : chargement…</p>';
  let lignes = [];
  try { lignes = ((await galaxy('get_presence_stagiaire', { formation_id: formationId }, 1, 400)).result || []); }
  catch (e) { zone.innerHTML = `<p class="aide">Présences Galaxy indisponibles (${esc(e.message)}).</p>`; return; }
  if (!lignes.length) { zone.innerHTML = '<p class="aide">Présences Galaxy : aucune donnée pour cette session.</p>'; return; }
  const jours = [...new Set(lignes.map(l => String(l.date_formation).slice(0, 10)))].sort();
  const parId = new Map();
  lignes.forEach(l => {
    const id = String(l.stagiaire_id);
    if (!parId.has(id)) parId.set(id, { nom: `${(l.nom || '').trim()} ${(l.prenom || '').trim()}`.trim(), jours: {}, heures: 0 });
    const e = parId.get(id), jour = String(l.date_formation).slice(0, 10), present = String(l.present) === '1';
    const prevM = String(l.debut_matin || '00:00:00') !== '00:00:00', prevA = String(l.debut_aprem || '00:00:00') !== '00:00:00';
    e.jours[jour] = { m: prevM ? (present ? 'ok' : 'abs') : 'non', a: prevA ? (present ? 'ok' : 'abs') : 'non' };
    if (present) e.heures += heuresGalaxy(l.duree_plage);
  });
  const lie = new Map((stagiaires || []).filter(x => x.galaxy_stagiaire_id).map(x => [String(x.galaxy_stagiaire_id), x]));
  const puce = (v, lib) => `<span title="${v === 'ok' ? lib + ' suivi' : v === 'abs' ? lib + ' : absent' : lib + ' : non prévu'}" style="display:block;margin:2px auto;min-width:3.2em;padding:1px 6px;border-radius:4px;font-size:12px;`
    + (v === 'ok' ? 'background:#2e8b57;color:#fff' : v === 'abs' ? 'background:#b2181a;color:#fff' : 'background:#eee;color:#999') + `">${lib} ${v === 'ok' ? '✓' : v === 'abs' ? '✗' : '–'}</span>`;
  const entete = jours.map(j => `<th style="text-align:center">${esc(new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }))}<br>${esc(dateFr(j).slice(0, 5))}</th>`).join('');
  const corps = [...parId.entries()].map(([id, e]) => {
    const st = lie.get(id), nom = st ? `${st.nom} ${st.prenom}` : e.nom;
    const cls = st?.recyclage ? ' class="nom-recyclage"' : '';
    return `<tr><td${cls}><b>${esc(nom)}</b>${st ? '' : ' <span class="aide">(pas dans la liste)</span>'}</td>`
      + jours.map(j => { const c = e.jours[j]; return `<td style="text-align:center">${c ? puce(c.m, 'M') + puce(c.a, 'A') : '—'}</td>`; }).join('')
      + `<td style="text-align:center"><b>${formatHeures(e.heures)}</b></td></tr>`;
  }).join('');
  zone.innerHTML = `<details class="carte"><summary><b>Présences Galaxy — demi-journées suivies</b></summary>
    <table class="tableau compact"><thead><tr><th>Stagiaire</th>${entete}<th style="text-align:center">Total présent</th></tr></thead><tbody>${corps}</tbody></table>
    <p class="aide">Lecture seule, d'après Galaxy (M = matin, A = après-midi). Le total additionne les durées prévues des jours où le stagiaire est présent.</p></details>`;
}
