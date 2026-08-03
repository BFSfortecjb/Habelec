/* =====================================================================
   HE_app.js — écrans de l'espace formateur

   Sommaire :
     1. Connexion
     2. Coquille (en-tête + onglets)
     3. Onglet Sessions
     4. Détail d'une session : stagiaires, génération des QCM, suivi
     5. Import / export Excel de la liste des stagiaires
     6. Onglet Banque de questions (couverture, import GIFT, relecture)
     7. Onglet Scénarios pratiques
     8. Onglet Organisme
   ===================================================================== */

/* ====================== 1. Connexion ================================ */
function ecranConnexion(cible) {
  cible.innerHTML = `
    <div class="connexion">
      <h1>${esc(CONFIG.NOM_APPLICATION)}</h1>
      <p class="sous-titre">Évaluation et suivi — NF C18-510</p>
      ${S.accesRefuse ? `
      <div class="carte refus">
        <b>Accès refusé</b>
        <p>Ce compte est bien authentifié, mais il n'est pas autorisé dans
           Habelec. Chaque application BFS gère ses propres comptes :
           demande à l'administrateur d'Habelec de t'ajouter.</p>
      </div>` : ''}
      <form id="form-connexion" class="carte">
        <label>Adresse e-mail
          <input type="email" name="email" required autocomplete="username">
        </label>
        <label>Mot de passe
          <input type="password" name="mdp" required autocomplete="current-password">
        </label>
        <button class="principal" type="submit">Se connecter</button>
        <p class="aide">Les stagiaires n'ont pas de compte : ils utilisent le
           <a href="#stagiaire">lien de passation</a> et le code affiché en salle.</p>
      </form>
    </div>`;

  $('#form-connexion').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    try {
      await connexion(f.email.value.trim(), f.mdp.value);
      await chargerProfil();
      await chargerReferentiel();
      router();
    } catch (e) { erreurSupabase('Connexion', e); }
  });
}

/* ====================== 2. Coquille ================================= */
const ONGLETS = {
  sessions:  'Sessions',
  banque:    'Banque de questions',
  scenarios: 'Mises en situation',
  organisme: 'Organisme',
};

function ongletsVisibles() {
  const liste = Object.entries(ONGLETS);
  // L'onglet Organisme n'est utile qu'à l'administrateur
  return S.vision === 'admin' ? liste : liste.filter(([id]) => id !== 'organisme');
}

const RENDU = {
  sessions:  rendreSessions,
  session:   rendreDetailSession,
  banque:    rendreBanque,
  scenarios: rendreScenarios,
  organisme: rendreOrganisme,
  pratique:  rendrePratique,     // défini dans HE_pratique.js
};

function ecranFormateur(cible) {
  cible.innerHTML = `
    <header class="entete">
      <div class="titre">${esc(CONFIG.NOM_APPLICATION)}
        <span class="badge">${esc(S.organisme?.raison_sociale || '')}</span></div>
      <nav class="onglets">
        ${ongletsVisibles().map(([id, lib]) =>
          `<button data-onglet="${id}" class="${S.ecran === id ? 'actif' : ''}">${esc(lib)}</button>`).join('')}
      </nav>
      <div class="compte">
        <span>${esc(S.utilisateur.email)}</span>
        <button class="lien" onclick="deconnexion()" title="Se déconnecter">Déconnexion</button>
      </div>
    </header>
    <main id="contenu"></main>`;

  $$('.onglets button').forEach(b => b.addEventListener('click', () => {
    S.ecran = b.dataset.onglet; S.session = null; ecranFormateur(cible);
  }));

  (RENDU[S.ecran] || rendreSessions)($('#contenu'));
}

function retour(ecran) { S.ecran = ecran; ecranFormateur($('#ecran')); }

/* ====================== 3. Onglet Sessions ========================== */
async function rendreSessions(zone) {
  zone.innerHTML = '<p class="chargement">Chargement des sessions…</p>';
  const { data, error } = await sb.from('sessions_formation')
    .select('*, stagiaires(count)').order('date_debut', { ascending: false });
  if (error) return erreurSupabase('Lecture des sessions', error);

  zone.innerHTML = `
    <div class="barre-actions">
      <h2>Sessions de formation</h2>
      <button class="principal" onclick="nouvelleSession()">+ Nouvelle session</button>
    </div>
    <table class="tableau">
      <thead><tr><th>Intitulé</th><th>N° Galaxy</th><th>Entreprise</th><th>Début</th><th>Type</th>
        <th>Code d'accès</th><th>Statut</th><th>Stagiaires</th><th></th></tr></thead>
      <tbody>${(data || []).map(s => `
        <tr>
          <td><a href="#" onclick="ouvrirSession('${s.id}');return false">${esc(s.intitule)}</a></td>
          <td>${esc(s.numero_session_galaxy)}</td>
          <td>${esc(s.entreprise)}</td>
          <td>${dateFr(s.date_debut)}</td>
          <td>${s.type_formation === 'recyclage' ? 'Recyclage' : 'Initiale'}</td>
          <td><code class="code-acces">${esc(s.code_acces)}</code></td>
          <td><span class="etat ${s.statut}">${esc(s.statut.replace(/_/g, ' '))}</span></td>
          <td>${s.stagiaires?.[0]?.count ?? 0}</td>
          <td><button class="icone" title="Supprimer la session"
                onclick="supprimerSession('${s.id}')">🗑</button></td>
        </tr>`).join('') || '<tr><td colspan="9" class="vide">Aucune session pour le moment.</td></tr>'}
      </tbody>
    </table>`;
}

