/* =====================================================================
   HE_qcm.js — passation du QCM côté stagiaire

   Le stagiaire n'a pas de compte. Il ouvre l'adresse #stagiaire, saisit
   le code affiché en salle, choisit son nom, et passe son sujet.
   Tout passe par des fonctions SQL sécurisées : les bonnes réponses ne
   descendent jamais dans le navigateur pendant l'épreuve.
   ===================================================================== */

const Q = {
  jeton: null,
  sujet: null,
  index: 0,
  finLe: null,     // horodatage de fin si la session est chronométrée
  minuteur: null,
  candidats: [],   // liste renvoyée par liste_stagiaires_session, pour retrouver
                    // date_naissance/entreprise sans un second aller-retour serveur
};

async function ecranStagiaire(cible) {
  if (Q.sujet) return rendreQuestion(cible);
  cible.innerHTML = `
    <div class="stagiaire-accueil">
      <h1>Évaluation théorique</h1>
      <p class="sous-titre">Habilitation électrique — NF C18-510</p>
      <form id="form-code" class="carte">
        <label>Code de la session
          <input name="code" maxlength="10" required autocapitalize="characters"
                 autocomplete="off" placeholder="Ex. KJ4M7P" class="saisie-code">
        </label>
        <button class="principal" type="submit">Continuer</button>
      </form>
      <div id="liste-noms"></div>
    </div>`;

  $('#form-code').addEventListener('submit', ev => {
    ev.preventDefault();
    rechercherSessionStagiaire(ev.target.code.value.trim().toUpperCase());
  });

  // Le QR code affiché en salle encode #stagiaire?code=XXXXXX : on saute
  // la saisie manuelle si le lien arrive déjà avec un code.
  const codePrerempli = new URLSearchParams(location.hash.split('?')[1] || '').get('code');
  if (codePrerempli) {
    $('#form-code').code.value = codePrerempli.toUpperCase();
    rechercherSessionStagiaire(codePrerempli.toUpperCase());
  }
}

async function rechercherSessionStagiaire(code) {
  try {
    const liste = await rpc('liste_stagiaires_session', { p_code: code });
    if (!liste?.length) {
      return toast('Code inconnu, ou l\'accès n\'est pas encore ouvert', 'erreur', 6000);
    }
    Q.candidats = liste;
    $('#liste-noms').innerHTML = `
      <h2>Qui es-tu ?</h2>
      <div class="grille-noms">${liste.map(s => `
        <button class="nom ${s.deja_termine ? 'termine' : ''}"
                ${s.deja_termine ? 'disabled' : ''}
                onclick="demarrerQcm('${esc(s.jeton)}')">
          ${esc(s.nom)} ${esc(s.prenom)}
          ${s.deja_termine ? '<span class="puce">déjà terminé</span>' : ''}
        </button>`).join('')}</div>`;
  } catch (e) { erreurSupabase('Recherche de la session', e); }
}

/** Avant d'ouvrir le sujet, on s'assure d'avoir les infos nécessaires à
 *  l'avis et à la carte d'habilitation (absentes de l'import Excel formateur).
 *  Si l'une manque, on les demande au stagiaire avant de continuer. */
function demarrerQcm(jeton) {
  const candidat = Q.candidats.find(s => s.jeton === jeton);
  if (candidat && (!candidat.date_naissance || !candidat.entreprise)) {
    return rendreFormulaireInfos($('#ecran'), jeton, candidat);
  }
  demarrerQcmSuite(jeton);
}

function rendreFormulaireInfos(cible, jeton, candidat) {
  cible.innerHTML = `
    <div class="stagiaire-accueil">
      <h1>${esc(candidat.nom)} ${esc(candidat.prenom)}</h1>
      <p class="sous-titre">Quelques informations sont nécessaires pour l'avis et
        la carte d'habilitation, avant de commencer le questionnaire.</p>
      <form id="form-infos" class="carte">
        <label>Date de naissance
          <input name="date_naissance" type="date" required
                 value="${esc(candidat.date_naissance || '')}"></label>
        <label>Entreprise
          <input name="entreprise" type="text" required autocomplete="off"
                 value="${esc(candidat.entreprise || '')}"></label>
        <button class="principal" type="submit">Continuer</button>
      </form>
    </div>`;
  $('#form-infos').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    try {
      await rpc('completer_infos_stagiaire', {
        p_jeton: jeton,
        p_date_naissance: f.date_naissance.value,
        p_entreprise: f.entreprise.value.trim(),
      });
      candidat.date_naissance = f.date_naissance.value;
      candidat.entreprise = f.entreprise.value.trim();
      demarrerQcmSuite(jeton);
    } catch (e) { erreurSupabase('Enregistrement des informations', e); }
  });
}

