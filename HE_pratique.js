/* =====================================================================
   HE_pratique.js — épreuve pratique (savoir-faire)

   Barème imposé par la NF C18-510 § D.3 :
     A = sans erreur
     B = erreur acceptable (minime)
     C = erreur majeure (risque de mise en danger)
     D = erreur grave (comportement dangereux)
   Critère d'acceptation : aucun D et un seul C au maximum pour chaque
   mise en situation. La grille est celle des tableaux D.2 à D.12.

   Validation du titre (2026-08) : chaque gabarit définit un nombre de mises
   en situation obligatoires (par défaut 1) et un nombre de rattrapage (par
   défaut 1), réglables par titre depuis l'onglet admin « Titres ». Le
   rattrapage n'est utile qu'en cas d'échec des obligatoires ; le titre est
   validé dès qu'une mise en situation obligatoire OU de rattrapage est
   conforme. Logique dupliquée côté SQL dans epreuve_pratique_conforme().
   ===================================================================== */

const NOTES = {
  A: 'Sans erreur',
  B: 'Erreur acceptable (minime)',
  C: 'Erreur majeure (risque de mise en danger)',
  D: 'Erreur grave (comportement dangereux)',
};

async function ouvrirPratique(stagiaireId) {
  const { data, error } = await sb.from('stagiaires')
    .select('*, stagiaire_symboles(symbole_code)').eq('id', stagiaireId).single();
  if (error) return erreurSupabase('Ouverture du stagiaire', error);
  S.stagiaire = data;
  S.ecran = 'pratique';
  ecranFormateur($('#ecran'));
}

async function rendrePratique(zone) {
  const st = S.stagiaire;
  zone.innerHTML = '<p class="chargement">Préparation des grilles…</p>';

  // Crée les épreuves manquantes (une par gabarit visé) et pré-remplit les grilles
  try { await rpc('preparer_pratiques', { p_stagiaire_id: st.id }); }
  catch (e) { return erreurSupabase('Préparation des épreuves pratiques', e); }

  const { data: epreuves, error } = await sb.from('epreuves_pratiques')
    .select(`*, gabarits(libelle, mises_en_situation_min, mises_en_situation_rattrapage,
               tableau_savoir_faire, competences),
             mises_en_situation(id, numero, intitule, commentaire, scenario_id,
               evaluations_savoir_faire(id, note, commentaire,
                 gabarit_savoir_faire(id, position, code, libelle)))`)
    .eq('stagiaire_id', st.id).order('gabarit_code');
  if (error) return erreurSupabase('Lecture des épreuves pratiques', error);

  const { data: scenarios } = await sb.from('scenarios_pratiques')
    .select('*').eq('actif', true);

  // Un titre dont la théorie a échoué n'a plus besoin d'être évalué en pratique
  // (sauf rattrapage théorique à venir) : la carte du titre passe en orange
  // plutôt qu'en rouge, pour signaler « optionnel » et non « à faire ».
  const { data: resultats } = await sb.from('resultats_symbole')
    .select('symbole_code, theorie_ok').eq('stagiaire_id', st.id);
  const theorieOkParSymbole = Object.fromEntries((resultats || []).map(r => [r.symbole_code, r.theorie_ok]));
  const symbolesStagiaire = (st.stagiaire_symboles || []).map(x => x.symbole_code);
  const theorieEchoueePourGabarit = gabaritCode => symbolesStagiaire.some(sym =>
    (S.referentiel.gabaritsParSymbole[sym] || []).includes(gabaritCode) && theorieOkParSymbole[sym] === false);

  zone.innerHTML = `
    <button class="lien" onclick="retour('session')">← Retour à la session</button>
    <div class="barre-actions">
      <h2>Évaluation pratique — ${esc(st.prenom)} ${esc(st.nom)}</h2>
      <button class="principal" onclick="genererTitrePdf('${st.id}')">🏅 Générer le titre</button>
    </div>
    <p class="aide">Barème normatif : <b>A</b> sans erreur · <b>B</b> erreur minime ·
       <b>C</b> erreur majeure · <b>D</b> erreur grave.
       Critère d'acceptation : <b>aucun D et un seul C au maximum par mise en situation</b>.</p>
    ${(epreuves || []).map(ep => carteEpreuve(ep, scenarios || [], theorieEchoueePourGabarit(ep.gabarit_code))).join('')}`;
}

function carteEpreuve(ep, scenarios, theorieEchouee) {
  const dispo = scenarios.filter(s => s.gabarit_code === ep.gabarit_code);
  const min = ep.gabarits.mises_en_situation_min;
  const rattrapage = ep.gabarits.mises_en_situation_rattrapage || 0;
  const mises = ep.mises_en_situation || [];
  const obligatoires = mises.filter(m => m.numero <= min);
  const obligatoiresConformes = obligatoires.length === min &&
    obligatoires.every(m => miseConforme(m));
  const total = mises.length;
  const peutAjouter = total < min + rattrapage;
  const badgeOrange = theorieEchouee && ep.reussie !== true;
  return `
    <section class="carte epreuve">
      <div class="entete-epreuve">
        <h3>${esc(ep.gabarits.libelle)}</h3>
        ${badgeOrange
          ? `<span class="etat avertissement" title="La théorie de ce titre a échoué : la pratique n'est pas nécessaire, sauf si un rattrapage théorique est prévu.">
              ⚠ Théorie non validée — pratique optionnelle</span>`
          : `<span class="etat ${ep.reussie === true ? 'ok' : ep.reussie === false ? 'ko' : 'neutre'}">
              ${ep.reussie === true ? 'Validée' : ep.reussie === false ? 'Non validée' : 'En cours'}</span>`}
      </div>
      <p class="aide">Compétences à évaluer :
        ${(ep.gabarits.competences || []).map(c => `<span class="puce">${esc(c)}</span>`).join(' ')}
        · ${min} mise(s) en situation obligatoire(s)${rattrapage
          ? ` + ${rattrapage} de rattrapage si échec` : ''}</p>

      ${mises.sort((a, b) => a.numero - b.numero)
        .map(m => grilleMise(m, dispo, m.numero <= min)).join('')}

      <div class="pied-epreuve">
        ${peutAjouter ? `<button class="lien" onclick="ajouterMise('${ep.id}', ${total + 1}, '${ep.gabarit_code}')">
          + Ajouter une mise en situation${total >= min ? ' de rattrapage' : ''}</button>`
          : `<span class="aide">Nombre maximal de mises en situation atteint (${min + rattrapage}).</span>`}
        <label class="plein">Observations générales
          <textarea rows="2" onchange="majObservations('${ep.id}', this.value)">${esc(ep.observations)}</textarea></label>
        <button class="principal" onclick="cloturerEpreuve('${ep.id}')">Valider cette épreuve</button>
      </div>
    </section>`;
}