async function nouvelleSession() {
  // N° Galaxy demandé en premier et obligatoire : c'est la référence
  // administrative prioritaire, on redemande tant que le champ est vide.
  let numeroGalaxy = null;
  while (numeroGalaxy === null || numeroGalaxy.trim() === '') {
    numeroGalaxy = prompt('N° de session Galaxy (obligatoire) :', numeroGalaxy || '');
    if (numeroGalaxy === null) return; // annulé
  }
  const intitule = prompt('Intitulé de la session :', 'Habilitation électrique — ' + new Date().getFullYear());
  if (!intitule) return;
  const code = genererCodeAcces();
  const { error } = await sb.from('sessions_formation').insert({
    organisme_id: S.organisme.id, formateur_id: S.profil.id,
    intitule, numero_session_galaxy: numeroGalaxy.trim(), code_acces: code, statut: 'brouillon',
  });
  if (error) return erreurSupabase('Création de la session', error);
  toast('Session créée — code d\'accès ' + code);
  rendreSessions($('#contenu'));
}

async function modifierNumeroGalaxy() {
  const numeroGalaxy = prompt('N° de session Galaxy :', S.session.numero_session_galaxy || '');
  if (numeroGalaxy === null || numeroGalaxy.trim() === '') return;
  const { error } = await sb.from('sessions_formation')
    .update({ numero_session_galaxy: numeroGalaxy.trim() }).eq('id', S.session.id);
  if (error) return erreurSupabase('Modification du n° Galaxy', error);
  await ouvrirSession(S.session.id);
}

function genererCodeAcces() {
  // Sans caractères ambigus (0/O, 1/I) : le code est dicté à voix haute en salle
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join('');
}

async function supprimerSession(id) {
  if (!confirmer('Supprimer définitivement cette session et tous ses résultats ?')) return;
  const { error } = await sb.from('sessions_formation').delete().eq('id', id);
  if (error) return erreurSupabase('Suppression', error);
  toast('Session supprimée');
  rendreSessions($('#contenu'));
}

async function ouvrirSession(id) {
  const { data, error } = await sb.from('sessions_formation').select('*').eq('id', id).single();
  if (error) return erreurSupabase('Ouverture de la session', error);
  S.session = data; S.ecran = 'session';
  ecranFormateur($('#ecran'));
}

/* ============ 4. Détail d'une session : stagiaires et suivi ========= */
async function rendreDetailSession(zone) {
  const s = S.session;
  zone.innerHTML = '<p class="chargement">Chargement…</p>';

  const [{ data: stagiaires }, { data: suivi }] = await Promise.all([
    sb.from('stagiaires').select('*, stagiaire_symboles(symbole_code)')
      .eq('session_id', s.id).order('ordre').order('nom'),
    sb.from('v_suivi_session').select('*').eq('session_id', s.id),
  ]);
  const suiviPar = Object.fromEntries((suivi || []).map(x => [x.stagiaire_id, x]));
  // Code inclus dans le lien : le QR scanné saute la saisie manuelle du code.
  const lienStagiaire = location.origin + location.pathname
    + '#stagiaire?code=' + encodeURIComponent(s.code_acces);

  zone.innerHTML = `
    <button class="lien" onclick="retour('sessions')">← Toutes les sessions</button>
    <div class="barre-actions">
      <h2>${esc(s.intitule)}</h2>
      <div>
        <button onclick="ouvrirParametresSession()" title="Paramètres de l'évaluation">⚙ Paramètres</button>
        <button onclick="genererTousLesQcm()" title="Générer un sujet par stagiaire">🎲 Générer les QCM</button>
        ${s.statut !== 'cloturee' ? `<button class="principal" onclick="basculerOuverture()">
          ${s.statut === 'ouverte' ? '⏸ Fermer la passation' : '▶ Ouvrir la passation'}</button>` : ''}
        ${s.statut !== 'cloturee'
          ? `<button title="Supprime les infos personnelles des stagiaires (sauf nom/prénom), une fois tous les titres/avis générés"
                onclick="cloturerSession()">🔒 Clôturer la session</button>`
          : '<span class="etat cloturee">🔒 Session clôturée</span>'}
      </div>
    </div>

    <div class="carte info-passation">
      <div><b>Code à dicter en salle</b><div class="code-geant">${esc(s.code_acces)}</div></div>
      <div><b>Adresse de passation</b><div><code>${esc(lienStagiaire)}</code></div>
        <button class="lien" onclick="navigator.clipboard.writeText('${esc(lienStagiaire)}');toast('Lien copié')">Copier le lien</button></div>
      <div><b>QR code</b><div><canvas id="qr-passation"></canvas></div>
        <button class="lien" onclick="telechargerQrPassation()">Télécharger l'image</button></div>
      <div><b>N° de session Galaxy</b><div>${esc(s.numero_session_galaxy) || '<i>non renseigné</i>'}</div>
        <button class="lien" onclick="modifierNumeroGalaxy()">Modifier</button></div>
      <div><b>Règle de réussite</b>
        <div>${Math.round(s.seuil_global * 100)} % de bonnes réponses
          ${s.exiger_fondamentales ? '<br>+ 100 % des questions fondamentales' : ''}</div></div>
    </div>

    <div class="barre-actions">
      <h3>Stagiaires (${(stagiaires || []).length})</h3>
      <div>
        <button onclick="modeleExcelStagiaires()" title="Télécharger un modèle Excel">⬇ Modèle Excel</button>
        <label class="bouton-fichier" title="Importer une liste de stagiaires">⬆ Importer Excel
          <input type="file" accept=".xlsx,.xls,.csv" hidden onchange="importerStagiairesExcel(this)"></label>
        <button class="principal" onclick="nouveauStagiaire()">+ Ajouter</button>
      </div>
    </div>

    <table class="tableau">
      <thead><tr><th>Nom</th><th>Prénom</th><th>Fonction</th><th>Titres visés</th>
        <th>Domaines</th><th>Théorie</th><th>Pratique</th><th>Actions</th></tr></thead>
      <tbody>${(stagiaires || []).map(st => ligneStagiaire(st, suiviPar[st.id])).join('')
        || '<tr><td colspan="8" class="vide">Aucun stagiaire. Ajoute-les un par un ou importe un fichier Excel.</td></tr>'}
      </tbody>
    </table>`;

  QRCode.toCanvas($('#qr-passation'), lienStagiaire, { width: 140, margin: 1 },
    err => { if (err) DEBUG.erreur('QR code', err.message); });
}

