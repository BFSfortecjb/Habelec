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
     9. Onglet Comptes
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
           <a href="#stagiaire">lien de connexion stagiaire</a> et le code affiché en salle.</p>
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
  sessions:      'Sessions',
  banque:        'Banque de questions',
  scenarios:     'Mises en situation',
  titres:        'Titres',
  verification:  'Vérification',
  organisme:     'Organisme',
  comptes:       'Comptes',
  moncompte:     'Mon compte',
};

// Onglets réservés à l'administrateur (réglages qui touchent tous les organismes
// ou tous les stagiaires, pas seulement l'organisme courant)
const ONGLETS_ADMIN = new Set(['titres', 'verification', 'organisme', 'comptes']);

function ongletsVisibles() {
  const liste = Object.entries(ONGLETS);
  return S.vision === 'admin' ? liste : liste.filter(([id]) => !ONGLETS_ADMIN.has(id));
}

const RENDU = {
  sessions:     rendreSessions,
  session:      rendreDetailSession,
  banque:       rendreBanque,
  scenarios:    rendreScenarios,
  titres:       rendreTitres,
  verification: rendreVerification,
  organisme:    rendreOrganisme,
  comptes:      rendreComptes,
  moncompte:    rendreMonCompte,
  pratique:     rendrePratique,     // défini dans HE_pratique.js
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
  const lieu = await demanderLieuFormation();
  if (lieu === null) return;
  const code = genererCodeAcces();
  const { error } = await sb.from('sessions_formation').insert({
    organisme_id: S.organisme.id, formateur_id: S.profil.id,
    intitule, numero_session_galaxy: numeroGalaxy.trim(), code_acces: code, statut: 'brouillon', lieu,
  });
  if (error) return erreurSupabase('Création de la session', error);
  toast('Session créée — code d\'accès ' + code);
  rendreSessions($('#contenu'));
}

// Lieu de la formation (Briec / Sèvremont) : détermine la marque et le
// téléphone affichés sur le volet 3 du titre d'habilitation (voir
// HE_pdf.js, constante SITES). Valeurs stockées telles quelles dans
// sessions_formation.lieu — pas d'enum SQL, juste ces deux libellés exacts.
async function demanderLieuFormation(valeurActuelle) {
  let choix = null;
  while (choix === null) {
    const reponse = prompt(
      'Lieu de la formation — tape B pour Briec ou S pour Sèvremont :',
      valeurActuelle === 'Sèvremont' ? 'S' : 'B');
    if (reponse === null) return null; // annulé
    const c = reponse.trim().toUpperCase();
    if (c === 'B') choix = 'Briec';
    else if (c === 'S') choix = 'Sèvremont';
    else toast('Réponds B (Briec) ou S (Sèvremont)', 'erreur');
  }
  return choix;
}

async function modifierNumeroGalaxy() {
  const numeroGalaxy = prompt('N° de session Galaxy :', S.session.numero_session_galaxy || '');
  if (numeroGalaxy === null || numeroGalaxy.trim() === '') return;
  const { error } = await sb.from('sessions_formation')
    .update({ numero_session_galaxy: numeroGalaxy.trim() }).eq('id', S.session.id);
  if (error) return erreurSupabase('Modification du n° Galaxy', error);
  await ouvrirSession(S.session.id);
}

async function modifierLieuFormation() {
  const lieu = await demanderLieuFormation(S.session.lieu);
  if (lieu === null) return;
  const { error } = await sb.from('sessions_formation').update({ lieu }).eq('id', S.session.id);
  if (error) return erreurSupabase('Modification du lieu', error);
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

  // Statut par titre visé (gris/vert clair/vert foncé/rouge sur les puces) : nécessite
  // resultats_symbole, calculé après correction théorie et/ou clôture pratique.
  const idsStagiaires = (stagiaires || []).map(st => st.id);
  const { data: resultats } = idsStagiaires.length
    ? await sb.from('resultats_symbole').select('*').in('stagiaire_id', idsStagiaires)
    : { data: [] };
  const resultatsParStagiaire = {};
  (resultats || []).forEach(r => {
    (resultatsParStagiaire[r.stagiaire_id] ||= {})[r.symbole_code] = r;
  });
  // Code inclus dans le lien : le QR scanné saute la saisie manuelle du code.
  const lienStagiaire = location.origin + location.pathname
    + '#stagiaire?code=' + encodeURIComponent(s.code_acces);
  // QCM de positionnement (2026-09-03) : même code de session, autre route
  // (#entrainement) — entraînement libre, sans impact sur le dossier.
  const lienEntrainement = location.origin + location.pathname
    + '#entrainement?code=' + encodeURIComponent(s.code_acces);

  zone.innerHTML = `
    <button class="lien" onclick="retour('sessions')">← Toutes les sessions</button>
    <div class="barre-actions">
      <h2>${esc(s.intitule)}</h2>
      <div>
        <button onclick="ouvrirParametresSession()" title="Paramètres de l'évaluation">⚙ Paramètres</button>
        <button onclick="genererTousLesQcm()" title="Générer un sujet par stagiaire">🎲 Générer les QCM</button>
        <button onclick="voirJournalSession('${s.id}')" title="Historique des interventions manuelles du formateur">🗂 Journal</button>
        ${s.statut !== 'cloturee' ? `<button class="principal" onclick="basculerOuverture()">
          ${s.statut === 'ouverte' ? '⏸ Fermer l\'accès stagiaires' : '▶ Ouvrir l\'accès stagiaires'}</button>` : ''}
        ${s.statut !== 'cloturee'
          ? `<button title="Supprime les infos personnelles des stagiaires (sauf nom/prénom), une fois tous les titres/avis générés"
                onclick="cloturerSession()">🔒 Clôturer la session</button>`
          : '<span class="etat cloturee">🔒 Session clôturée</span>'}
      </div>
    </div>

    <div class="carte info-passation">
      <div><b>Code à dicter en salle</b><div class="code-geant">${esc(s.code_acces)}</div></div>
      <div><b>Adresse de connexion stagiaires</b><div><code>${esc(lienStagiaire)}</code></div>
        <button class="lien" onclick="navigator.clipboard.writeText('${esc(lienStagiaire)}');toast('Lien copié')">Copier le lien</button></div>
      <details class="qr-repliable">
        <summary><b>QR code examen</b></summary>
        <div id="qr-passation"></div>
        <p id="qr-erreur" class="erreur-discrete" hidden></p>
        <button class="lien" onclick="telechargerQrPassation()">Télécharger l'image</button>
      </details>
      <details class="qr-repliable">
        <summary><b>QCM de positionnement (entraînement libre)</b></summary>
        <div id="qr-entrainement"></div>
        <p class="aide">QR différent de l'examen : le stagiaire choisit ses titres visés et
          s'entraîne avec les réponses affichées, sans impact sur son dossier.</p>
        <div><code>${esc(lienEntrainement)}</code></div>
        <button class="lien" onclick="navigator.clipboard.writeText('${esc(lienEntrainement)}');toast('Lien copié')">Copier le lien</button>
      </details>
      <div><b>N° de session Galaxy</b><div>${esc(s.numero_session_galaxy) || '<i>non renseigné</i>'}</div>
        <button class="lien" onclick="modifierNumeroGalaxy()">Modifier</button></div>
      <div><b>Lieu de la formation</b><div>${esc(s.lieu) || '<i>non renseigné</i>'}</div>
        <button class="lien" onclick="modifierLieuFormation()">Modifier</button></div>
      <div><b>Règle de réussite</b>
        <div>${Math.round(s.seuil_global * 100)} % de bonnes réponses
          ${s.exiger_fondamentales ? '<br>+ 100 % des questions fondamentales' : ''}</div></div>
    </div>

    ${tableauBordGroupe(stagiaires, resultatsParStagiaire)}

    <div class="barre-actions">
      <h3>Stagiaires (${(stagiaires || []).length})</h3>
      <div>
        <button onclick="modeleExcelStagiaires()" title="Télécharger un modèle Excel">⬇ Modèle Excel</button>
        <label class="bouton-fichier" title="Importer une liste de stagiaires">⬆ Importer Excel
          <input type="file" accept=".xlsx,.xls,.csv" hidden onchange="importerStagiairesExcel(this)"></label>
        <button title="Envoie l'avis d'habilitation + la preuve d'examen de chaque stagiaire ayant un titre au secrétariat"
          onclick="envoyerSecretariat()">✉️ Envoi secrétariat</button>
        <button title="Télécharge un ZIP avec l'avis d'habilitation + la preuve d'examen de chaque stagiaire ayant un titre"
          onclick="telechargerZipTitres()">🗜 Télécharger ZIP</button>
        <button class="principal" onclick="nouveauStagiaire()">+ Ajouter</button>
      </div>
    </div>

    <table class="tableau">
      <thead><tr><th>Nom</th><th>Prénom</th><th>Fonction</th><th>Titres visés</th>
        <th>Domaines</th><th>Théorie</th><th>Pratique</th><th>Actions</th></tr></thead>
      <tbody>${(stagiaires || []).map(st =>
        ligneStagiaire(st, suiviPar[st.id], resultatsParStagiaire[st.id] || {})).join('')
        || '<tr><td colspan="8" class="vide">Aucun stagiaire. Ajoute-les un par un ou importe un fichier Excel.</td></tr>'}
      </tbody>
    </table>`;

  // La bibliothèque QRCode vient d'un CDN (voir index.html) : si elle n'a pas
  // pu charger (réseau, bloqueur de scripts...), on l'affiche clairement au
  // lieu de laisser un carré vide sans explication. Cette bibliothèque dessine
  // elle-même (canvas ou <img> selon le navigateur) dans le conteneur fourni,
  // sans callback : toute erreur est donc synchrone.
  try {
    if (typeof QRCode === 'undefined') throw new Error('bibliothèque QRCode non chargée');
    $('#qr-passation').innerHTML = '';
    new QRCode($('#qr-passation'), { text: lienStagiaire, width: 140, height: 140 });
    $('#qr-entrainement').innerHTML = '';
    new QRCode($('#qr-entrainement'), { text: lienEntrainement, width: 140, height: 140 });
  } catch (e) { afficherErreurQr(e.message); }
}

function afficherErreurQr(message) {
  DEBUG.erreur('QR code', message);
  const p = $('#qr-erreur');
  if (p) { p.hidden = false; p.textContent = 'QR code indisponible (' + message + ')'; }
}

function telechargerQrPassation() {
  const conteneur = $('#qr-passation');
  // Selon le navigateur, la bibliothèque dessine soit un <canvas>, soit un <img>.
  const source = conteneur?.querySelector('canvas') || conteneur?.querySelector('img');
  if (!source) return toast('QR code indisponible', 'erreur');
  const lien = document.createElement('a');
  lien.download = 'qr-passation-' + S.session.code_acces + '.png';
  lien.href = source.tagName === 'CANVAS' ? source.toDataURL('image/png') : source.src;
  lien.click();
}

// Couleur d'une puce « titre visé » selon resultats_symbole :
//  - pas de ligne (jamais calculé)     -> gris (défaut, pas de classe)
//  - theorie_ok === false              -> rouge : théorie non validée
//  - theorie_ok === true, pratique_ok  -> vert foncé : titre validé
//  - theorie_ok === true, sinon        -> vert clair : théorie validée, pratique en attente
function classeTitre(resultat) {
  if (!resultat || resultat.theorie_ok === null) return '';
  if (resultat.theorie_ok === false) return 'titre-rouge';
  return resultat.pratique_ok ? 'titre-vert-fonce' : 'titre-vert-clair';
}

/* --------- Tableau de bord formateur : validation des titres du groupe (2026-08) ---------
 * Vue d'ensemble en tête de session — évite de parcourir stagiaire par stagiaire pour
 * savoir où en est le groupe sur chaque titre visé. Purement dérivé des mêmes données
 * que les puces par stagiaire (resultatsParStagiaire) : aucune requête supplémentaire. */