function miseConforme(m) {
  const lignes = m.evaluations_savoir_faire || [];
  const nbC = lignes.filter(l => l.note === 'C').length;
  const nbD = lignes.filter(l => l.note === 'D').length;
  const complet = lignes.length > 0 && lignes.every(l => l.note);
  return complet && nbD === 0 && nbC <= 1;
}

function grilleMise(m, scenarios, obligatoire) {
  const lignes = (m.evaluations_savoir_faire || [])
    .sort((a, b) => a.gabarit_savoir_faire.position - b.gabarit_savoir_faire.position);
  const nbC = lignes.filter(l => l.note === 'C').length;
  const nbD = lignes.filter(l => l.note === 'D').length;
  const complet = lignes.every(l => l.note);
  const conforme = complet && nbD === 0 && nbC <= 1;

  return `
    <div class="mise ${complet ? (conforme ? 'conforme' : 'non-conforme') : ''}">
      <div class="entete-mise">
        <b>Mise en situation ${m.numero} <span class="puce">${obligatoire ? 'obligatoire' : 'rattrapage'}</span></b>
        <select onchange="appliquerScenario('${m.id}', this.value)">
          <option value="">— scénario libre —</option>
          ${scenarios.map(s => `<option value="${s.id}" ${s.id === m.scenario_id ? 'selected' : ''}>
            ${esc(s.intitule)}</option>`).join('')}
        </select>
        <span class="verdict">${complet
          ? (conforme ? '✔ conforme' : `✘ non conforme (${nbD} D, ${nbC} C)`)
          : 'à compléter'}</span>
      </div>
      <table class="tableau grille">
        <thead><tr><th>Savoir-faire évalué</th>
          ${Object.keys(NOTES).map(n => `<th title="${esc(NOTES[n])}">${n}</th>`).join('')}
          <th>Commentaire</th></tr></thead>
        <tbody>${lignes.map(l => `
          <tr>
            <td><span class="puce">${esc(l.gabarit_savoir_faire.code)}</span> ${esc(l.gabarit_savoir_faire.libelle)}</td>
            ${Object.keys(NOTES).map(n => `<td class="case-note ${n}">
              <input type="radio" name="n-${l.id}" value="${n}" ${l.note === n ? 'checked' : ''}
                title="${esc(NOTES[n])}" onchange="noter('${l.id}', '${n}')"></td>`).join('')}
            <td><input type="text" value="${esc(l.commentaire)}" placeholder="…"
              onchange="commenterLigne('${l.id}', this.value)"></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

async function noter(ligneId, note) {
  const { error } = await sb.from('evaluations_savoir_faire')
    .update({ note }).eq('id', ligneId);
  if (error) return erreurSupabase('Notation', error);
  rendrePratique($('#contenu'));
}

async function commenterLigne(ligneId, texte) {
  await sb.from('evaluations_savoir_faire').update({ commentaire: texte }).eq('id', ligneId);
}

async function majObservations(epreuveId, texte) {
  await sb.from('epreuves_pratiques').update({ observations: texte }).eq('id', epreuveId);
}

async function appliquerScenario(miseId, scenarioId) {
  const maj = { scenario_id: scenarioId || null };
  if (scenarioId) {
    const { data } = await sb.from('scenarios_pratiques').select('intitule').eq('id', scenarioId).single();
    if (data) maj.intitule = data.intitule;
  }
  const { error } = await sb.from('mises_en_situation').update(maj).eq('id', miseId);
  if (error) return erreurSupabase('Choix du scénario', error);
  rendrePratique($('#contenu'));
}

async function ajouterMise(epreuveId, numero, gabaritCode) {
  const { data, error } = await sb.from('mises_en_situation')
    .insert({ epreuve_id: epreuveId, numero, intitule: 'Mise en situation ' + numero })
    .select().single();
  if (error) return erreurSupabase('Ajout de la mise en situation', error);
  const lignes = S.referentiel.savoirFaire.filter(sf => sf.gabarit_code === gabaritCode);
  await sb.from('evaluations_savoir_faire')
    .insert(lignes.map(sf => ({ mise_en_situation_id: data.id, savoir_faire_id: sf.id })));
  rendrePratique($('#contenu'));
}

async function cloturerEpreuve(epreuveId) {
  try {
    const ok = await rpc('cloturer_pratique', { p_epreuve_id: epreuveId });
    toast(ok ? 'Épreuve pratique validée' : 'Épreuve pratique non validée', ok ? 'ok' : 'erreur');
    rendrePratique($('#contenu'));
  } catch (e) { erreurSupabase('Validation de l\'épreuve', e); }
}