function telechargerQrPassation() {
  const canvas = $('#qr-passation');
  const lien = document.createElement('a');
  lien.download = 'qr-passation-' + S.session.code_acces + '.png';
  lien.href = canvas.toDataURL('image/png');
  lien.click();
}

function ligneStagiaire(st, suivi) {
  const symb = (st.stagiaire_symboles || []).map(x => libelleSymbole(x.symbole_code));
  let theorie = '<span class="etat neutre">à générer</span>';
  if (suivi?.statut_theorie === 'corrigee') {
    theorie = `<span class="etat ${suivi.theorie_reussie ? 'ok' : 'ko'}">`
      + `${suivi.score_brut}/${suivi.score_total} — ${Math.round(suivi.taux * 100)} %`
      + `${suivi.fondamentales_ok === false ? ' ⚠ fondamentale ratée' : ''}</span>`;
  } else if (suivi?.statut_theorie === 'en_cours') {
    theorie = `<span class="etat encours">en cours ${suivi.nb_repondues}/${suivi.score_total || '?'}</span>`;
  } else if (suivi?.statut_theorie) {
    theorie = '<span class="etat neutre">prêt</span>';
  }
  const prat = suivi && suivi.nb_pratiques > 0
    ? `<span class="etat ${suivi.nb_pratiques_ok === suivi.nb_pratiques ? 'ok' : 'neutre'}">`
      + `${suivi.nb_pratiques_ok}/${suivi.nb_pratiques} validées</span>`
    : '<span class="etat neutre">—</span>';

  return `<tr>
    <td>${esc(st.nom)}</td><td>${esc(st.prenom)}</td><td>${esc(st.fonction)}</td>
    <td>${symb.map(x => `<span class="puce">${esc(x)}</span>`).join(' ') || '<i>aucun</i>'}</td>
    <td>${(st.domaines || []).join(', ')}</td>
    <td>${theorie}</td><td>${prat}</td>
    <td class="actions">
      <button class="icone" title="Modifier le stagiaire et ses titres" onclick="editerStagiaire('${st.id}')">✎</button>
      <button class="icone" title="Évaluation pratique" onclick="ouvrirPratique('${st.id}')">🔧</button>
      <button class="icone" title="Voir la copie corrigée" onclick="voirCopie('${st.id}')">📄</button>
      <button class="icone" title="Générer le titre d'habilitation (PDF)" onclick="genererTitrePdf('${st.id}')">🏅</button>
      <button class="icone" title="Supprimer" onclick="supprimerStagiaire('${st.id}')">🗑</button>
    </td></tr>`;
}

async function basculerOuverture() {
  const nouveau = S.session.statut === 'ouverte' ? 'theorie_close' : 'ouverte';
  const { error } = await sb.from('sessions_formation')
    .update({ statut: nouveau }).eq('id', S.session.id);
  if (error) return erreurSupabase('Changement de statut', error);
  S.session.statut = nouveau;
  toast(nouveau === 'ouverte' ? 'Passation ouverte' : 'Passation fermée');
  rendreDetailSession($('#contenu'));
}

/** Purge les infos personnelles des stagiaires (sauf nom/prénom). Irréversible :
 *  refusé côté base tant qu'un avis est encore en attente pour un stagiaire. */
async function cloturerSession() {
  if (!confirmer('Clôturer définitivement cette session ?\n'
    + 'Toutes les infos personnelles des stagiaires (date de naissance, entreprise, '
    + 'coordonnées...) seront supprimées, sauf nom et prénom. Action irréversible.')) return;
  try {
    await rpc('cloturer_session', { p_session_id: S.session.id });
    toast('Session clôturée');
    await ouvrirSession(S.session.id);
  } catch (e) {
    erreurSupabase('Clôture de la session', e);
  }
}

async function ouvrirParametresSession() {
  const seuil = prompt('Seuil de réussite en % (sur l\'ensemble des questions) :',
    Math.round(S.session.seuil_global * 100));
  if (seuil === null) return;
  const duree = prompt('Durée maximale du QCM en minutes (vide = pas de limite) :',
    S.session.duree_max_min || '');
  const { error } = await sb.from('sessions_formation').update({
    seuil_global: Math.max(1, Math.min(100, parseInt(seuil, 10) || 70)) / 100,
    duree_max_min: duree ? parseInt(duree, 10) : null,
  }).eq('id', S.session.id);
  if (error) return erreurSupabase('Paramètres', error);
  await ouvrirSession(S.session.id);
}

/** Génère un sujet individuel pour chaque stagiaire de la session. */
async function genererTousLesQcm() {
  if (!confirmer('Générer (ou régénérer) un sujet pour chaque stagiaire ?\n'
    + 'Les sujets déjà commencés ne sont pas touchés.')) return;
  try {
    const res = await rpc('generer_qcm_session', { p_session_id: S.session.id });
    toast(`${res.length} sujet(s) généré(s)`);
    rendreDetailSession($('#contenu'));
  } catch (e) {
    // Le message d'erreur SQL indique précisément la thématique en manque
    erreurSupabase('Génération des QCM', e);
  }
}

/* ---------------------- fiche stagiaire ---------------------------- */
async function nouveauStagiaire() { await editerStagiaire(null); }