function tableauBordGroupe(stagiaires, resultatsParStagiaire) {
  const parTitre = {};
  (stagiaires || []).forEach(st => {
    (st.stagiaire_symboles || []).forEach(x => {
      const code = x.symbole_code;
      const c = (parTitre[code] ||= { total: 0, valides: 0, pratiqueAttente: 0, theorieKo: 0, nonEvalues: 0 });
      c.total++;
      switch (classeTitre((resultatsParStagiaire[st.id] || {})[code])) {
        case 'titre-vert-fonce': c.valides++; break;
        case 'titre-vert-clair': c.pratiqueAttente++; break;
        case 'titre-rouge': c.theorieKo++; break;
        default: c.nonEvalues++;
      }
    });
  });
  const titres = Object.entries(parTitre).sort((a, b) => a[0].localeCompare(b[0]));
  if (!titres.length) return '';

  // Réductible : encore expérimental (« à voir à l'usage »), donc pas question de
  // l'imposer en permanence — le formateur replie/déplie via <summary>, et le choix
  // est mémorisé (localStorage) pour ne pas avoir à le refaire à chaque session.
  const ouvert = localStorage.getItem('he_tableau_bord_ouvert') !== 'false';
  return `
    <details class="carte tableau-bord-groupe" ${ouvert ? 'open' : ''}
      ontoggle="localStorage.setItem('he_tableau_bord_ouvert', this.open)">
      <summary><b>Tableau de bord — validation des titres du groupe</b></summary>
      <table class="tableau compact">
        <thead><tr><th>Titre</th><th>Stagiaires</th><th>Validés</th>
          <th>Théorie OK, pratique en attente</th><th>Théorie non validée</th><th>Non évalués</th></tr></thead>
        <tbody>${titres.map(([code, c]) => `
          <tr>
            <td><b>${esc(libelleSymbole(code))}</b></td>
            <td>${c.total}</td>
            <td>${c.valides ? `<span class="etat ok">${c.valides}</span>` : '—'}</td>
            <td>${c.pratiqueAttente ? `<span class="etat encours">${c.pratiqueAttente}</span>` : '—'}</td>
            <td>${c.theorieKo ? `<span class="etat ko">${c.theorieKo}</span>` : '—'}</td>
            <td>${c.nonEvalues || '—'}</td>
          </tr>`).join('')}</tbody>
      </table>
    </details>`;
}