async function demarrerQcmSuite(jeton) {
  try {
    const sujet = await rpc('sujet_stagiaire', { p_jeton: jeton });
    Q.jeton = jeton;
    Q.sujet = sujet;
    Q.index = 0;
    if (sujet.duree_max_min) {
      Q.finLe = Date.now() + sujet.duree_max_min * 60000;
    }
    rendreQuestion($('#ecran'));
  } catch (e) { erreurSupabase('Ouverture du sujet', e); }
}

function rendreQuestion(cible) {
  const qs = Q.sujet.questions;
  const q = qs[Q.index];
  const repondues = qs.filter(x => (x.reponse_donnee || []).length > 0).length;

  cible.innerHTML = `
    <div class="passation">
      <header class="entete-passation">
        <div>${esc(Q.sujet.stagiaire.prenom)} ${esc(Q.sujet.stagiaire.nom)}</div>
        <div class="progression">
          <div class="jauge"><div style="width:${(repondues / qs.length) * 100}%"></div></div>
          <span>${repondues}/${qs.length} répondues</span>
        </div>
        <div id="chrono"></div>
      </header>

      <article class="question">
        <div class="numero">Question ${Q.index + 1} sur ${qs.length}
          <span class="theme">${esc(q.theme)}</span>
          ${Q.sujet.fondamentales_actives && q.fondamentale ? '<span class="puce fond">Question fondamentale</span>' : ''}</div>
        <h2>${esc(q.enonce)}</h2>
        ${q.image_url ? `<img class="vignette-question-qcm" src="${esc(q.image_url)}" alt="Illustration de la question">` : ''}
        ${q.choix_multiple ? '<p class="aide">Plusieurs réponses possibles.</p>' : ''}
        <div class="propositions">${q.reponses.map(r => `
          <label class="proposition ${(q.reponse_donnee || []).includes(r.id) ? 'choisie' : ''}">
            <input type="${q.choix_multiple ? 'checkbox' : 'radio'}" name="rep" value="${r.id}"
              ${(q.reponse_donnee || []).includes(r.id) ? 'checked' : ''}>
            <span>${esc(r.libelle)}</span>
          </label>`).join('')}</div>
      </article>

      <footer class="pied-passation">
        <button ${Q.index === 0 ? 'disabled' : ''} onclick="naviguerQcm(-1)">← Précédente</button>
        <div class="pastilles">${qs.map((x, i) => `
          <button class="pastille ${i === Q.index ? 'actif' : ''} ${(x.reponse_donnee || []).length ? 'faite' : ''} ${x.enregistrement === 'erreur' ? 'erreur' : ''}"
            title="Question ${i + 1}${x.enregistrement === 'erreur' ? ' — non enregistrée, réessaie' : ''}"
            onclick="allerQuestion(${i})">${i + 1}</button>`).join('')}</div>
        ${Q.index === qs.length - 1
          ? `<button class="principal" onclick="terminerQcm()">Terminer</button>`
          : `<button onclick="naviguerQcm(1)">Suivante →</button>`}
      </footer>
    </div>`;

  $$('.propositions input').forEach(i => i.addEventListener('change', enregistrerReponseCourante));
  demarrerChrono();
}

async function enregistrerReponseCourante() {
  const q = Q.sujet.questions[Q.index];
  const choix = $$('.propositions input:checked').map(i => i.value);
  q.reponse_donnee = choix;
  // Mise à jour visuelle immédiate, enregistrement en arrière-plan
  $$('.proposition').forEach(p =>
    p.classList.toggle('choisie', p.querySelector('input').checked));
  q.enregistrement = 'en_cours';
  await enregistrerAvecReprise(q, choix);
  // La pastille reflète le statut réel (faite / erreur) : on ne redessine que la barre
  // de progression et les pastilles, sans perdre la place sur la question courante.
  rafraichirBarreEtPastilles();
}

/** Tente d'enregistrer une réponse côté serveur, avec 3 essais (courte pause entre
 *  chaque). Marque q.enregistrement = 'ok' ou 'erreur' selon le résultat final —
 *  c'est ce statut, pas seulement la présence d'une réponse locale, qui doit être
 *  vérifié avant de laisser le stagiaire terminer son épreuve. */
async function enregistrerAvecReprise(q, choix, tentatives = 3) {
  for (let essai = 1; essai <= tentatives; essai++) {
    try {
      await rpc('enregistrer_reponse', {
        p_jeton: Q.jeton, p_epreuve_question_id: q.id, p_reponses: choix,
      });
      q.enregistrement = 'ok';
      return true;
    } catch (e) {
      DEBUG.erreur('enregistrer_reponse (essai ' + essai + '/' + tentatives + ')', e.message);
      if (essai < tentatives) await new Promise(r => setTimeout(r, 700 * essai));
    }
  }
  q.enregistrement = 'erreur';
  toast('Réponse non enregistrée, vérifie ta connexion', 'erreur');
  return false;
}