async function editerStagiaire(id) {
  let st = { nom: '', prenom: '', fonction: '', affectation: '', domaines: [], symboles: [] };
  if (id) {
    const { data } = await sb.from('stagiaires')
      .select('*, stagiaire_symboles(symbole_code)').eq('id', id).single();
    st = { ...data, symboles: (data.stagiaire_symboles || []).map(x => x.symbole_code) };
  }

  const parRole = {};
  S.referentiel.symboles.forEach(sy => (parRole[sy.role] ||= []).push(sy));

  ouvrirModale(`${id ? 'Modifier' : 'Ajouter'} un stagiaire`, `
    <form id="form-stagiaire" class="formulaire">
      <div class="grille-2">
        <label>Nom <input name="nom" required value="${esc(st.nom)}"></label>
        <label>Prénom <input name="prenom" required value="${esc(st.prenom)}"></label>
        <label>Fonction <input name="fonction" value="${esc(st.fonction)}"></label>
        <label>Affectation <input name="affectation" value="${esc(st.affectation)}"></label>
      </div>
      <fieldset><legend>Domaines de tension</legend>
        ${['TBT', 'BT', 'HTA', 'HTB'].map(d => `<label class="case">
          <input type="checkbox" name="domaine" value="${d}"
            ${st.domaines?.includes(d) ? 'checked' : ''}> ${d}</label>`).join('')}
      </fieldset>
      <fieldset><legend>Titres d'habilitation visés</legend>
        ${Object.entries(parRole).map(([role, liste]) => `
          <div class="groupe-symboles"><b>${esc(role)}</b>
            ${liste.map(sy => `<label class="case">
              <input type="checkbox" name="symbole" value="${sy.code}"
                ${st.symboles?.includes(sy.code) ? 'checked' : ''}> ${esc(sy.libelle)}</label>`).join('')}
          </div>`).join('')}
      </fieldset>
      <div id="apercu-plan" class="apercu"></div>
      <div class="pied-modale">
        <button type="button" onclick="fermerModale()">Annuler</button>
        <button type="submit" class="principal">Enregistrer</button>
      </div>
    </form>`);

  // Aperçu en direct du nombre de questions que produira la sélection
  const majApercu = () => {
    const choisis = $$('#form-stagiaire input[name=symbole]:checked').map(i => i.value);
    $('#apercu-plan').innerHTML = apercuPlanTirage(choisis);
  };
  $$('#form-stagiaire input[name=symbole]').forEach(i => i.addEventListener('change', majApercu));
  majApercu();

  $('#form-stagiaire').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const donnees = {
      session_id: S.session.id,
      nom: f.nom.value.trim().toUpperCase(),
      prenom: f.prenom.value.trim(),
      fonction: f.fonction.value.trim(),
      affectation: f.affectation.value.trim(),
      domaines: $$('#form-stagiaire input[name=domaine]:checked').map(i => i.value),
    };
    const symboles = $$('#form-stagiaire input[name=symbole]:checked').map(i => i.value);
    try {
      let stagiaireId = id;
      if (id) {
        const { error } = await sb.from('stagiaires').update(donnees).eq('id', id);
        if (error) throw error;
        await sb.from('stagiaire_symboles').delete().eq('stagiaire_id', id);
      } else {
        const { data, error } = await sb.from('stagiaires').insert(donnees).select().single();
        if (error) throw error;
        stagiaireId = data.id;
      }
      if (symboles.length) {
        const { error } = await sb.from('stagiaire_symboles')
          .insert(symboles.map(c => ({ stagiaire_id: stagiaireId, symbole_code: c })));
        if (error) throw error;
      }
      fermerModale();
      toast('Stagiaire enregistré');
      rendreDetailSession($('#contenu'));
    } catch (e) { erreurSupabase('Enregistrement du stagiaire', e); }
  });
}

/**
 * Aperçu du sujet que produira la sélection de titres.
 * Applique la même règle que la fonction SQL plan_tirage : pour une
 * thématique présente dans plusieurs gabarits, on retient le quota le plus
 * exigeant (max), pas la somme — le tronc commun n'est donc posé qu'une fois.
 */
function apercuPlanTirage(symboles) {
  if (!symboles.length) return '<i>Sélectionne au moins un titre visé.</i>';

  const gabarits = new Set();
  symboles.forEach(code =>
    (S.referentiel.gabaritsParSymbole[code] || []).forEach(g => gabarits.add(g)));

  const plan = {};
  (S.referentiel.quotas || [])
    .filter(q => gabarits.has(q.gabarit_code) && q.nb > 0)
    .forEach(q => {
      const p = plan[q.theme_code] ||= { nb: 0, fond: 0 };
      p.nb = Math.max(p.nb, q.nb);
      p.fond = Math.max(p.fond, q.nb_fondamentales);
    });

  const total = Object.values(plan).reduce((a, p) => a + p.nb, 0);
  const totalFond = Object.values(plan).reduce((a, p) => a + p.fond, 0);
  const somme = [...gabarits].reduce((a, g) =>
    a + (S.referentiel.gabarits.find(x => x.code === g)?.total_min || 0), 0);

  return `<b>Sujet prévu : ${total} questions</b> dont ${totalFond} fondamentale(s),
    sur ${gabarits.size} gabarit(s) d'évaluation.
    ${total < somme ? `<br><i>${somme - total} question(s) économisée(s) par le
      dédoublonnage du tronc commun.</i>` : ''}
    <ul class="plan">${Object.entries(plan).sort()
      .map(([t, p]) => `<li>${esc(libelleTheme(t))} : ${p.nb}
        ${p.fond ? `<span class="puce fond">dont ${p.fond} fondamentale(s)</span>` : ''}</li>`).join('')}
    </ul>`;
}