function ligneStagiaire(st, suivi, resultatsSymboles) {
  const symb = (st.stagiaire_symboles || []).map(x => ({
    code: x.symbole_code, libelle: libelleSymbole(x.symbole_code),
    classe: classeTitre((resultatsSymboles || {})[x.symbole_code]),
  }));
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
    <td>${symb.map(x => `<span class="puce ${x.classe}" title="${x.classe === 'titre-rouge' ? 'Théorie non validée' :
        x.classe === 'titre-vert-fonce' ? 'Titre validé (théorie + pratique)' :
        x.classe === 'titre-vert-clair' ? 'Théorie validée, pratique en attente' : 'Non évalué'}">${esc(x.libelle)}</span>`)
      .join(' ') || '<i>aucun</i>'}</td>
    <td>${(st.domaines || []).join(', ')}</td>
    <td>${theorie}</td><td>${prat}</td>
    <td class="actions">
      <button class="icone" title="Plus d'actions (modifier, avis, documents, suppression...)"
        onclick="ouvrirActionsStagiaire('${st.id}', '${esc(st.nom)}', '${esc(st.prenom)}', ${st.evaluation_externe ? 'true' : 'false'})">👁</button>
      <button class="icone" title="Évaluation pratique" onclick="ouvrirPratique('${st.id}')">🔧</button>
      <button class="icone" title="QCM de rattrapage : uniquement sur le(s) titre(s) en échec au premier passage"
        onclick="proposerRattrapage('${st.id}')">🔁</button>
      <button class="icone" title="Préconisation du formateur en cas d'échec (affichée sur l'avis)"
        onclick="saisirPreconisations('${st.id}')">✏️</button>
    </td></tr>`;
}

/* ---------- Popup "Plus d'actions" (2026-09-04, demande de Jeremy) -----
 * La ligne stagiaire ne garde que les 3 actions les plus fréquentes en
 * salle (pratique, rattrapage, préconisation) — tout le reste (modifier,
 * documents, résultat externe, suppression) part dans ce popup ouvert par
 * l'icône œil, pour désencombrer le tableau. */
function ouvrirActionsStagiaire(id, nom, prenom, evaluationExterne) {
  ouvrirModale(`${nom} ${prenom}`, `
    <div class="liste-actions-stagiaire">
      <button onclick="fermerModale();editerStagiaire('${id}')">✎ Modifier le stagiaire et ses titres</button>
      <button onclick="fermerModale();voirCopie('${id}')">📄 Voir la copie corrigée</button>
      <button onclick="fermerModale();genererTitrePdf('${id}')">🏅 Générer le titre d'habilitation (PDF)</button>
      <button onclick="fermerModale();genererPreuveExamenPdf('${id}')">🧾 Télécharger la preuve d'examen (PDF)</button>
      <button onclick="fermerModale();saisirResultatExterne('${id}')">📋 Saisir un résultat de formateur externe${evaluationExterne ? ' ✓' : ''}</button>
      <button class="danger" onclick="fermerModale();supprimerStagiaire('${id}')">🗑 Supprimer le stagiaire</button>
    </div>`);
}

/* ---------- QCM de rattrapage (2026-09-04, demande de Jeremy) ----------
 * Uniquement sur le(s) titre(s) en échec au premier passage — les titres
 * déjà validés ne sont pas repassés. Le premier passage reste visible dans
 * l'historique (voir voirCopie / genererPreuveExamenPdf, qui listent les
 * deux épreuves). La fonction SQL refuse elle-même si le premier passage
 * n'est pas encore corrigé, ou si aucun titre n'est en échec. */
async function proposerRattrapage(stagiaireId) {
  if (!confirmer('Générer un QCM de rattrapage, uniquement sur le(s) titre(s) en échec ?\n'
    + 'Les titres déjà validés ne seront pas repassés.')) return;
  try {
    await rpc('generer_qcm_rattrapage', { p_stagiaire_id: stagiaireId });
    toast('QCM de rattrapage généré');
    rendreDetailSession($('#contenu'));
  } catch (e) {
    // Le message SQL précise le cas (premier passage pas corrigé, rien en échec...)
    erreurSupabase('Génération du rattrapage', e);
  }
}

/* ---------- Saisie simplifiée : résultat de formateur externe --------
 * Demande de Jeremy (2026-08-27) : un formateur extérieur à BFS évalue le
 * stagiaire avec son propre système (ex. QUIZAFON) et fournit sa propre
 * attestation (modèle vu le 27/08 : titres évalués, note/total, % de
 * réussite, validation théorique oui/non, symboles validés en pratique).
 * La secrétaire ressaisit ce résultat ici — pas de QCM/pratique Habelec
 * pour ce stagiaire, juste le résultat final. habelec.enregistrer_evaluation_externe
 * écrit directement dans resultats_symbole ; "🏅 Générer le titre" fonctionne
 * ensuite sans aucune autre modification. */
// Colore le libellé d'un titre dans le formulaire "Résultat externe" (2026-08-28,
// demande de Jeremy) : rouge dès que le titre est coché (visé), vert si en plus
// la pratique est validée pour ce titre — repère visuel rapide, aucune incidence
// sur les données enregistrées (toujours lues depuis les checkboxes elles-mêmes).
function majCouleurTitreExterne(code) {
  const lib = document.getElementById(`lib-${code}`);
  if (!lib) return;
  const vise = document.querySelector(`input[name=symbole][value="${code}"]`)?.checked;
  const pratiqueValidee = document.getElementById(`prat-${code}`)?.checked;
  lib.className = !vise ? '' : (pratiqueValidee ? 'titre-externe-vert' : 'titre-externe-rouge');
}

async function saisirResultatExterne(id) {
  const { data: st, error } = await sb.from('stagiaires')
    .select('*, stagiaire_symboles(symbole_code)').eq('id', id).single();
  if (error) return erreurSupabase('Lecture du stagiaire', error);
  const symbolesVises = (st.stagiaire_symboles || []).map(x => x.symbole_code);
  const ev = st.evaluation_externe || {};
  // Pré-remplissage pratique : lu depuis resultats_symbole (pas stocké tel
  // quel dans evaluation_externe, qui ne garde que le résumé théorique).
  const { data: resultatsExistants } = await sb.from('resultats_symbole')
    .select('symbole_code, pratique_ok').eq('stagiaire_id', id);
  const symbolesValidesPratique = (resultatsExistants || [])
    .filter(r => r.pratique_ok).map(r => r.symbole_code);

  const parRole = {};
  S.referentiel.symboles.forEach(sy => (parRole[sy.role] ||= []).push(sy));

  ouvrirModale(`Résultat externe — ${st.nom} ${st.prenom}`, `
    <p class="aide">À utiliser uniquement pour un résultat fourni par un <b style="color:var(--rouge)">formateur/organisme
      extérieur à BFS</b> (son propre système de test théorique). Remplace directement le résultat
      du stagiaire, sans passer par le QCM ou la pratique Habelec.</p>
    <p class="aide">Coche « pratique validée » uniquement sur les titres réellement validés en
      pratique : non coché = non validé.</p>
    <form id="form-resultat-externe" class="formulaire">
      <label>Nom du formateur externe
        <input name="formateur_externe" value="${esc(ev.formateur || '')}" required></label>
      <fieldset><legend>Titres évalués (cocher aussi ceux validés en pratique)</legend>
        ${Object.entries(parRole).map(([role, liste]) => `
          <div class="groupe-symboles"><b>${esc(role)}</b>
            ${liste.map(sy => `<label class="case">
              <input type="checkbox" name="symbole" value="${sy.code}"
                ${symbolesVises.includes(sy.code) ? 'checked' : ''}
                onchange="document.getElementById('prat-${sy.code}').disabled = !this.checked; majCouleurTitreExterne('${sy.code}')">
              <span id="lib-${sy.code}" class="${symbolesVises.includes(sy.code)
                ? (symbolesValidesPratique.includes(sy.code) ? 'titre-externe-vert' : 'titre-externe-rouge') : ''}">${esc(sy.libelle)}</span>
              <label class="case" style="margin-left:8px">
                <input type="checkbox" id="prat-${sy.code}" name="pratique" value="${sy.code}"
                  ${!symbolesVises.includes(sy.code) ? 'disabled' : ''}
                  ${symbolesValidesPratique.includes(sy.code) ? 'checked' : ''}
                  onchange="majCouleurTitreExterne('${sy.code}')"> pratique validé</label>
            </label>`).join('')}
          </div>`).join('')}
      </fieldset>
      <fieldset><legend>Résultat théorique global</legend>
        <div class="grille-2">
          <label>Note obtenue <input type="number" step="1" min="0" name="note" value="${ev.note ?? ''}" required></label>
          <label>Total <input type="number" step="1" min="1" name="total" value="${ev.total ?? ''}" required></label>
        </div>
        <label class="case"><input type="checkbox" name="theorique_validee"
          ${ev.theorique_validee !== false ? 'checked' : ''}> Évaluation théorique validée</label>
      </fieldset>
      <div class="pied-modale">
        <button type="button" onclick="fermerModale()">Annuler</button>
        <button type="submit" class="principal">Enregistrer</button>
      </div>
    </form>`);

  $('#form-resultat-externe').addEventListener('submit', async ev2 => {
    ev2.preventDefault();
    const f = ev2.target;
    const symboles = $$('#form-resultat-externe input[name=symbole]:checked').map(i => i.value);
    const pratique = $$('#form-resultat-externe input[name=pratique]:checked').map(i => i.value);
    if (!symboles.length) return toast('Coche au moins un titre évalué', 'erreur');
    try {
      const { error } = await sb.rpc('enregistrer_evaluation_externe', {
        p_stagiaire_id: id,
        p_symboles_vises: symboles,
        p_symboles_valides_pratique: pratique,
        p_note: parseFloat(f.note.value),
        p_total: parseFloat(f.total.value),
        p_theorique_validee: f.theorique_validee.checked,
        p_formateur_externe: f.formateur_externe.value.trim(),
      });
      if (error) throw error;
      fermerModale();
      toast('Résultat externe enregistré');
      rendreDetailSession($('#contenu'));
    } catch (e) { erreurSupabase('Enregistrement du résultat externe', e); }
  });
}

/* ---------- Préconisation du formateur en cas d'échec (2026-08-28) ------
 * Demande de Jeremy : sur l'avis, en face d'un titre en échec (théorie et/ou
 * pratique non validées), le formateur doit pouvoir écrire une recomman-
 * dation libre (ex. "à représenter en pratique seule"). Enregistrée dans
 * resultats_symbole.preconisation, colonne dédiée jamais réécrite par
 * calculer_resultats() — voir habelec.enregistrer_preconisation(). */
async function saisirPreconisations(id) {
  const { data: st, error } = await sb.from('stagiaires')
    .select('*, stagiaire_symboles(symbole_code)').eq('id', id).single();
  if (error) return erreurSupabase('Lecture du stagiaire', error);
  const symbolesVises = (st.stagiaire_symboles || []).map(x => x.symbole_code);
  if (!symbolesVises.length) return toast('Aucun titre visé pour ce stagiaire', 'erreur');

  const { data: resultats } = await sb.from('resultats_symbole')
    .select('symbole_code, avis, preconisation').eq('stagiaire_id', id);
  const parSymbole = Object.fromEntries((resultats || []).map(r => [r.symbole_code, r]));

  const badgeAvis = avis => avis === 'favorable' ? '<span class="etat ok">validé</span>'
    : avis === 'defavorable' ? '<span class="etat ko">échec</span>'
    : '<span class="etat neutre">en attente</span>';

  ouvrirModale(`Préconisations — ${st.nom} ${st.prenom}`, `
    <p class="aide">À renseigner pour les titres en échec : ce texte s'affiche sur l'avis
      d'habilitation, dans le tableau "Détail par titre visé".</p>
    <form id="form-preconisations" class="formulaire">
      ${symbolesVises.map(code => {
        const r = parSymbole[code] || {};
        return `<label>${esc(libelleSymbole(code))} ${badgeAvis(r.avis)}
          <textarea name="p-${code}" rows="2" placeholder="Préconisation…">${esc(r.preconisation || '')}</textarea></label>`;
      }).join('')}
      <div class="pied-modale">
        <button type="button" onclick="fermerModale()">Annuler</button>
        <button type="submit" class="principal">Enregistrer</button>
      </div>
    </form>`);

  $('#form-preconisations').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    try {
      for (const code of symbolesVises) {
        const { error } = await sb.rpc('enregistrer_preconisation', {
          p_stagiaire_id: id,
          p_symbole_code: code,
          p_texte: f[`p-${code}`].value,
        });
        if (error) throw error;
      }
      fermerModale();
      toast('Préconisations enregistrées');
    } catch (e) { erreurSupabase('Enregistrement des préconisations', e); }
  });
}

async function basculerOuverture() {
  const nouveau = S.session.statut === 'ouverte' ? 'theorie_close' : 'ouverte';
  const { error } = await sb.from('sessions_formation')
    .update({ statut: nouveau }).eq('id', S.session.id);
  if (error) return erreurSupabase('Changement de statut', error);
  S.session.statut = nouveau;
  toast(nouveau === 'ouverte' ? 'Accès stagiaires ouvert' : 'Accès stagiaires fermé');
  rendreDetailSession($('#contenu'));
}

/** Purge les infos personnelles des stagiaires (sauf nom/prénom). Irréversible :
 *  refusé côté base tant qu'un avis est encore en attente pour un stagiaire. */
// 2026-08-28 (demande de Jeremy) : snapshot JSON complet de la session,
// envoyé sur Drive AVANT la purge des infos personnelles faite par
// cloturer_session() côté base — pensé pour être réimportable après une
// purge de l'appli. Best-effort, jamais bloquant sur la clôture elle-même.
async function sauvegarderSessionJsonDrive(sessionId) {
  try {
    const { data: session } = await sb.from('sessions_formation').select('*').eq('id', sessionId).single();
    const { data: stagiaires } = await sb.from('stagiaires')
      .select('*, stagiaire_symboles(symbole_code)').eq('session_id', sessionId);
    const stagiaireIds = (stagiaires || []).map(s => s.id);
    const idsOuVide = stagiaireIds.length ? stagiaireIds : ['00000000-0000-0000-0000-000000000000'];
    const [{ data: resultats }, { data: epreuves }, { data: titres }] = await Promise.all([
      sb.from('resultats_symbole').select('*').in('stagiaire_id', idsOuVide),
      sb.from('epreuves_theoriques').select('*').in('stagiaire_id', idsOuVide),
      sb.from('titres_habilitation').select('*').in('stagiaire_id', idsOuVide),
    ]);
    const snapshot = {
      version_export: 1,
      exporte_le: new Date().toISOString(),
      session, stagiaires,
      resultats_symbole: resultats, epreuves_theoriques: epreuves, titres_habilitation: titres,
    };
    const contenuBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(snapshot, null, 2))));
    const { data, error } = await sb.functions.invoke('habelec-sauvegarder-drive', {
      body: {
        session_id: sessionId, nom_fichier: 'session.json', mime_type: 'application/json',
        contenu_base64: contenuBase64, nom_session: session?.intitule,
      },
    });
    if (error || data?.ok === false) console.warn('Sauvegarde Drive (session.json) ignorée :', error || data?.erreur);
  } catch (e) {
    console.warn('Sauvegarde Drive (session.json) ignorée :', e);
  }
}

async function cloturerSession() {
  if (!confirmer('Clôturer définitivement cette session ?\n'
    + 'Toutes les infos personnelles des stagiaires (date de naissance, entreprise, '
    + 'coordonnées...) seront supprimées, sauf nom et prénom. Action irréversible.')) return;
  try {
    await sauvegarderSessionJsonDrive(S.session.id);
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
/* ---------- Envoi secrétariat : avis + preuve d'examen par email --------
 * Demande de Jeremy (2026-08-28) : un bouton sur le tableau de session
 * envoie, à la boîte mail dédiée du secrétariat (Lesli), l'avis
 * d'habilitation ET la preuve d'examen de chaque stagiaire ayant déjà un
 * titre généré — les PDF sont (re)construits ici même (jsPDF, mêmes
 * fonctions que les téléchargements individuels) puis transmis en base64 à
 * l'Edge Function habelec-envoyer-secretariat, qui se charge de l'envoi
 * SMTP (Gmail dédié). Convention de nommage demandée : chaque fichier
 * commence par le NOM du stagiaire, pour un tri alphabétique automatique
 * dans la boîte mail. */
/* ---------- ZIP global : tous les titres + toutes les preuves --------
 * (2026-09-04, demande de Jeremy) Sur le tableau général d'une session,
 * télécharge un seul fichier ZIP contenant l'avis d'habilitation ET la
 * preuve d'examen de chaque stagiaire ayant un titre généré — pratique
 * pour un archivage local rapide, sans passer par l'envoi email au
 * secrétariat. Réutilise les mêmes générateurs PDF (sauvegarder: false)
 * que envoyerSecretariat, juste ci-dessous. Nécessite JSZip (voir index.html).
 */
async function telechargerZipTitres() {
  const s = S.session;
  const { data: stagiaires } = await sb.from('stagiaires')
    .select('id, nom, prenom').eq('session_id', s.id).order('nom');
  const ids = (stagiaires || []).map(st => st.id);
  if (!ids.length) return toast('Aucun stagiaire dans cette session', 'erreur');

  const { data: titres } = await sb.from('titres_habilitation')
    .select('stagiaire_id').in('stagiaire_id', ids);
  const idsAvecTitre = new Set((titres || []).map(t => t.stagiaire_id));
  const eligibles = stagiaires.filter(st => idsAvecTitre.has(st.id));
  if (!eligibles.length) {
    return toast("Aucun stagiaire n'a de titre généré pour l'instant — génère les titres (👁 puis 🏅) "
      + 'avant de télécharger le ZIP.', 'erreur', 7000);
  }

  if (typeof JSZip === 'undefined') return toast('Bibliothèque ZIP indisponible (réseau ?)', 'erreur');

  toast(`Préparation du ZIP pour ${eligibles.length} stagiaire(s)…`);
  const zip = new JSZip();
  const echecs = [];
  for (const st of eligibles) {
    try {
      const avis = await genererTitrePdf(st.id, { sauvegarder: false });
      if (!avis?.doc) { echecs.push(st); continue; }
      const preuve = await genererPreuveExamenPdf(st.id, { sauvegarder: false });
      zip.file(avis.nomFichier, avis.doc.output('arraybuffer'));
      zip.file(preuve.nomFichier, preuve.doc.output('arraybuffer'));
    } catch (e) {
      DEBUG.erreur('telechargerZipTitres — génération PDF', e.message);
      echecs.push(st);
    }
  }

  const contenu = await zip.generateAsync({ type: 'blob' });
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(contenu);
  lien.download = `${(s.numero_session_galaxy || s.code_acces || 'session')}-titres-preuves.zip`;
  lien.click();
  URL.revokeObjectURL(lien.href);

  if (echecs.length) {
    toast(`ZIP téléchargé, mais ${echecs.length} dossier(s) en échec : `
      + echecs.map(st => `${st.nom} ${st.prenom}`).join(', '), 'erreur', 8000);
  } else {
    toast('ZIP téléchargé');
  }
}

async function envoyerSecretariat() {
  const s = S.session;
  const { data: stagiaires } = await sb.from('stagiaires')
    .select('id, nom, prenom').eq('session_id', s.id).order('nom');
  const ids = (stagiaires || []).map(st => st.id);
  if (!ids.length) return toast('Aucun stagiaire dans cette session', 'erreur');

  const { data: titres } = await sb.from('titres_habilitation')
    .select('stagiaire_id').in('stagiaire_id', ids);
  const idsAvecTitre = new Set((titres || []).map(t => t.stagiaire_id));
  const eligibles = stagiaires.filter(st => idsAvecTitre.has(st.id));
  if (!eligibles.length) {
    return toast("Aucun stagiaire n'a de titre généré pour l'instant — génère les titres (🏅) "
      + 'avant l\'envoi au secrétariat.', 'erreur', 7000);
  }

  ouvrirModale('Envoi secrétariat', `
    <p class="aide">Envoie à jour l'avis d'habilitation + la preuve d'examen de chaque stagiaire
      coché ci-dessous, dans un seul email au secrétariat.
      Objet : <b>Habilitation électrique — ${esc(s.numero_session_galaxy || '—')}</b></p>
    <form id="form-envoi-secretariat" class="formulaire">
      <fieldset><legend>Stagiaires (${eligibles.length} avec titre généré)</legend>
        ${eligibles.map(st => `<label class="case">
          <input type="checkbox" name="stagiaire" value="${st.id}" checked> ${esc(st.nom)} ${esc(st.prenom)}</label>`).join('')}
      </fieldset>
      <div class="pied-modale">
        <button type="button" onclick="fermerModale()">Annuler</button>
        <button type="submit" class="principal">Envoyer</button>
      </div>
    </form>`);

  $('#form-envoi-secretariat').addEventListener('submit', async ev => {
    ev.preventDefault();
    const idsChoisis = $$('#form-envoi-secretariat input[name=stagiaire]:checked').map(i => i.value);
    if (!idsChoisis.length) return toast('Coche au moins un stagiaire', 'erreur');

    fermerModale();
    toast(`Préparation de ${idsChoisis.length} dossier(s)…`);

    const piecesJointes = [];
    const echecs = [];
    for (const id of idsChoisis) {
      try {
        const avis = await genererTitrePdf(id, { sauvegarder: false });
        if (!avis?.doc) { echecs.push(id); continue; }
        const preuve = await genererPreuveExamenPdf(id, { sauvegarder: false });
        piecesJointes.push(
          { nom: avis.nomFichier, base64: avis.doc.output('datauristring').split(',')[1] },
          { nom: preuve.nomFichier, base64: preuve.doc.output('datauristring').split(',')[1] },
        );
      } catch (e) {
        DEBUG.erreur('envoyerSecretariat — génération PDF', e.message);
        echecs.push(id);
      }
    }
    if (!piecesJointes.length) {
      return toast('Aucun document généré — envoi annulé (voir le journal de debug)', 'erreur');
    }

    const nomsInclus = eligibles.filter(st => idsChoisis.includes(st.id) && !echecs.includes(st.id))
      .map(st => `${st.nom} ${st.prenom}`);
    const objet = `Habilitation électrique — ${s.numero_session_galaxy || '—'}`;
    const corps = `Bonjour,\n\nCi-joint l'avis d'habilitation et la preuve d'examen pour :\n`
      + nomsInclus.map(n => `  - ${n}`).join('\n')
      + `\n\nSession : ${s.intitule || ''} (n° Galaxy ${s.numero_session_galaxy || '—'})`
      + (echecs.length ? `\n\n${echecs.length} stagiaire(s) n'a/ont pas pu être inclus (erreur de génération).` : '')
      + '\n\n— Message généré automatiquement par Habelec.';

    try {
      const { data, error } = await sb.functions.invoke('habelec-envoyer-secretariat', {
        body: { objet, corps, pieces_jointes: piecesJointes },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast(`Envoyé au secrétariat (${piecesJointes.length} fichier(s))`);
    } catch (e) {
      erreurSupabase('Envoi au secrétariat', e);
    }
  });
}


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
      <label>Entreprise (employeur du stagiaire)
        <input name="entreprise" value="${esc(st.entreprise || '')}"
          placeholder="Ex : Entreprise Client SARL — jamais BFS, l'organisme de formation">
      </label>
      <p class="aide">Utilisée sur l'avis et le titre d'habilitation (volet « L'EMPLOYEUR »). Peut
        aussi être saisie par le stagiaire lui-même à la connexion au QCM (dans ce cas elle écrase
        cette valeur) — et est purgée à la clôture de la session.</p>
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
      entreprise: f.entreprise.value.trim(),
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
// État d'édition (en mémoire, réinitialisé à chaque ouverture de modale) :
// quelles lignes sont actuellement ouvertes en saisie manuelle / en
// correction de clé. Permet de re-rendre voirCopie() sans perdre le mode
// édition en cours.
const EDITION_COPIE = { reponses: new Set(), cles: new Set() };

function toggleReponseFormateur(epreuveQuestionId, stagiaireId) {
  EDITION_COPIE.reponses.has(epreuveQuestionId)
    ? EDITION_COPIE.reponses.delete(epreuveQuestionId) : EDITION_COPIE.reponses.add(epreuveQuestionId);
  voirCopie(stagiaireId);
}
function toggleCorrectionCle(questionId, stagiaireId) {
  EDITION_COPIE.cles.has(questionId)
    ? EDITION_COPIE.cles.delete(questionId) : EDITION_COPIE.cles.add(questionId);
  voirCopie(stagiaireId);
}

async function enregistrerReponseFormateur(epreuveQuestionId, stagiaireId) {
  const choix = $$(`#rf-${epreuveQuestionId} input:checked`).map(i => i.value);
  if (!choix.length && !confirmer('Aucune case cochée : enregistrer une absence de réponse ?')) return;
  try {
    await rpc('formateur_repondre', { p_epreuve_question_id: epreuveQuestionId, p_reponses: choix });
    EDITION_COPIE.reponses.delete(epreuveQuestionId);
    toast('Réponse enregistrée et copie recalculée');
    voirCopie(stagiaireId);
  } catch (e) { erreurSupabase('Saisie de la réponse', e); }
}

async function enregistrerCorrectionCle(questionId, stagiaireId) {
  const bonnes = $$(`#cc-${questionId} input:checked`).map(i => i.value);
  if (!bonnes.length) return toast('Il faut cocher au moins une bonne réponse', 'erreur');
  if (!confirmer('Cette correction s\'applique à TOUTES les copies déjà corrigées qui contiennent '
    + 'cette question, dans tout l\'organisme. Continuer ?')) return;
  try {
    const n = await rpc('corriger_question_erronee', { p_question_id: questionId, p_bonnes_ids: bonnes });
    EDITION_COPIE.cles.delete(questionId);
    toast(`Clé corrigée — ${n} copie(s) recalculée(s)`);
    voirCopie(stagiaireId);
  } catch (e) { erreurSupabase('Correction de la clé', e); }
}

/* Journal des interventions manuelles de la session — traçabilité légale :
 * toute réponse saisie par le formateur ou clé de question corrigée doit
 * pouvoir être retrouvée après coup (qui, quand, avant/après). */
async function voirJournalSession(sessionId) {
  let lignes = [];
  try { lignes = await rpc('journal_session', { p_session_id: sessionId }); }
  catch (e) { return erreurSupabase('Journal de la session', e); }

  const LIBELLES_ACTION = {
    reponse_saisie_formateur: 'Réponse saisie par le formateur',
    cle_question_corrigee: 'Clé de question corrigée',
    generation: 'Titre d\'habilitation généré',
  };

  ouvrirModale('Journal des interventions', `
    <p class="aide">Historique des interventions manuelles sur cette session — conservé pour
      justifier tout écart avec la correction automatique.</p>
    <table class="tableau">
      <thead><tr><th>Date</th><th>Formateur</th><th>Stagiaire</th><th>Action</th><th>Détail</th></tr></thead>
      <tbody>${lignes.map(l => `<tr>
        <td>${new Date(l.horodatage).toLocaleString('fr-FR')}</td>
        <td>${esc(l.formateur)}</td>
        <td>${esc(l.stagiaire)}</td>
        <td>${esc(LIBELLES_ACTION[l.action] || l.action)}</td>
        <td>${detailJournal(l)}</td>
      </tr>`).join('') || `<tr><td colspan="5"><i>Aucune intervention manuelle enregistrée.</i></td></tr>`}</tbody>
    </table>
    <div class="pied-modale"><button onclick="fermerModale()">Fermer</button></div>`);
}

function detailJournal(l) {
  const d = l.details || {};
  if (l.action === 'reponse_saisie_formateur') {
    return `Question n°${esc(d.question_numero)} — avant : ${(d.avant || []).length} réponse(s),
      après : ${(d.apres || []).length} réponse(s)`;
  }
  if (l.action === 'cle_question_corrigee') {
    return `Question n°${esc(d.question_numero)} — « ${esc((d.question_enonce || '').slice(0, 80))} »`;
  }
  return esc(JSON.stringify(d));
}

async function voirCopie(stagiaireId) {
  const { data: ep } = await sb.from('epreuves_theoriques')
    .select('*').eq('stagiaire_id', stagiaireId).maybeSingle();
  if (!ep) return toast('Aucun sujet généré pour ce stagiaire', 'erreur');

  const { data: qs } = await sb.from('epreuve_questions')
    .select('*, questions(numero, theme_code, symboles_cibles, enonce, explication, image_url, question_reponses(id, libelle, correcte)), reponses_stagiaire(reponses_ids, correcte)')
    .eq('epreuve_id', ep.id).order('position');

  // Préconisation obligatoire sur un titre en échec (2026-08-28, demande de
  // Jeremy) : demandée ici, au moment où le formateur valide la copie
  // corrigée — pas moyen de fermer cet écran sans l'avoir saisie pour
  // chaque titre non validé en théorie. Préremplie si déjà saisie
  // auparavant (ex. depuis "✏️" sur l'écran Session).
  const [{ data: stPourPrecon }, { data: resultatsPourPrecon }] = ep.statut === 'corrigee' || ep.statut === 'terminee'
    ? await Promise.all([
        sb.from('stagiaires').select('id, stagiaire_symboles(symbole_code)').eq('id', stagiaireId).single(),
        sb.from('resultats_symbole').select('symbole_code, preconisation').eq('stagiaire_id', stagiaireId),
      ])
    : [{ data: null }, { data: null }];
  const symbolesStagiairePourPrecon = (stPourPrecon?.stagiaire_symboles || []).map(x => x.symbole_code);
  const preconisationParSymbole = Object.fromEntries((resultatsPourPrecon || []).map(r => [r.symbole_code, r.preconisation]));

  // Détail par titre visé : le verdict global ci-dessus agrège tous les titres,
  // mais un titre peut échouer seul sans invalider les autres (tronc commun vs
  // thème propre à un titre — voir theorie_gabarit_ok côté SQL). On rejoue le
  // même calcul par titre, et on repère les questions qui comptent pour chacun.
  const gabaritsVises = ep.gabarits || [];
  const verdictsParTitre = ep.statut === 'corrigee' || ep.statut === 'terminee'
    ? Object.fromEntries(await Promise.all(gabaritsVises.map(async g =>
        [g, await rpc('theorie_gabarit_ok', { p_epreuve_id: ep.id, p_gabarit_code: g })
          .catch(e => { DEBUG.erreur('theorie_gabarit_ok — ' + g, e.message); return null; })])))
    : {};
  if (ep.statut !== 'corrigee' && ep.statut !== 'terminee') {
    DEBUG.info('voirCopie — détail par titre non calculé, statut de l\'épreuve : ' + ep.statut);
  }
  // Pour chaque titre visé, les thèmes qui comptent dans son quota (tronc commun compris)
  const themesParTitre = Object.fromEntries(gabaritsVises.map(g =>
    [g, new Set(S.referentiel.quotas.filter(q => q.gabarit_code === g && q.nb > 0).map(q => q.theme_code))]));

  ouvrirModale('Copie corrigée', `
    <div class="bilan ${ep.reussie ? 'ok' : 'ko'}">
      ${ep.score_brut}/${ep.score_total} — ${Math.round((ep.taux || 0) * 100)} %
      · questions fondamentales : ${ep.fondamentales_ok ? 'toutes justes' : 'au moins une ratée'}
      · <b>${ep.reussie ? 'ADMIS' : 'NON ADMIS'}</b>
    </div>
    ${gabaritsVises.length ? `<div class="detail-titres">
      <b>Détail par titre visé</b>
      <ul>${gabaritsVises.map(g => {
        const ok = verdictsParTitre[g];
        return `<li class="${ok === true ? 'juste' : ok === false ? 'faux' : ''}">
          <span class="puce ${ok === true ? 'titre-vert-fonce' : ok === false ? 'titre-rouge' : ''}">
            ${esc(libelleGabarit(g))}</span>
          ${ok === true ? '✔ validé' : ok === false ? '✘ non validé' : 'en attente'}</li>`;
      }).join('')}</ul>
    </div>` : ''}
    ${(() => {
      // Titres en échec théorique (verdictsParTitre[g] === false) : préconisation
      // obligatoire avant de pouvoir fermer cette copie. On regroupe par gabarit
      // (comme la liste ci-dessus) mais on écrit le même texte sur chaque symbole
      // visé rattaché à ce gabarit (c'est là que preconisation est stockée).
      const gabaritsEnEchec = gabaritsVises.filter(g => verdictsParTitre[g] === false);
      if (!gabaritsEnEchec.length) return '';
      const mapping = Object.fromEntries(gabaritsEnEchec.map(g => [g,
        symbolesStagiairePourPrecon.filter(sym => (S.referentiel.gabaritsParSymbole[sym] || []).includes(g))]));
      return `<div class="detail-titres precon-requise" id="precon-obligatoire" data-mapping='${esc(JSON.stringify(mapping))}'>
        <b>Préconisation (obligatoire pour valider un titre en échec)</b>
        <p class="aide">Ce texte s'affichera sur l'avis d'habilitation, dans le tableau "Détail par titre visé".</p>
        ${gabaritsEnEchec.map(g => {
          const symboles = mapping[g];
          const texteExistant = symboles.map(sym => preconisationParSymbole[sym]).find(Boolean) || '';
          return `<label>${esc(libelleGabarit(g))}
            <textarea id="precon-${g}" rows="2" required placeholder="Préconisation…">${esc(texteExistant)}</textarea></label>`;
        }).join('')}
      </div>`;
    })()}
    <ol class="copie">${(qs || []).map(q => {
      const donnees = q.reponses_stagiaire?.reponses_ids || [];
      const juste = q.reponses_stagiaire?.correcte;
      const sansReponse = donnees.length === 0;
      const titresConcernes = gabaritsVises.filter(g => themesParTitre[g]?.has(q.theme_code));
      const editionReponse = EDITION_COPIE.reponses.has(q.id);
      const editionCle = EDITION_COPIE.cles.has(q.question_id);
      return `<li class="${sansReponse ? '' : juste ? 'juste' : 'faux'}">
        <div class="enonce">
          <span class="puce" title="Numéro de la question">${esc(codeAffiche(q.questions))}</span>
          ${esc(q.questions.enonce)}
          ${q.fondamentale ? '<span class="puce fond">fondamentale</span>' : ''}
          ${sansReponse ? '<span class="puce alerte">sans réponse</span>' : ''}
          ${titresConcernes.map(g => `<span class="puce" title="Compte pour ce titre">${esc(libelleGabarit(g))}</span>`).join('')}
        </div>
        ${q.questions.image_url ? `<img class="vignette-question" src="${esc(q.questions.image_url)}" alt="">` : ''}
        <ul>${q.questions.question_reponses.map(r => `
          <li class="${r.correcte ? 'bonne' : ''} ${donnees.includes(r.id) ? 'cochee' : ''}">
            ${donnees.includes(r.id) ? '☑' : '☐'} ${esc(r.libelle)}</li>`).join('')}</ul>
        ${q.questions.explication ? `<p class="explication">${esc(q.questions.explication)}</p>` : ''}

        <div class="actions-recorrection">
          ${sansReponse ? `<button type="button" class="lien" onclick="toggleReponseFormateur('${q.id}', '${stagiaireId}')">
            ${editionReponse ? 'Annuler la saisie' : '✎ Saisir la réponse à sa place'}</button>` : ''}
          <button type="button" class="lien" onclick="toggleCorrectionCle('${q.question_id}', '${stagiaireId}')">
            ${editionCle ? 'Annuler la correction' : '⚠ Cette question est erronée'}</button>
        </div>

        ${editionReponse ? `<div class="recorrection" id="rf-${q.id}">
          <p class="aide">Coche la ou les réponses que le stagiaire aurait dû donner.</p>
          ${q.questions.question_reponses.map(r => `
            <label class="case"><input type="${q.questions.choix_multiple ? 'checkbox' : 'radio'}"
              name="rf-${q.id}" value="${r.id}"> ${esc(r.libelle)}</label>`).join('')}
          <button type="button" class="principal" onclick="enregistrerReponseFormateur('${q.id}', '${stagiaireId}')">Enregistrer</button>
        </div>` : ''}

        ${editionCle ? `<div class="recorrection" id="cc-${q.question_id}">
          <p class="aide alerte">Coche la ou les VRAIES bonnes réponses. S'applique à toutes les copies
            déjà corrigées contenant cette question, dans tout l'organisme — recalcul automatique.</p>
          ${q.questions.question_reponses.map(r => `
            <label class="case"><input type="checkbox" name="cc-${q.question_id}" value="${r.id}"
              ${r.correcte ? 'checked' : ''}> ${esc(r.libelle)}</label>`).join('')}
          <button type="button" class="principal" onclick="enregistrerCorrectionCle('${q.question_id}', '${stagiaireId}')">Corriger la clé</button>
        </div>` : ''}
      </li>`;
    }).join('')}</ol>
    <div class="pied-modale">
      <button class="lien" onclick="voirJournalSession('${S.session.id}')">🗂 Journal des interventions</button>
      <button onclick="fermerCopieCorrigee('${stagiaireId}')">Fermer</button>
    </div>`);
}

// Ferme la copie corrigée, sauf s'il reste au moins une préconisation
// obligatoire vide (2026-08-28, demande de Jeremy) : dans ce cas, bloque la
// fermeture, signale le(s) titre(s) concerné(s) et met le focus sur le
// premier champ à compléter, au lieu de laisser fermer silencieusement.
async function fermerCopieCorrigee(stagiaireId) {
  const zone = document.getElementById('precon-obligatoire');
  if (!zone) return fermerModale();

  const mapping = JSON.parse(zone.dataset.mapping || '{}');
  for (const g of Object.keys(mapping)) {
    const champ = document.getElementById(`precon-${g}`);
    if (champ && !champ.value.trim()) {
      toast(`Préconisation obligatoire pour ${libelleGabarit(g)} (titre en échec)`, 'erreur', 6000);
      champ.focus();
      return;
    }
  }

  try {
    for (const [g, symboles] of Object.entries(mapping)) {
      const texte = document.getElementById(`precon-${g}`).value.trim();
      for (const sym of symboles) {
        const { error } = await sb.rpc('enregistrer_preconisation', {
          p_stagiaire_id: stagiaireId, p_symbole_code: sym, p_texte: texte,
        });
        if (error) throw error;
      }
    }
    fermerModale();
  } catch (e) { erreurSupabase('Enregistrement de la préconisation', e); }
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
  const [{ data: couverture }, { data: compte }, { count: nbAValider }, { data: doublons }] = await Promise.all([
    sb.from('v_couverture_banque').select('*').order('gabarit_code').order('theme_code'),
    sb.from('questions').select('theme_code, fondamentale, active'),
    sb.from('questions').select('id', { count: 'exact', head: true }).eq('a_valider', true),
    sb.rpc('questions_doublons_probables', { p_seuil: 0.5 }),
  ]);
  const nbDoublons = doublons?.length || 0;

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
        <label class="bouton-fichier" title="Déposer plusieurs images à la fois, nommées d'après le numéro de la question (ex: 42.jpg)">
          🖼 Importer des images en masse
          <input type="file" accept="image/*" multiple hidden onchange="importerImagesEnMasse(this)"></label>
        <button onclick="listerAValider()">Questions à relire${nbAValider ? ` (${nbAValider})` : ''}</button>
        <button onclick="listerDoublons()">Doublons probables${nbDoublons ? ` (${nbDoublons})` : ''}</button>
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
        <div class="enonce">
          <span class="puce" title="Numéro et famille de la question">${esc(codeAffiche(q))}</span>
          ${esc(q.enonce)}
          ${q.fondamentale ? '<span class="puce fond">fondamentale</span>' : ''}
          ${q.a_valider ? '<span class="puce alerte">à relire</span>' : '<span class="puce succes">validée</span>'}
          ${!q.active ? '<span class="puce">désactivée</span>' : ''}
          <button class="lien" title="Basculer à relire / validée"
            onclick="toggleAValider('${q.id}', ${!q.a_valider}, '${themeCode}')">${q.a_valider ? 'Marquer validée' : 'Marquer à relire'}</button>
          <button class="icone" title="Modifier" onclick="editerQuestion('${q.id}')">✎</button>
        </div>
        ${q.image_url ? `<img class="vignette-question" src="${esc(q.image_url)}" alt="Image de la question ${esc(codeAffiche(q))}">` : ''}
        <ul>${(q.question_reponses || []).sort((a, b) => a.position - b.position)
          .map(r => `<li class="${r.correcte ? 'bonne' : ''}">${r.correcte ? '✔' : '·'} ${esc(r.libelle)}</li>`).join('')}</ul>
      </li>`).join('') || '<i>Aucune question dans cette thématique.</i>'}</ol>
    <div class="pied-modale"><button onclick="fermerModale()">Fermer</button></div>`);
}