function rafraichirBarreEtPastilles() {
  const qs = Q.sujet.questions;
  const repondues = qs.filter(x => (x.reponse_donnee || []).length > 0).length;
  const jauge = document.querySelector('.jauge div');
  const compteur = document.querySelector('.progression span');
  if (jauge) jauge.style.width = (repondues / qs.length) * 100 + '%';
  if (compteur) compteur.textContent = `${repondues}/${qs.length} répondues`;
  const pastilles = $$('.pastille');
  qs.forEach((x, i) => {
    const b = pastilles[i];
    if (!b) return;
    b.classList.toggle('faite', (x.reponse_donnee || []).length > 0);
    b.classList.toggle('erreur', x.enregistrement === 'erreur');
  });
}

function naviguerQcm(pas) { allerQuestion(Q.index + pas); }

function allerQuestion(i) {
  if (i < 0 || i >= Q.sujet.questions.length) return;
  Q.index = i;
  rendreQuestion($('#ecran'));
}

async function terminerQcm() {
  const restantes = Q.sujet.questions.filter(x => !(x.reponse_donnee || []).length).length;
  if (restantes && !confirmer(
    `${restantes} question(s) sans réponse.\nTerminer quand même ?`)) return;

  const bouton = document.querySelector('.pied-passation .principal');
  if (bouton) { bouton.disabled = true; bouton.textContent = 'Vérification des réponses…'; }
  const ok = await verifierEnregistrements();
  if (!ok) {
    if (bouton) { bouton.disabled = false; bouton.textContent = 'Terminer'; }
    toast('Certaines réponses n\'ont pas pu être confirmées enregistrées '
      + '(connexion instable). Repère les questions en rouge, revois-les, '
      + 'puis réessaie de terminer.', 'erreur', 8000);
    return;
  }
  await finaliserQcm();
}

/** Avant de clore l'épreuve : réessaie les réponses en échec local, PUIS revérifie
 *  auprès du serveur (source de vérité) que chaque réponse locale correspond bien
 *  à ce qui est enregistré côté base — un enregistrement peut avoir semblé réussir
 *  côté client tout en échouant côté réseau juste après. Retourne false s'il reste
 *  un écart après tentative de correction : on bloque alors la fin d'épreuve plutôt
 *  que de risquer une copie incomplète silencieuse. */
async function verifierEnregistrements() {
  const aReprendre = Q.sujet.questions.filter(q =>
    (q.reponse_donnee || []).length > 0 && q.enregistrement !== 'ok');
  for (const q of aReprendre) {
    await enregistrerAvecReprise(q, q.reponse_donnee);
  }
  rafraichirBarreEtPastilles();

  let sujetServeur;
  try {
    sujetServeur = await rpc('sujet_stagiaire', { p_jeton: Q.jeton });
  } catch (e) {
    DEBUG.erreur('verifierEnregistrements — relecture serveur', e.message);
    return false; // impossible de vérifier => on ne prend pas le risque de conclure
  }
  const serveurParId = Object.fromEntries(sujetServeur.questions.map(x => [x.id, x.reponse_donnee || []]));
  const memes = (a, b) => a.length === b.length && a.every(v => b.includes(v));

  let toutOk = true;
  Q.sujet.questions.forEach(q => {
    const local = q.reponse_donnee || [];
    const distant = serveurParId[q.id] || [];
    if (!memes(local, distant)) {
      q.enregistrement = 'erreur';
      toutOk = false;
    } else if (local.length > 0) {
      q.enregistrement = 'ok';
    }
  });
  rafraichirBarreEtPastilles();
  return toutOk;
}

async function finaliserQcm() {
  clearInterval(Q.minuteur);
  try {
    await rpc('terminer_epreuve', { p_jeton: Q.jeton });
    $('#ecran').innerHTML = `
      <div class="stagiaire-accueil">
        <div class="carte succes-final">
          <h1>Épreuve terminée</h1>
          <p>Merci ${esc(Q.sujet.stagiaire.prenom)}. Ta copie a bien été enregistrée.</p>
          <p class="aide">Le résultat te sera communiqué par le formateur,
             après l'évaluation pratique.</p>
        </div>
      </div>`;
    Q.sujet = null; Q.jeton = null;
  } catch (e) { erreurSupabase('Fin d\'épreuve', e); }
}

function demarrerChrono() {
  clearInterval(Q.minuteur);
  if (!Q.finLe) return;
  const maj = () => {
    const reste = Math.max(0, Q.finLe - Date.now());
    const min = Math.floor(reste / 60000), sec = Math.floor((reste % 60000) / 1000);
    const el = document.getElementById('chrono');
    if (el) {
      el.textContent = `${min}:${String(sec).padStart(2, '0')}`;
      el.className = reste < 300000 ? 'urgent' : '';
    }
    if (reste <= 0) { clearInterval(Q.minuteur); toast('Temps écoulé'); finaliserQcm(); }
  };
  maj();
  Q.minuteur = setInterval(maj, 1000);
}