async function supprimerStagiaire(id) {
  if (!confirmer('Supprimer ce stagiaire et ses résultats ?')) return;
  const { error } = await sb.from('stagiaires').delete().eq('id', id);
  if (error) return erreurSupabase('Suppression', error);
  rendreDetailSession($('#contenu'));
}

/* ------------------- copie corrigée d'un stagiaire ----------------- */
async function voirCopie(stagiaireId) {
  const { data: ep } = await sb.from('epreuves_theoriques')
    .select('*').eq('stagiaire_id', stagiaireId).maybeSingle();
  if (!ep) return toast('Aucun sujet généré pour ce stagiaire', 'erreur');

  const { data: qs } = await sb.from('epreuve_questions')
    .select('*, questions(enonce, explication, question_reponses(id, libelle, correcte)), reponses_stagiaire(reponses_ids, correcte)')
    .eq('epreuve_id', ep.id).order('position');

  ouvrirModale('Copie corrigée', `
    <div class="bilan ${ep.reussie ? 'ok' : 'ko'}">
      ${ep.score_brut}/${ep.score_total} — ${Math.round((ep.taux || 0) * 100)} %
      · questions fondamentales : ${ep.fondamentales_ok ? 'toutes justes' : 'au moins une ratée'}
      · <b>${ep.reussie ? 'ADMIS' : 'NON ADMIS'}</b>
    </div>
    <ol class="copie">${(qs || []).map(q => {
      const donnees = q.reponses_stagiaire?.reponses_ids || [];
      const juste = q.reponses_stagiaire?.correcte;
      return `<li class="${juste ? 'juste' : 'faux'}">
        <div class="enonce">${esc(q.questions.enonce)}
          ${q.fondamentale ? '<span class="puce fond">fondamentale</span>' : ''}</div>
        <ul>${q.questions.question_reponses.map(r => `
          <li class="${r.correcte ? 'bonne' : ''} ${donnees.includes(r.id) ? 'cochee' : ''}">
            ${donnees.includes(r.id) ? '☑' : '☐'} ${esc(r.libelle)}</li>`).join('')}</ul>
        ${q.questions.explication ? `<p class="explication">${esc(q.questions.explication)}</p>` : ''}
      </li>`;
    }).join('')}</ol>
    <div class="pied-modale"><button onclick="fermerModale()">Fermer</button></div>`);
}

/* ============ 5. Import / export Excel des stagiaires =============== */
const COLONNES_STAGIAIRE = ['Nom', 'Prenom', 'Fonction', 'Affectation', 'Domaines'];