/* --------- Numérotation « Q{numéro}.{famille}.{thème} » (2026-08) ---------
 * La famille (NE / ELEC / COM) n'est jamais stockée : elle est recalculée
 * ici à partir du référentiel déjà en mémoire (S.referentiel), en miroir
 * exact de la fonction SQL question_famille() — même règle des deux côtés. */
function familleQuestion(q) {
  const gabaritsTheme = S.referentiel.quotas
    .filter(qt => qt.theme_code === q.theme_code && qt.nb > 0)
    .map(qt => qt.gabarit_code);
  let concernes = gabaritsTheme;
  if (q.symboles_cibles && q.symboles_cibles.length) {
    const accessibles = new Set();
    q.symboles_cibles.forEach(sym => (S.referentiel.gabaritsParSymbole[sym] || []).forEach(g => accessibles.add(g)));
    concernes = gabaritsTheme.filter(g => accessibles.has(g));
  }
  const familles = new Set(concernes.map(gc =>
    (S.referentiel.gabarits.find(g => g.code === gc) || {}).famille).filter(Boolean));
  if (familles.size === 0) return null;
  if (familles.size > 1) return 'COM';
  return [...familles][0] === 'non_elec' ? 'NE' : 'ELEC';
}

function codeAffiche(q) {
  const theme = S.referentiel.themes.find(t => t.code === q.theme_code);
  const court = theme?.code_court || q.theme_code;
  const fam = familleQuestion(q);
  return `Q${q.numero}` + (fam ? `.${fam}.${court}` : `.${court}`);
}

async function listerAValider() {
  const { data } = await sb.from('questions')
    .select('*, question_reponses(id, libelle, correcte, position)')
    .eq('a_valider', true).order('theme_code');
  if (!data?.length) return toast('Aucune question en attente de relecture');
  AVALIDER.donnees = data;

  const themesPresents = S.referentiel.themes.filter(t => data.some(q => q.theme_code === t.code));

  ouvrirModale(`Questions à relire (${data.length})`, `
    <p class="aide">Question classée automatiquement à l'import, ou remise "à relire" après
       correction d'une clé erronée pendant une session. Vérifie l'énoncé, les bonnes réponses
       et la thématique (menu déroulant), puis valide directement — pas besoin d'ouvrir la
       fiche complète sauf pour changer le texte ou les propositions elles-mêmes.</p>
    <div class="grille-3">
      <label>Recherche <input id="filtre-avalider-texte" type="search" placeholder="mot dans l'énoncé…"></label>
      <label>Thématique
        <select id="filtre-avalider-theme">
          <option value="">— toutes —</option>
          ${themesPresents.map(t => `<option value="${esc(t.code)}">${esc(t.libelle)}</option>`).join('')}
        </select></label>
      <label>Fondamentale
        <select id="filtre-avalider-fond">
          <option value="">— indifférent —</option>
          <option value="oui">Oui</option>
          <option value="non">Non</option>
        </select></label>
    </div>
    <ol class="copie" id="corps-a-valider"></ol>
    <p id="compte-avalider" class="aide"></p>
    <div class="pied-modale"><button onclick="fermerModale()">Fermer</button></div>`);

  ['filtre-avalider-texte', 'filtre-avalider-theme', 'filtre-avalider-fond']
    .forEach(id => $('#' + id).addEventListener('input', filtrerAValider));
  filtrerAValider();
}

// Filtrage 100% côté écran (2026-08-27, demande de Jeremy) : les questions
// à relire sont déjà toutes chargées en mémoire, inutile de refaire une
// requête à chaque frappe.
const AVALIDER = { donnees: [] };
function filtrerAValider() {
  const texte = ($('#filtre-avalider-texte')?.value || '').trim().toLowerCase();
  const theme = $('#filtre-avalider-theme')?.value || '';
  const fond = $('#filtre-avalider-fond')?.value || '';

  const visibles = AVALIDER.donnees.filter(q =>
    (!texte || q.enonce.toLowerCase().includes(texte))
    && (!theme || q.theme_code === theme)
    && (!fond || (fond === 'oui' ? q.fondamentale : !q.fondamentale)));

  // Énoncé complet + propositions (2026-08-27, 2e demande de Jeremy : il faut
  // voir toute la question pour la valider, pas juste un extrait tronqué) +
  // menu déroulant pour reclasser la thématique directement depuis la liste.
  $('#corps-a-valider').innerHTML = visibles.map(q => `<li id="ligne-avalider-${q.id}">
        <div class="enonce">${esc(q.enonce)}
          ${q.fondamentale ? '<span class="puce fond">fondamentale</span>' : ''}</div>
        ${q.image_url ? `<img class="vignette-question" src="${esc(q.image_url)}" alt="">` : ''}
        <ul>${(q.question_reponses || []).sort((a, b) => a.position - b.position)
          .map(r => `<li class="${r.correcte ? 'bonne' : ''}">${r.correcte ? '✔' : '·'} ${esc(r.libelle)}</li>`).join('')}</ul>
        <div class="ligne-actions-avalider">
          <label>Thématique
            <select id="theme-avalider-${q.id}">
              ${S.referentiel.themes.map(t => `<option value="${esc(t.code)}" ${t.code === q.theme_code ? 'selected' : ''}>${esc(t.libelle)}</option>`).join('')}
            </select></label>
          <button class="lien" onclick="editerQuestion('${q.id}')">Modifier</button>
          <button class="principal" onclick="validerRapide('${q.id}')">Valider</button>
        </div>
      </li>`).join('') || '<li class="vide">Aucune question ne correspond à ces filtres.</li>';
  $('#compte-avalider').textContent = `${visibles.length} / ${AVALIDER.donnees.length} question(s) affichée(s)`;
}


/* Validation rapide depuis la liste "à relire" (2026-08-27) : pas besoin
 * d'ouvrir la fiche complète quand l'énoncé est déjà correct en l'état —
 * pensé pour traiter le retard de relecture par petits lots. */
async function validerRapide(id) {
  try {
    const themeChoisi = document.getElementById(`theme-avalider-${id}`)?.value;
    const donnees = { a_valider: false, maj_le: new Date().toISOString() };
    if (themeChoisi) donnees.theme_code = themeChoisi;
    const { error } = await sb.from('questions').update(donnees).eq('id', id);
    if (error) throw error;
    AVALIDER.donnees = AVALIDER.donnees.filter(q => q.id !== id);
    document.getElementById(`ligne-avalider-${id}`)?.remove();
    if ($('#compte-avalider')) $('#compte-avalider').textContent =
      `${$$('#corps-a-valider li[id^="ligne-avalider-"]').length} / ${AVALIDER.donnees.length} question(s) affichée(s)`;
    toast('Question validée' + (themeChoisi ? ' — ' + esc(libelleTheme(themeChoisi)) : ''));
  } catch (e) { erreurSupabase('Validation de la question', e); }
}

/* --------- Doublons probables (2026-08-27, demande de Jeremy) ---------
 * Repère les énoncés très proches (similarité trigramme côté SQL, voir
 * questions_doublons_probables) pour accélérer la relecture des ~200
 * questions en attente — beaucoup sont des reformulations quasi
 * identiques venues de l'import Moodle + de la génération en masse.
 *
 * 2026-08-27 (bis) : certaines paires ne sont PAS des erreurs à corriger
 * mais des doublons volontaires (même question déclinée dans plusieurs
 * thématiques pour compter dans leurs quotas respectifs) — bouton "Lier"
 * pour les rattacher entre elles (habelec.lier_questions) : la fonction
 * SQL les exclut ensuite définitivement de cette liste, et toute future
 * modification de l'une se répercute automatiquement sur l'autre.
 * Affiche aussi l'énoncé complet + les réponses de chaque exemplaire,
 * pour contrôler sans avoir à ouvrir chaque question une par une. */