function modeleExcelStagiaires() {
  const symboles = S.referentiel.symboles.map(s => s.libelle);
  const entetes = [...COLONNES_STAGIAIRE, ...symboles];
  const exemple = ['DUPONT', 'Jean', 'Électricien', 'Atelier maintenance', 'TBT, BT',
    ...symboles.map(s => (s === 'B1V' || s === 'BR') ? 'x' : '')];
  const ws = XLSX.utils.aoa_to_sheet([entetes, exemple]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stagiaires');
  XLSX.writeFile(wb, 'modele_stagiaires.xlsx');
  toast('Modèle téléchargé — coche les titres avec un « x »');
}

/** Normalise un en-tête : minuscules, sans accents, sans espaces. */
function cleEntete(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function importerStagiairesExcel(input) {
  const fichier = input.files?.[0];
  if (!fichier) return;
  try {
    const buf = await fichier.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const lignes = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!lignes.length) return toast('Fichier vide', 'erreur');

    // Correspondance des colonnes par préfixe normalisé (tolère les variantes)
    const symbolesParCle = {};
    S.referentiel.symboles.forEach(s => { symbolesParCle[cleEntete(s.libelle)] = s.code; });

    let creees = 0, ignorees = 0;
    for (const ligne of lignes) {
      const val = nom => {
        const k = Object.keys(ligne).find(x => cleEntete(x).startsWith(cleEntete(nom)));
        return k ? String(ligne[k]).trim() : '';
      };
      const nom = val('Nom'), prenom = val('Prenom');
      if (!nom && !prenom) { ignorees++; continue; }

      const domaines = val('Domaines').split(/[,;/ ]+/)
        .map(d => d.trim().toUpperCase()).filter(d => ['TBT', 'BT', 'HTA', 'HTB'].includes(d));

      const { data, error } = await sb.from('stagiaires').insert({
        session_id: S.session.id, nom: nom.toUpperCase(), prenom,
        fonction: val('Fonction'), affectation: val('Affectation'), domaines,
      }).select().single();
      if (error) { DEBUG.erreur('Import ligne', error.message); ignorees++; continue; }

      const coches = [];
      Object.entries(ligne).forEach(([col, v]) => {
        const code = symbolesParCle[cleEntete(col)];
        if (code && String(v).trim() && !/^(0|non|false)$/i.test(String(v).trim())) coches.push(code);
      });
      if (coches.length) {
        await sb.from('stagiaire_symboles')
          .insert(coches.map(c => ({ stagiaire_id: data.id, symbole_code: c })));
      }
      creees++;
    }
    toast(`${creees} stagiaire(s) importé(s)${ignorees ? `, ${ignorees} ligne(s) ignorée(s)` : ''}`);
    input.value = '';
    rendreDetailSession($('#contenu'));
  } catch (e) { erreurSupabase('Import Excel', e); }
}

/* ============ 6. Onglet Banque de questions ======================== */
async function rendreBanque(zone) {
  zone.innerHTML = '<p class="chargement">Analyse de la banque…</p>';
  const [{ data: couverture }, { data: compte }, { data: aValider }] = await Promise.all([
    sb.from('v_couverture_banque').select('*').order('gabarit_code').order('theme_code'),
    sb.from('questions').select('theme_code, fondamentale, active'),
    sb.from('questions').select('id', { count: 'exact', head: true }).eq('a_valider', true),
  ]);

  const parTheme = {};
  (compte || []).filter(q => q.active).forEach(q => {
    parTheme[q.theme_code] ||= { total: 0, fond: 0 };
    parTheme[q.theme_code].total++;
    if (q.fondamentale) parTheme[q.theme_code].fond++;
  });

  const manques = (couverture || []).filter(c => !c.suffisant);
  const gabarits = [...new Set((couverture || []).map(c => c.gabarit_code))];

  zone.innerHTML = `
    <div class="barre-actions">
      <h2>Banque de questions</h2>
      <div>
        <label class="bouton-fichier" title="Importer un fichier GIFT (export Moodle)">⬆ Importer GIFT
          <input type="file" accept=".gift,.txt" hidden onchange="importerGift(this)"></label>
        <button onclick="listerAValider()">Questions à relire</button>
        <button class="principal" onclick="editerQuestion(null)">+ Nouvelle question</button>
      </div>
    </div>

    <div class="carte ${manques.length ? 'alerte' : 'succes'}">
      ${manques.length
        ? `<b>${manques.length} manque(s) empêchent de générer certains titres.</b>
           <ul>${manques.map(m => `<li>${esc(m.gabarit)} — ${esc(m.theme)} :
             ${m.disponibles}/${m.requis} question(s), ${m.disponibles_fondamentales}/${m.requis_fondamentales} fondamentale(s)</li>`).join('')}</ul>`
        : `<b>Couverture complète.</b> Les ${gabarits.length} évaluations de l'Annexe D.3
           peuvent être générées dans les règles.`}
    </div>

    <h3>Questions disponibles par thématique</h3>
    <table class="tableau">
      <thead><tr><th>Thématique</th><th>Questions</th><th>dont fondamentales</th><th></th></tr></thead>
      <tbody>${S.referentiel.themes.map(t => {
        const c = parTheme[t.code] || { total: 0, fond: 0 };
        return `<tr>
          <td>${esc(t.libelle)} <code>${esc(t.code)}</code></td>
          <td>${c.total}</td><td>${c.fond}</td>
          <td><button class="lien" onclick="listerQuestions('${t.code}')">Voir</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

async function listerQuestions(themeCode) {
  const { data } = await sb.from('questions')
    .select('*, question_reponses(id, libelle, correcte, position)')
    .eq('theme_code', themeCode).order('cree_le');
  ouvrirModale(libelleTheme(themeCode), `
    <ol class="copie">${(data || []).map(q => `
      <li>
        <div class="enonce">${esc(q.enonce)}
          ${q.fondamentale ? '<span class="puce fond">fondamentale</span>' : ''}
          ${q.a_valider ? '<span class="puce alerte">à relire</span>' : ''}
          ${!q.active ? '<span class="puce">désactivée</span>' : ''}
          <button class="icone" title="Modifier" onclick="editerQuestion('${q.id}')">✎</button>
        </div>
        <ul>${(q.question_reponses || []).sort((a, b) => a.position - b.position)
          .map(r => `<li class="${r.correcte ? 'bonne' : ''}">${r.correcte ? '✔' : '·'} ${esc(r.libelle)}</li>`).join('')}</ul>
      </li>`).join('') || '<i>Aucune question dans cette thématique.</i>'}</ol>
    <div class="pied-modale"><button onclick="fermerModale()">Fermer</button></div>`);
}

async function listerAValider() {
  const { data } = await sb.from('questions').select('*').eq('a_valider', true).order('theme_code');
  if (!data?.length) return toast('Aucune question en attente de relecture');
  ouvrirModale('Questions classées automatiquement', `
    <p class="aide">Ces questions viennent de l'import Moodle. Leur thématique a été
       devinée à partir du texte : vérifie-la, marque-la « fondamentale » si besoin,
       puis valide.</p>
    <table class="tableau"><thead><tr><th>Énoncé</th><th>Thématique</th><th></th></tr></thead>
      <tbody>${data.map(q => `<tr>
        <td>${esc(q.enonce.slice(0, 120))}</td>
        <td>${esc(libelleTheme(q.theme_code))}</td>
        <td><button class="lien" onclick="editerQuestion('${q.id}')">Relire</button></td>
      </tr>`).join('')}</tbody></table>
    <div class="pied-modale"><button onclick="fermerModale()">Fermer</button></div>`);
}

async function editerQuestion(id) {
  let q = { theme_code: S.referentiel.themes[0]?.code, enonce: '', explication: '',
            fondamentale: false, active: true, reponses: [{ libelle: '', correcte: true }, { libelle: '', correcte: false }] };
  if (id) {
    const { data } = await sb.from('questions')
      .select('*, question_reponses(id, libelle, correcte, position)').eq('id', id).single();
    q = { ...data, reponses: (data.question_reponses || []).sort((a, b) => a.position - b.position) };
  }

  ouvrirModale(id ? 'Modifier la question' : 'Nouvelle question', `
    <form id="form-question" class="formulaire">
      <label>Thématique
        <select name="theme">${S.referentiel.themes.map(t =>
          `<option value="${t.code}" ${t.code === q.theme_code ? 'selected' : ''}>${esc(t.libelle)}</option>`).join('')}
        </select></label>
      <label>Énoncé <textarea name="enonce" rows="2" required>${esc(q.enonce)}</textarea></label>
      <label>Explication affichée à la correction (facultatif)
        <textarea name="explication" rows="2">${esc(q.explication)}</textarea></label>
      <label class="case"><input type="checkbox" name="fondamentale" ${q.fondamentale ? 'checked' : ''}>
        Question fondamentale (son échec invalide le titre)</label>
      <label class="case"><input type="checkbox" name="active" ${q.active !== false ? 'checked' : ''}>
        Question active (utilisable dans les tirages)</label>
      <fieldset><legend>Propositions — coche celles qui sont justes</legend>
        <div id="reponses">${q.reponses.map((r, i) => ligneReponse(r, i)).join('')}</div>
        <button type="button" class="lien" onclick="ajouterReponse()">+ Ajouter une proposition</button>
      </fieldset>
      <div class="pied-modale">
        <button type="button" onclick="fermerModale()">Annuler</button>
        <button type="submit" class="principal">Enregistrer</button>
      </div>
    </form>`);

  $('#form-question').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const reponses = $$('#reponses .ligne-reponse').map((d, i) => ({
      libelle: d.querySelector('input[type=text]').value.trim(),
      correcte: d.querySelector('input[type=checkbox]').checked,
      position: i,
    })).filter(r => r.libelle);

    if (reponses.length < 2) return toast('Il faut au moins deux propositions', 'erreur');
    if (!reponses.some(r => r.correcte)) return toast('Il faut au moins une bonne réponse', 'erreur');

    const donnees = {
      theme_code: f.theme.value,
      enonce: f.enonce.value.trim(),
      explication: f.explication.value.trim() || null,
      fondamentale: f.fondamentale.checked,
      active: f.active.checked,
      choix_multiple: reponses.filter(r => r.correcte).length > 1,
      a_valider: false,
      origine: id ? undefined : 'saisie',
      maj_le: new Date().toISOString(),
    };
    try {
      let qid = id;
      if (id) {
        const { error } = await sb.from('questions').update(donnees).eq('id', id);
        if (error) throw error;
        await sb.from('question_reponses').delete().eq('question_id', id);
      } else {
        const { data, error } = await sb.from('questions').insert(donnees).select().single();
        if (error) throw error;
        qid = data.id;
      }
      const { error } = await sb.from('question_reponses')
        .insert(reponses.map(r => ({ ...r, question_id: qid })));
      if (error) throw error;
      fermerModale();
      toast('Question enregistrée');
      rendreBanque($('#contenu'));
    } catch (e) { erreurSupabase('Enregistrement de la question', e); }
  });
}