async function listerDoublons() {
  let paires;
  try { paires = await rpc('questions_doublons_probables', { p_seuil: 0.5 }); }
  catch (e) { return erreurSupabase('Détection des doublons', e); }
  if (!paires?.length) return toast('Aucun doublon probable détecté (hors questions déjà liées)');

  const carte = q => `
    <div class="enonce">${esc(q.enonce)}
      ${q.fondamentale ? '<span class="puce fond">fondamentale</span>' : ''}</div>
    ${q.image_url ? `<img class="vignette-question" src="${esc(q.image_url)}" alt="">` : ''}
    <ul>${(q.reponses || []).map(r => `<li class="${r.correcte ? 'bonne' : ''}">${r.correcte ? '✔' : '·'} ${esc(r.libelle)}</li>`).join('')}</ul>`;

  ouvrirModale(`Doublons probables (${paires.length})`, `
    <p class="aide">Deux questions dont l'énoncé se ressemble beaucoup — classées par
       ressemblance décroissante. Une ressemblance de 100% = énoncés identiques.
       Si c'est une erreur (même question par mégarde), désactive celle qui fait doublon.
       Si c'est volontaire (même question déclinée dans plusieurs thématiques), clique
       "Lier" : elles n'apparaîtront plus ici, et modifier l'une mettra l'autre à jour
       automatiquement (sauf la thématique, propre à chacune).</p>
    <table class="tableau"><thead><tr><th>Ressemblance</th><th>Question A</th><th>Question B</th></tr></thead>
      <tbody>${paires.map(p => `<tr id="ligne-doublon-${p.id_a}-${p.id_b}">
        <td><b>${Math.round(p.similarite * 100)}%</b></td>
        <td>${esc(codeAffiche({ numero: p.numero_a, theme_code: p.theme_a }))}
          ${carte({ enonce: p.enonce_a, fondamentale: p.fondamentale_a, image_url: p.image_a, reponses: p.reponses_a })}
          <button class="lien" onclick="editerQuestion('${p.id_a}')">Ouvrir</button>
          <button class="lien" onclick="desactiverDoublon('${p.id_a}', '${p.id_b}')">Désactiver celle-ci</button>
          <button class="lien" onclick="supprimerDoublon('${p.id_a}', '${p.id_b}')">Supprimer</button></td>
        <td>${esc(codeAffiche({ numero: p.numero_b, theme_code: p.theme_b }))}
          ${carte({ enonce: p.enonce_b, fondamentale: p.fondamentale_b, image_url: p.image_b, reponses: p.reponses_b })}
          <button class="lien" onclick="editerQuestion('${p.id_b}')">Ouvrir</button>
          <button class="lien" onclick="desactiverDoublon('${p.id_b}', '${p.id_a}')">Désactiver celle-ci</button>
          <button class="lien" onclick="supprimerDoublon('${p.id_b}', '${p.id_a}')">Supprimer</button></td>
      </tr><tr id="ligne-doublon-actions-${p.id_a}-${p.id_b}"><td></td>
        <td colspan="2">
          ${p.theme_a === p.theme_b
            ? '<span class="aide">Même thématique des deux côtés : probablement un vrai doublon à désactiver ci-dessus, pas à lier.</span>'
            : `<button class="principal" onclick="lierPaireDoublon('${p.id_a}', '${p.id_b}')">
                 Lier (pas un doublon — même question dans deux thématiques)</button>`}
          <button class="lien" onclick="ignorerPaireDoublon('${p.id_a}', '${p.id_b}')">
            Ce n'est pas un doublon (contenu différent)</button>
        </td>
      </tr>`).join('')}</tbody></table>
    <div class="pied-modale"><button onclick="fermerModale()">Fermer</button></div>`);
}

async function desactiverDoublon(idADesactiver, idAutre) {
  if (!confirmer('Désactiver cette question ? Elle ne sera plus utilisée dans les tirages, '
    + 'mais reste consultable dans la banque.')) return;
  try {
    const { error } = await sb.from('questions')
      .update({ active: false, maj_le: new Date().toISOString() }).eq('id', idADesactiver);
    if (error) throw error;
    document.getElementById(`ligne-doublon-${idADesactiver}-${idAutre}`)?.remove();
    document.getElementById(`ligne-doublon-${idAutre}-${idADesactiver}`)?.remove();
    document.getElementById(`ligne-doublon-actions-${idADesactiver}-${idAutre}`)?.remove();
    document.getElementById(`ligne-doublon-actions-${idAutre}-${idADesactiver}`)?.remove();
    toast('Question désactivée');
  } catch (e) { erreurSupabase('Désactivation de la question', e); }
}

/* 2026-08-27 : suppression définitive depuis "Doublons probables" — utile
 * pour un vrai doublon jamais encore utilisé dans un examen (sinon la base
 * refuse la suppression : une question déjà tirée dans une copie doit être
 * désactivée, pas supprimée, pour ne pas casser l'historique). Réservé aux
 * administrateurs (policy contenu_suppr). */
async function supprimerDoublon(idASupprimer, idAutre) {
  if (!confirmer('Supprimer DÉFINITIVEMENT cette question ? Contrairement à "Désactiver", '
    + 'impossible de revenir en arrière. Si elle a déjà servi dans une copie, la suppression '
    + 'sera refusée automatiquement — utilise "Désactiver celle-ci" dans ce cas.')) return;
  try {
    const { error } = await sb.from('questions').delete().eq('id', idASupprimer);
    if (error) {
      if (error.code === '23503') {
        return toast('Impossible : cette question a déjà été utilisée dans une copie — '
          + 'désactive-la plutôt (bouton "Désactiver celle-ci").', 'erreur');
      }
      throw error;
    }
    document.getElementById(`ligne-doublon-${idASupprimer}-${idAutre}`)?.remove();
    document.getElementById(`ligne-doublon-${idAutre}-${idASupprimer}`)?.remove();
    document.getElementById(`ligne-doublon-actions-${idASupprimer}-${idAutre}`)?.remove();
    document.getElementById(`ligne-doublon-actions-${idAutre}-${idASupprimer}`)?.remove();
    toast('Question supprimée');
  } catch (e) { erreurSupabase('Suppression de la question', e); }
}

async function lierPaireDoublon(idA, idB) {
  if (!confirmer('Lier ces deux questions ? Toute modification future de l\'une (énoncé, '
    + 'réponses, explication, image, fondamentale) sera automatiquement recopiée sur l\'autre. '
    + 'Seule la thématique reste propre à chacune. Elles n\'apparaîtront plus dans les doublons.')) return;
  try {
    const { error } = await sb.rpc('lier_questions', { p_id_a: idA, p_id_b: idB });
    if (error) throw error;
    document.getElementById(`ligne-doublon-${idA}-${idB}`)?.remove();
    document.getElementById(`ligne-doublon-actions-${idA}-${idB}`)?.remove();
    toast('Questions liées');
  } catch (e) { erreurSupabase('Liaison des questions', e); }
}

/* 2026-08-27 : certaines paires se ressemblent en surface (même début
 * d'énoncé générique, ex: "Le B1V doit :") sans être ni un doublon à
 * corriger, ni la même question à lier entre deux thématiques — juste
 * une coïncidence de formulation. Ce bouton écarte la paire définitivement
 * de cette liste, sans toucher aux deux questions. */
async function ignorerPaireDoublon(idA, idB) {
  try {
    const { error } = await sb.rpc('ignorer_doublon', { p_id_a: idA, p_id_b: idB });
    if (error) throw error;
    document.getElementById(`ligne-doublon-${idA}-${idB}`)?.remove();
    document.getElementById(`ligne-doublon-actions-${idA}-${idB}`)?.remove();
    toast('Paire écartée des doublons probables');
  } catch (e) { erreurSupabase('Mise à l\'écart de la paire', e); }
}

/* Bascule à relire / validée depuis la liste par thématique (2026-08-27) :
 * marquer une question à retraiter plus tard, indépendamment de toute
 * modification de son contenu — demande de Jeremy. */