function ligneReponse(r = { libelle: '', correcte: false }) {
  return `<div class="ligne-reponse">
    <input type="checkbox" ${r.correcte ? 'checked' : ''} title="Réponse juste">
    <input type="text" value="${esc(r.libelle)}" placeholder="Libellé de la proposition">
    <button type="button" class="icone" title="Retirer"
      onclick="this.parentElement.remove()">✕</button></div>`;
}
function ajouterReponse() { $('#reponses').insertAdjacentHTML('beforeend', ligneReponse()); }

/* ---------------------- import GIFT (Moodle) ----------------------- */
/**
 * Lit un export GIFT et crée les questions correspondantes.
 * Format reconnu : ::Nom:: Énoncé { =bonne ~mauvaise } avec $CATEGORY.
 */
async function importerGift(input) {
  const fichier = input.files?.[0];
  if (!fichier) return;
  const texte = await fichier.text();
  const questions = analyserGift(texte);
  if (!questions.length) return toast('Aucune question reconnue dans ce fichier', 'erreur');

  const theme = prompt(
    'Thématique à affecter à ces ' + questions.length + ' question(s) :\n\n'
    + S.referentiel.themes.map(t => t.code + ' — ' + t.libelle).join('\n'),
    S.referentiel.themes[0]?.code);
  if (!theme || !S.referentiel.themes.some(t => t.code === theme)) {
    return toast('Code de thématique inconnu', 'erreur');
  }

  let ok = 0;
  for (const q of questions) {
    const { data, error } = await sb.from('questions').insert({
      theme_code: theme, enonce: q.enonce, origine: 'gift',
      reference_ext: 'gift:' + q.nom, a_valider: true,
      choix_multiple: q.reponses.filter(r => r.correcte).length > 1,
    }).select().single();
    if (error) { DEBUG.erreur('GIFT', error.message); continue; }
    await sb.from('question_reponses').insert(
      q.reponses.map((r, i) => ({ question_id: data.id, libelle: r.libelle, correcte: r.correcte, position: i })));
    ok++;
  }
  input.value = '';
  toast(`${ok} question(s) importée(s) — à relire dans « Questions à relire »`);
  rendreBanque($('#contenu'));
}

function analyserGift(texte) {
  const out = [];
  const bloc = /::([^:]+)::\s*([\s\S]*?)\{([\s\S]*?)\}/g;
  let m;
  while ((m = bloc.exec(texte)) !== null) {
    const [, nom, enonce, corps] = m;
    const reponses = [];
    corps.split(/\n/).forEach(l => {
      const t = l.trim();
      if (t.startsWith('=')) reponses.push({ libelle: t.slice(1).trim(), correcte: true });
      else if (t.startsWith('~')) reponses.push({ libelle: t.replace(/^~(%-?\d+%)?/, '').trim(), correcte: false });
    });
    if (reponses.length >= 2 && reponses.some(r => r.correcte)) {
      out.push({ nom: nom.trim(), enonce: enonce.trim().replace(/\s+/g, ' '), reponses });
    }
  }
  return out;
}

/* ============ 7. Onglet Mises en situation ========================== */
async function rendreScenarios(zone) {
  zone.innerHTML = '<p class="chargement">Chargement…</p>';
  const { data } = await sb.from('scenarios_pratiques').select('*').order('gabarit_code');
  const parGabarit = {};
  (data || []).forEach(s => (parGabarit[s.gabarit_code] ||= []).push(s));

  zone.innerHTML = `
    <div class="barre-actions"><h2>Mises en situation pratiques</h2></div>
    <p class="aide">Ces scénarios servent de trame aux épreuves pratiques. Le barème
       appliqué est celui de la norme : A sans erreur, B erreur minime, C erreur majeure,
       D erreur grave — <b>aucun D et un seul C au maximum par mise en situation</b>.</p>
    ${S.referentiel.gabarits.map(g => `
      <details ${parGabarit[g.code]?.length ? '' : 'class="vide"'}>
        <summary>${esc(g.libelle)} <span class="puce">${parGabarit[g.code]?.length || 0} scénario(s)</span>
          <span class="puce">${g.mises_en_situation_min} situation(s) minimum</span></summary>
        <table class="tableau"><thead><tr><th>Intitulé</th><th>Contexte</th><th>Aléa</th>
          <th>Attendus</th><th>Motif d'arrêt</th></tr></thead>
          <tbody>${(parGabarit[g.code] || []).map(s => `<tr>
            <td>${esc(s.intitule)}</td><td>${esc(s.contexte_technique)}</td>
            <td>${esc(s.probleme_ou_alea)}</td><td>${esc(s.attendus_principaux)}</td>
            <td>${esc(s.motif_arret_obligatoire)}</td></tr>`).join('')
            || '<tr><td colspan="5" class="vide">Aucun scénario enregistré — la grille normative reste utilisable telle quelle.</td></tr>'}
          </tbody></table>
        <h4>Savoir-faire évalués (tableau ${esc(g.tableau_savoir_faire || '')})</h4>
        <ol>${S.referentiel.savoirFaire.filter(sf => sf.gabarit_code === g.code)
          .map(sf => `<li>${esc(sf.libelle)}</li>`).join('')}</ol>
      </details>`).join('')}`;
}

/* ============ 8. Onglet Organisme =================================== */
async function rendreOrganisme(zone) {
  const o = S.organisme || {};
  zone.innerHTML = `
    <div class="barre-actions"><h2>Organisme</h2></div>
    <form id="form-organisme" class="formulaire carte">
      <div class="grille-2">
        <label>Raison sociale <input name="raison_sociale" required value="${esc(o.raison_sociale)}"></label>
        <label>Adresse <input name="adresse" value="${esc(o.adresse)}"></label>
        <label>Nom du signataire <input name="signataire_nom" value="${esc(o.signataire_nom)}"></label>
        <label>Fonction du signataire <input name="signataire_fonction" value="${esc(o.signataire_fonction)}"></label>
        <label>Validité des titres (années)
          <input name="validite_annees" type="number" min="1" max="5" value="${o.validite_annees || 3}"></label>
      </div>
      <fieldset><legend>Signature de l'employeur (apposée sur les titres)</legend>
        ${widgetSignature('signature-organisme', o.signature_data)}
      </fieldset>
      <button class="principal" type="submit">Enregistrer</button>
    </form>`;

  activerSignature('signature-organisme');
  $('#form-organisme').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const { error } = await sb.from('organismes').update({
      raison_sociale: f.raison_sociale.value.trim(),
      adresse: f.adresse.value.trim(),
      signataire_nom: f.signataire_nom.value.trim(),
      signataire_fonction: f.signataire_fonction.value.trim(),
      validite_annees: parseInt(f.validite_annees.value, 10) || 3,
      signature_data: lireSignature('signature-organisme'),
    }).eq('id', o.id);
    if (error) return erreurSupabase('Enregistrement', error);
    toast('Organisme enregistré');
    await chargerProfil();
  });
}

/* ---------------- widget de signature manuscrite ------------------- */
function widgetSignature(id, valeur) {
  return `<div class="signature" id="${id}">
    <canvas width="480" height="150" ${valeur ? `data-initial="${esc(valeur)}"` : ''}></canvas>
    <button type="button" class="lien" onclick="effacerSignature('${id}')">Effacer</button>
  </div>`;
}

function activerSignature(id) {
  const zone = document.getElementById(id);
  if (!zone) return;
  const c = zone.querySelector('canvas');
  const ctx = c.getContext('2d');
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#123';
  if (c.dataset.initial) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = c.dataset.initial;
  }
  let trace = false;
  const pos = e => {
    const r = c.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return [(p.clientX - r.left) * c.width / r.width, (p.clientY - r.top) * c.height / r.height];
  };
  const debut = e => { trace = true; ctx.beginPath(); ctx.moveTo(...pos(e)); e.preventDefault(); };
  const bouge = e => { if (!trace) return; ctx.lineTo(...pos(e)); ctx.stroke(); e.preventDefault(); };
  const fin = () => { trace = false; };
  ['mousedown', 'touchstart'].forEach(ev => c.addEventListener(ev, debut));
  ['mousemove', 'touchmove'].forEach(ev => c.addEventListener(ev, bouge));
  ['mouseup', 'mouseleave', 'touchend'].forEach(ev => c.addEventListener(ev, fin));
}

function effacerSignature(id) {
  const c = document.querySelector('#' + id + ' canvas');
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

function lireSignature(id) {
  const c = document.querySelector('#' + id + ' canvas');
  if (!c) return null;
  // Canvas vierge => on ne stocke rien
  const vide = document.createElement('canvas');
  vide.width = c.width; vide.height = c.height;
  return c.toDataURL() === vide.toDataURL() ? null : c.toDataURL('image/png');
}

/* ------------------------- modale générique ------------------------ */
function ouvrirModale(titre, contenuHtml) {
  fermerModale();
  const d = document.createElement('div');
  d.className = 'modale-fond';
  d.id = 'modale';
  d.innerHTML = `<div class="modale">
    <div class="entete-modale"><h3>${esc(titre)}</h3>
      <button class="icone" onclick="fermerModale()" title="Fermer">✕</button></div>
    <div class="corps-modale">${contenuHtml}</div></div>`;
  d.addEventListener('click', e => { if (e.target === d) fermerModale(); });
  document.body.appendChild(d);
}
function fermerModale() { document.getElementById('modale')?.remove(); }