async function toggleAValider(id, aValider, themeCode) {
  try {
    const { error } = await sb.from('questions').update({ a_valider: aValider, maj_le: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    toast(aValider ? 'Question marquée à relire' : 'Question marquée validée');
    await listerQuestions(themeCode);
  } catch (e) { erreurSupabase('Mise à jour de la question', e); }
}

async function editerQuestion(id) {
  let q = { theme_code: S.referentiel.themes[0]?.code, enonce: '', explication: '',
            fondamentale: false, active: true, reponses: [{ libelle: '', correcte: true }, { libelle: '', correcte: false }] };
  if (id) {
    const { data } = await sb.from('questions')
      .select('*, question_reponses(id, libelle, correcte, position)').eq('id', id).single();
    q = { ...data, reponses: (data.question_reponses || []).sort((a, b) => a.position - b.position) };
  }

  ouvrirModale(id ? `Modifier la question ${esc(codeAffiche(q))}` : 'Nouvelle question', `
    <form id="form-question" class="formulaire">
      <label>Thématique
        <select name="theme">${S.referentiel.themes.map(t =>
          `<option value="${t.code}" ${t.code === q.theme_code ? 'selected' : ''}>${esc(t.libelle)}</option>`).join('')}
        </select></label>
      ${id ? `<label>Image (facultative)
        ${q.image_url ? `<img class="vignette-question" src="${esc(q.image_url)}" alt="">` : '<i>Aucune image.</i>'}
        <input type="file" accept="image/*" onchange="televerserImageQuestion('${id}', this)"></label>` : ''}
      <label>Énoncé <textarea name="enonce" rows="2" required>${esc(q.enonce)}</textarea></label>
      <label>Explication affichée à la correction (facultatif)
        <textarea name="explication" rows="2">${esc(q.explication)}</textarea></label>
      <label class="case"><input type="checkbox" name="fondamentale" ${q.fondamentale ? 'checked' : ''}>
        Question fondamentale (son échec invalide le titre)</label>
      <label class="case"><input type="checkbox" name="active" ${q.active !== false ? 'checked' : ''}>
        Question active (utilisable dans les tirages)</label>
      <label class="case"><input type="checkbox" name="a_valider" ${q.a_valider ? 'checked' : ''}>
        Encore à relire (laisse coché si tu veux la retraiter plus tard malgré cet enregistrement)</label>
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
      a_valider: f.a_valider.checked,
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
      toast('Question enregistrée');
      // On reste sur la liste de la thématique (plutôt que de revenir au tableau
      // général de la banque) : plus ergonomique pour relire/classer en série.
      rendreBanque($('#contenu'));
      await listerQuestions(donnees.theme_code);
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

/* --------------------- Images des questions (2026-08) --------------------- */
async function televerserImageQuestion(questionId, input) {
  const fichier = input.files?.[0];
  if (!fichier) return;
  try {
    const url = await deposerImageQuestion(questionId, fichier);
    const { error } = await sb.from('questions').update({ image_url: url }).eq('id', questionId);
    if (error) throw error;
    toast('Image enregistrée');
    editerQuestion(questionId);
  } catch (e) { erreurSupabase('Import de l\'image', e); }
}

/** Dépose un fichier dans le bucket question-images sous un nom stable
 * (numéro de question + extension), avec upsert pour permettre le remplacement. */
async function deposerImageQuestion(questionId, fichier, numero) {
  const ext = (fichier.name.split('.').pop() || 'jpg').toLowerCase();
  const chemin = `${numero ?? questionId}.${ext}`;
  const { error } = await sb.storage.from('question-images')
    .upload(chemin, fichier, { upsert: true, cacheControl: '3600' });
  if (error) throw error;
  const { data } = sb.storage.from('question-images').getPublicUrl(chemin);
  return data.publicUrl + '?v=' + Date.now(); // évite le cache navigateur après remplacement
}

/** Import en masse : chaque fichier déposé doit être nommé d'après le numéro
 * de la question à illustrer (ex: "42.jpg", "Q42.png", "42 - schéma.jpg" —
 * seuls les chiffres en tête du nom sont lus). */
async function importerImagesEnMasse(input) {
  const fichiers = [...(input.files || [])];
  if (!fichiers.length) return;

  const { data: questions, error } = await sb.from('questions').select('id, numero');
  if (error) return erreurSupabase('Import en masse — lecture des numéros', error);
  const parNumero = Object.fromEntries((questions || []).map(q => [String(q.numero), q.id]));

  let ok = 0; const echecs = [];
  for (const fichier of fichiers) {
    const m = fichier.name.match(/^\D*(\d+)/);
    const numero = m ? m[1] : null;
    const questionId = numero && parNumero[numero];
    if (!questionId) { echecs.push(fichier.name); continue; }
    try {
      const url = await deposerImageQuestion(questionId, fichier, numero);
      const { error: errMaj } = await sb.from('questions').update({ image_url: url }).eq('id', questionId);
      if (errMaj) throw errMaj;
      ok++;
    } catch (e) { DEBUG.erreur('import image ' + fichier.name, e.message); echecs.push(fichier.name); }
  }
  input.value = '';
  toast(`${ok} image(s) importée(s)` + (echecs.length ? `, ${echecs.length} non associée(s) : ${echecs.join(', ')}` : ''),
    echecs.length ? 'erreur' : 'ok', 8000);
}

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
/* ---------------- Onglet Titres (admin) : réglage des MSP par titre ---- */
async function rendreTitres(zone) {
  const gabarits = [...(S.referentiel.gabarits || [])].sort((a, b) => a.code.localeCompare(b.code));
  zone.innerHTML = `
    <div class="barre-actions"><h2>Titres — mises en situation pratiques</h2>
      <button onclick="gererCatalogueCriteres()">📋 Catalogue des critères (E1-E15 / NE1-NE12)</button>
    </div>
    <p class="aide">Par défaut, chaque titre demande <b>1 mise en situation obligatoire</b> ;
       si elle échoue, <b>1 mise en situation de rattrapage</b> est proposée. Le titre est
       validé dès que l'une des deux (obligatoire ou rattrapage) est conforme. Ces deux
       nombres sont réglables ici, par titre.</p>
    <table class="tableau">
      <thead><tr><th>Titre</th><th>MSP obligatoire(s)</th><th>MSP de rattrapage</th><th>Critères évalués</th><th></th></tr></thead>
      <tbody>${gabarits.map(g => {
        const n = (S.referentiel.savoirFaire || []).filter(sf => sf.gabarit_code === g.code).length;
        const total = (S.referentiel.criteres || []).filter(c => c.famille === g.famille).length;
        return `
        <tr data-gabarit="${esc(g.code)}">
          <td>${esc(g.libelle)}</td>
          <td><input type="number" min="1" max="9" style="width:4em"
                value="${g.mises_en_situation_min}" data-champ="mises_en_situation_min"></td>
          <td><input type="number" min="0" max="9" style="width:4em"
                value="${g.mises_en_situation_rattrapage}" data-champ="mises_en_situation_rattrapage"></td>
          <td>${n}/${total} <button class="lien" onclick="gererCriteresGabarit('${esc(g.code)}')">Gérer</button></td>
          <td><button class="lien" onclick="enregistrerTitre('${esc(g.code)}')">Enregistrer</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

/* ---------- Critères pratiques par titre (2026-08) ---------------------
 * gabarit_savoir_faire est un sous-ensemble éditable du catalogue national
 * criteres_savoir_faire (E1..E15 / NE1..NE12) : quels critères comptent
 * réellement pour CE titre, réglable ici plutôt que figé dans le code. */
async function gererCriteresGabarit(gabaritCode) {
  const g = S.referentiel.gabarits.find(x => x.code === gabaritCode);
  const catalogue = (S.referentiel.criteres || []).filter(c => c.famille === g.famille)
    .sort((a, b) => a.numero - b.numero);
  const retenus = new Set((S.referentiel.savoirFaire || [])
    .filter(sf => sf.gabarit_code === gabaritCode).map(sf => sf.critere_code));

  ouvrirModale(`Critères pratiques — ${esc(g.libelle)}`, `
    <p class="aide">Coche les critères réellement évalués pour ce titre. Les autres
       critères du catalogue ${g.famille === 'elec' ? 'élec (E1-E15)' : 'non élec (NE1-NE12)'}
       ne seront pas proposés dans la grille de notation.</p>
    <form id="form-criteres-gabarit">
      ${catalogue.map(c => `<label class="case">
        <input type="checkbox" value="${esc(c.code)}" ${retenus.has(c.code) ? 'checked' : ''}>
        <span class="puce">${esc(c.code)}</span> ${esc(c.libelle)}</label>`).join('')}
      <div class="pied-modale">
        <button type="button" onclick="fermerModale()">Annuler</button>
        <button type="submit" class="principal">Enregistrer</button>
      </div>
    </form>`);

  $('#form-criteres-gabarit').addEventListener('submit', async ev => {
    ev.preventDefault();
    const codes = $$('#form-criteres-gabarit input:checked').map(i => i.value);
    if (!codes.length) return toast('Il faut garder au moins un critère', 'erreur');
    try {
      await sb.from('gabarit_savoir_faire').delete().eq('gabarit_code', gabaritCode);
      const { error } = await sb.from('gabarit_savoir_faire').insert(
        codes.map(code => ({
          gabarit_code: gabaritCode, critere_code: code,
          position: catalogue.find(c => c.code === code).numero,
        })));
      if (error) throw error;
      fermerModale();
      toast('Critères mis à jour pour ce titre');
      await chargerReferentiel();
      rendreTitres($('#contenu'));
    } catch (e) { erreurSupabase('Enregistrement des critères', e); }
  });
}

async function gererCatalogueCriteres() {
  const parFamille = { elec: [], non_elec: [] };
  (S.referentiel.criteres || []).forEach(c => parFamille[c.famille]?.push(c));
  Object.values(parFamille).forEach(l => l.sort((a, b) => a.numero - b.numero));

  ouvrirModale('Catalogue des critères pratiques', `
    <p class="aide">Ce catalogue est national (2 listes fixes : élec E1-E15, non élec NE1-NE12).
       Modifier un libellé ici le change partout où ce critère est utilisé.</p>
    <form id="form-catalogue">
      ${['elec', 'non_elec'].map(fam => `
        <fieldset><legend>${fam === 'elec' ? 'Électricien (E1-E15)' : 'Non électricien (NE1-NE12)'}</legend>
          ${parFamille[fam].map(c => `<label style="display:block;margin:6px 0">
            <span class="puce">${esc(c.code)}</span>
            <input type="text" style="width:80%" value="${esc(c.libelle)}" data-code="${esc(c.code)}"></label>`).join('')}
        </fieldset>`).join('')}
      <div class="pied-modale">
        <button type="button" onclick="fermerModale()">Annuler</button>
        <button type="submit" class="principal">Enregistrer</button>
      </div>
    </form>`);

  $('#form-catalogue').addEventListener('submit', async ev => {
    ev.preventDefault();
    try {
      for (const input of $$('#form-catalogue input[data-code]')) {
        const libelle = input.value.trim();
        if (!libelle) continue;
        const { error } = await sb.from('criteres_savoir_faire')
          .update({ libelle }).eq('code', input.dataset.code);
        if (error) throw error;
      }
      fermerModale();
      toast('Catalogue mis à jour');
      await chargerReferentiel();
      rendreTitres($('#contenu'));
    } catch (e) { erreurSupabase('Enregistrement du catalogue', e); }
  });
}

async function enregistrerTitre(code) {
  const ligne = document.querySelector(`tr[data-gabarit="${CSS.escape(code)}"]`);
  const min = parseInt(ligne.querySelector('[data-champ=mises_en_situation_min]').value, 10);
  const rattrapage = parseInt(ligne.querySelector('[data-champ=mises_en_situation_rattrapage]').value, 10);
  if (!min || min < 1) return toast('Il faut au moins 1 mise en situation obligatoire', 'erreur');
  const { error } = await sb.from('gabarits')
    .update({ mises_en_situation_min: min, mises_en_situation_rattrapage: rattrapage || 0 })
    .eq('code', code);
  if (error) return erreurSupabase('Enregistrement du titre', error);
  toast('Titre enregistré');
  await chargerReferentiel();
}

// 2026-08-28 (compte de service Drive) : lit juste l'adresse email du
// compte de service dans la clé JSON collée, pour affichage dans l'onglet
// Organisme (aide Jeremy à savoir avec quelle adresse partager le dossier).
function extraireEmailCompteService(json) {
  try { return JSON.parse(json).client_email || ''; } catch { return ''; }
}

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
      <fieldset><legend>Signature du représentant de l'organisme (apposée automatiquement sur
        l'avis d'habilitation — pas sur le titre, que l'employeur signe à la main)</legend>
        ${widgetSignature('signature-organisme', o.signature_data)}
      </fieldset>
      <fieldset><legend>Cachet de l'organisme (apposé automatiquement sur l'avis d'habilitation)</legend>
        ${widgetImage('cachet-organisme', o.cachet_data)}
      </fieldset>
      <fieldset><legend>Questions fondamentales</legend>
        <label class="case"><input type="checkbox" name="fondamentales_actives" ${o.fondamentales_actives === false ? '' : 'checked'}>
          Activer les questions fondamentales (échec = titre non validé, badge affiché au stagiaire pendant l'examen)</label>
        <p class="aide">Décoche pour désactiver entièrement les questions fondamentales pour cet organisme :
          elles ne seront plus exigées pour valider un titre, et le badge "Question fondamentale" ne
          s'affichera plus pendant la passation. S'applique à toutes les sessions.</p>
      </fieldset>
      <fieldset><legend>Sauvegarde automatique sur Google Drive (compte de service) — un
        dossier par session, avec les PDF des stagiaires et un fichier session.json
        réimportable en cas de purge</legend>
        <label>Clé JSON du compte de service Google
          <textarea name="drive_service_account_json" rows="3" placeholder="${o.drive_service_account_json ? '•••••••• (déjà enregistrée, laisser vide pour garder)' : 'Colle ici tout le contenu du fichier JSON téléchargé'}"></textarea>
        </label>
        <label>ID du dossier Drive racine
          <input name="drive_dossier_racine_id" value="${esc(o.drive_dossier_racine_id)}"
            placeholder="ex : 1AbCdEfGhIjKlmnOpQrSt (dans l'URL du dossier, après /folders/)"></label>
        <p class="aide">1. Dans <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank">Google Cloud Console → Comptes de service</a>,
          crée un compte de service, génère une clé JSON et colle tout son contenu ci-dessus.
          2. Crée un dossier dans ton Google Drive, clique "Partager" et ajoute l'adresse email
          du compte de service (visible dans le fichier JSON, champ "client_email") en Éditeur.
          3. Colle l'ID de ce dossier ci-dessus (dans son URL, après /folders/). Pas d'écran de
          consentement à valider : ça fonctionne dès l'enregistrement de ce formulaire.</p>
        <p>Statut : ${o.drive_service_account_json
          ? '<span style="color:var(--vert);font-weight:700">✅ Configuré</span>' + (extraireEmailCompteService(o.drive_service_account_json) ? ` — compte de service : <code>${esc(extraireEmailCompteService(o.drive_service_account_json))}</code>` : '')
          : '<span style="color:var(--rouge);font-weight:700">◻️ Non configuré</span>'}</p>
      </fieldset>
      <button class="principal" type="submit">Enregistrer</button>
    </form>`;

  activerSignature('signature-organisme');
  activerImage('cachet-organisme');
  $('#form-organisme').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const driveJsonSaisi = f.drive_service_account_json.value.trim();
    const donnees = {
      raison_sociale: f.raison_sociale.value.trim(),
      adresse: f.adresse.value.trim(),
      signataire_nom: f.signataire_nom.value.trim(),
      signataire_fonction: f.signataire_fonction.value.trim(),
      validite_annees: parseInt(f.validite_annees.value, 10) || 3,
      signature_data: lireSignature('signature-organisme'),
      cachet_data: lireImage('cachet-organisme'),
      drive_dossier_racine_id: f.drive_dossier_racine_id.value.trim() || null,
      fondamentales_actives: f.fondamentales_actives.checked,
    };
    // La clé JSON ne se réaffiche jamais (juste un repère en placeholder) —
    // on ne réécrit donc la colonne que si l'utilisateur a effectivement
    // recollé quelque chose (2026-08-28).
    if (driveJsonSaisi) {
      donnees.drive_service_account_json = driveJsonSaisi;
    }
    const { error } = await sb.from('organismes').update(donnees).eq('id', o.id);
    if (error) return erreurSupabase('Enregistrement', error);
    toast('Organisme enregistré');
    await chargerProfil();
  });
}

/* ============ 8 ter. Onglet Mon compte (tout formateur) ===============
 * Demande de Jeremy (2026-08-27) : chaque formateur enregistre sa propre
 * signature une fois, apposée automatiquement sur chaque avis d'habilitation
 * qu'il émet ensuite (S.profil.signature_data, lu dans genererTitrePdf) —
 * plus besoin de signer à la main à chaque avis. Accessible à tout
 * formateur authentifié (pas réservé à l'admin, chacun gère la sienne) ;
 * la policy form_self existante autorise déjà cette écriture. */
async function rendreMonCompte(zone) {
  const p = S.profil || {};
  zone.innerHTML = `
    <div class="barre-actions"><h2>Mon compte</h2></div>
    <form id="form-mon-compte" class="formulaire carte">
      <p>${esc(p.nom || '')} ${esc(p.prenom || '')} — ${esc(S.utilisateur?.email || '')}</p>
      <fieldset><legend>Ma signature (apposée automatiquement sur chaque avis d'habilitation
        que je délivre)</legend>
        ${widgetSignature('signature-formateur', p.signature_data)}
      </fieldset>
      <button class="principal" type="submit">Enregistrer</button>
    </form>`;

  activerSignature('signature-formateur');
  $('#form-mon-compte').addEventListener('submit', async ev => {
    ev.preventDefault();
    const { error } = await sb.from('formateurs').update({
      signature_data: lireSignature('signature-formateur'),
    }).eq('id', p.id);
    if (error) return erreurSupabase('Enregistrement', error);
    toast('Signature enregistrée');
    await chargerProfil();
  });
}

/* ============ 8 bis. Onglet Vérification (admin) ======================
 * Liste des titres délivrés avec leur numéro d'authenticité (HE-AAAA-
 * <n° session Galaxy>-NNN, voir patch_2026-08-26) + export Excel destiné
 * à alimenter la base externe de vérification consultée par les employeurs.
 * Demande de Jeremy (2026-08-26). Portée par la vue v_titres_verification
 * (RLS : même périmètre organisme que partout ailleurs). */
async function rendreVerification(zone) {
  zone.innerHTML = '<p class="chargement">Chargement des titres délivrés…</p>';
  const { data, error } = await sb.from('v_titres_verification').select('*')
    .order('delivre_le', { ascending: false });
  if (error) return erreurSupabase('Lecture des titres délivrés', error);

  S._titresVerification = data || [];
  afficherVerification(zone, '');

  zone.addEventListener('input', ev => {
    if (ev.target.id !== 'recherche-verification') return;
    afficherVerification(zone, ev.target.value);
    // Réaffiché en entier (innerHTML) à chaque frappe => on remet le focus
    // et le curseur en fin de texte, sinon le champ perd le focus.
    const champ = document.getElementById('recherche-verification');
    champ.focus();
    champ.setSelectionRange(champ.value.length, champ.value.length);
  });
}

function afficherVerification(zone, filtre) {
  const f = (filtre || '').trim().toLowerCase();
  const tout = S._titresVerification || [];
  const data = !f ? tout : tout.filter(t => [
    t.numero, t.nom, t.prenom, t.session, t.numero_session_galaxy,
  ].some(champ => (champ || '').toLowerCase().includes(f)));

  zone.innerHTML = `
    <div class="barre-actions"><h2>Vérification d'authenticité</h2>
      <button onclick="exporterTitresVerification()">⬇️ Exporter en Excel (${data.length})</button>
    </div>
    <p class="aide">Chaque titre délivré porte un numéro unique (ex. HE-2026-4521-001), imprimé sur
      l'avis et sur le titre remis au stagiaire. Cet export alimente la base externe de vérification
      d'authenticité consultée par les employeurs — à réexporter et retransmettre après chaque session.</p>
    <input type="search" id="recherche-verification" placeholder="Rechercher (nom, n° de vérification, session...)"
      value="${esc(filtre || '')}" style="margin-bottom:10px;max-width:340px">
    <table class="tableau">
      <thead><tr><th>N° de vérification</th><th>Nom</th><th>Prénom</th><th>Session</th>
        <th>N° session Galaxy</th><th>Date de délivrance</th><th>À recycler avant</th><th></th></tr></thead>
      <tbody>${data.map(t => `
        <tr>
          <td>${esc(t.numero)}</td>
          <td>${esc(t.nom)}</td>
          <td>${esc(t.prenom)}</td>
          <td>${esc(t.session || '—')}</td>
          <td>${esc(t.numero_session_galaxy || '—')}</td>
          <td>${dateFr(t.delivre_le)}</td>
          <td>${dateFr(t.recycler_avant)}</td>
          <td><button class="icone" title="Purger ce titre (test, doublon...)"
                onclick="purgerTitreVerification('${t.id}')">🗑</button></td>
        </tr>`).join('') || '<tr><td colspan="8" class="vide">Aucun titre ne correspond.</td></tr>'}
      </tbody>
    </table>`;
}

async function purgerTitreVerification(id) {
  const t = (S._titresVerification || []).find(x => x.id === id);
  if (!confirm(`Purger définitivement le titre ${t?.numero || ''} (${t?.nom || ''} ${t?.prenom || ''}) ?\n\n`
    + 'Cette suppression est définitive — à réserver aux titres de test.')) return;
  const { error } = await sb.from('titres_habilitation').delete().eq('id', id);
  if (error) return erreurSupabase('Purge du titre', error);
  S._titresVerification = (S._titresVerification || []).filter(x => x.id !== id);
  toast('Titre purgé');
  afficherVerification($('#contenu'), document.getElementById('recherche-verification')?.value || '');
}

function exporterTitresVerification() {
  const data = S._titresVerification || [];
  if (!data.length) return toast('Rien à exporter');
  const lignes = data.map(t => ({
    'Numéro de vérification': t.numero,
    'Nom': t.nom,
    'Prénom': t.prenom,
    'Organisme': t.organisme,
    'Session': t.session,
    'N° session Galaxy': t.numero_session_galaxy,
    'Symboles': (t.symboles || []).join(', '),
    'Date de délivrance': dateFr(t.delivre_le),
    'À recycler avant': dateFr(t.recycler_avant),
  }));
  const ws = XLSX.utils.json_to_sheet(lignes);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Titres');
  XLSX.writeFile(wb, `export_verification_titres_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast('Export généré');
}

/* ============ 9. Onglet Comptes (admin) ============================= */
/* Rattache un compte auth.users déjà créé (Portail, ou une autre brique
 * Univers BFS) à Habelec, avec un rôle. Ne crée jamais de compte
 * auth.users lui-même — voir MEMOIRE_PROJET.md, la création du compte
 * brut est centralisée côté Portail. Idempotent côté serveur : cet écran
 * peut être soumis plusieurs fois sans risque d'écraser un formateur déjà
 * rattaché. */
async function rendreComptes(zone) {
  zone.innerHTML = '<p class="chargement">Chargement des comptes…</p>';
  const [{ data: formateurs, error: err1 }, { data: organismes, error: err2 }, comptesDisponibles] = await Promise.all([
    sb.from('formateurs').select('*, organismes(raison_sociale)').order('email'),
    sb.from('organismes').select('id, raison_sociale').order('raison_sociale'),
    // Comptes de tout l'Univers BFS pas encore rattachés à Habelec (2026-08-27,
    // demande de Jeremy) — pour le menu déroulant, évite la saisie manuelle.
    rpc('lister_comptes_univers_bfs').catch(e => { erreurSupabase('Liste des comptes disponibles', e); return []; }),
  ]);
  if (err1) return erreurSupabase('Lecture des comptes', err1);
  if (err2) return erreurSupabase('Lecture des organismes', err2);

  const optionsOrganisme = (organismes || []).map(o => `<option value="${esc(o.id)}">${esc(o.raison_sociale)}</option>`).join('');

  zone.innerHTML = `
    <div class="barre-actions"><h2>Comptes</h2></div>
    <p class="aide">Rattache ici un compte qui existe déjà quelque part dans
       l'Univers BFS (créé via le Portail, ou sur une autre application) à
       Habelec. Le compte doit déjà exister : ce premier formulaire ne crée
       aucun compte <code>auth.users</code>, il ajoute seulement une ligne
       dans <code>formateurs</code> pour l'autoriser ici.</p>
    <form id="form-rattacher-compte" class="formulaire carte">
      <div class="grille-2">
        <label>Compte existant (Univers BFS)
          <select id="select-compte-existant">
            <option value="">— choisir dans la liste, ou saisir un email ci-dessous —</option>
            ${(comptesDisponibles || []).map(c => `<option value="${esc(c.email)}">${esc(c.email)}</option>`).join('')}
          </select></label>
        <label>Email du compte à rattacher
          <input name="email" type="email" required autocomplete="off"></label>
        <label>Rôle
          <select name="role">
            <option value="formateur">Formateur</option>
            <option value="admin">Administrateur</option>
          </select></label>
        <label>Nom <input name="nom"></label>
        <label>Prénom <input name="prenom"></label>
        <label>Organisme
          <select name="organisme_id">
            <option value="">— aucun —</option>
            ${optionsOrganisme}
          </select></label>
      </div>
      <button class="principal" type="submit">Rattacher</button>
    </form>

    <h3>Formateur externe à BFS (compte à créer)</h3>
    <p class="aide">Réservé à quelqu'un qui n'utilisera jamais aucune autre application de
       l'Univers BFS — sinon, fais-le créer via le Portail puis rattache-le ci-dessus.
       Un email d'invitation est envoyé à la personne pour qu'elle choisisse elle-même
       son mot de passe ; aucun mot de passe n'est généré ni affiché ici.</p>
    <form id="form-creer-externe" class="formulaire carte">
      <div class="grille-2">
        <label>Email <input name="email" type="email" required autocomplete="off"></label>
        <label>Rôle
          <select name="role">
            <option value="formateur">Formateur</option>
            <option value="admin">Administrateur</option>
          </select></label>
        <label>Nom <input name="nom" required></label>
        <label>Prénom <input name="prenom"></label>
        <label>Organisme
          <select name="organisme_id">
            <option value="">— aucun —</option>
            ${optionsOrganisme}
          </select></label>
      </div>
      <button class="principal" type="submit">Créer le compte et l'inviter</button>
    </form>

    <table class="tableau">
      <thead><tr><th>Email</th><th>Nom</th><th>Rôle</th><th>Organisme</th><th>Rattaché le</th></tr></thead>
      <tbody>${(formateurs || []).map(f => `
        <tr>
          <td>${esc(f.email)}</td>
          <td>${esc([f.prenom, f.nom].filter(Boolean).join(' '))}</td>
          <td>${f.role === 'admin' ? 'Administrateur' : 'Formateur'}</td>
          <td>${esc(f.organismes?.raison_sociale || '—')}</td>
          <td>${dateFr(f.cree_le)}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="vide">Aucun compte rattaché pour le moment.</td></tr>'}
      </tbody>
    </table>`;

  $('#select-compte-existant').addEventListener('change', ev => {
    if (ev.target.value) $('#form-rattacher-compte input[name="email"]').value = ev.target.value;
  });

  $('#form-rattacher-compte').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const email = f.email.value.trim();
    try {
      const [resultat] = await rpc('rattacher_formateur_par_email', {
        p_email:        email,
        p_nom:          f.nom.value.trim() || null,
        p_prenom:       f.prenom.value.trim() || null,
        p_role:         f.role.value,
        p_organisme_id: f.organisme_id.value || null,
      });
      toast(resultat.deja_existant
        ? `${email} était déjà rattaché à Habelec — rien n'a été modifié`
        : `${email} rattaché à Habelec`);
      f.reset();
      rendreComptes($('#contenu'));
    } catch (e) { erreurSupabase('Rattachement du compte', e); }
  });

  $('#form-creer-externe').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const email = f.email.value.trim();
    const bouton = f.querySelector('button');
    bouton.disabled = true;
    try {
      // Edge Function dédiée (2026-08-27) : seul endroit détenant la clé
      // service_role côté Habelec — jamais dans ce fichier JS.
      const { data, error } = await sb.functions.invoke('habelec-creer-formateur-externe', {
        body: {
          email,
          nom:           f.nom.value.trim(),
          prenom:        f.prenom.value.trim() || null,
          role:          f.role.value,
          organisme_id:  f.organisme_id.value || null,
        },
      });
      if (error) throw new Error(data?.error || error.message);
      toast(data.deja_existant_ailleurs
        ? `${email} existait déjà dans l'Univers BFS — rattaché à Habelec sans nouvel email envoyé`
        : `Compte créé, email d'invitation envoyé à ${email}`);
      f.reset();
      rendreComptes($('#contenu'));
    } catch (e) {
      erreurSupabase('Création du formateur externe', e);
    } finally {
      bouton.disabled = false;
    }
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

/* -------------- widget d'upload d'image (cachet organisme) ---------- */
// Distinct du widget de signature ci-dessus : un cachet est une image
// existante (photo/scan du tampon), pas un tracé à la souris — simple
// input file, converti en dataURL et prévisualisé (2026-08-27).
function widgetImage(id, valeur) {
  return `<div class="image-upload" id="${id}">
    <img class="apercu" src="${esc(valeur || '')}" style="${valeur ? '' : 'display:none'}"
      alt="Aperçu">
    <input type="file" accept="image/*">
    <button type="button" class="lien" onclick="effacerImage('${id}')">Effacer</button>
  </div>`;
}

function activerImage(id) {
  const zone = document.getElementById(id);
  if (!zone) return;
  const input = zone.querySelector('input[type=file]');
  const img = zone.querySelector('img.apercu');
  input.addEventListener('change', () => {
    const fichier = input.files[0];
    if (!fichier) return;
    if (!fichier.type.startsWith('image/')) {
      toast('Ce fichier n\'est pas une image (PNG ou JPEG attendu)', 'erreur');
      input.value = '';
      return;
    }
    const lecteur = new FileReader();
    lecteur.onload = () => { img.src = lecteur.result; img.style.display = ''; };
    lecteur.readAsDataURL(fichier);
  });
}

function effacerImage(id) {
  const zone = document.getElementById(id);
  const img = zone.querySelector('img.apercu');
  img.src = ''; img.style.display = 'none';
  zone.querySelector('input[type=file]').value = '';
}

function lireImage(id) {
  const img = document.querySelector('#' + id + ' img.apercu');
  if (!img || !img.src || img.style.display === 'none') return null;
  return img.src.startsWith('data:') ? img.src : null;
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
