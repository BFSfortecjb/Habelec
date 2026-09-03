/* =====================================================================
   HE_qcm.js — passation du QCM côté stagiaire

   Le stagiaire n'a pas de compte. Il ouvre l'adresse #stagiaire, saisit
   le code affiché en salle, choisit son nom, et passe son sujet.
   Tout passe par des fonctions SQL sécurisées : les bonnes réponses ne
   descendent jamais dans le navigateur pendant l'épreuve.

   2026-09-05 (demande de Jeremy) : les réponses ne sont PLUS envoyées au
   serveur question par question pendant l'épreuve (source du problème
   "répondu mais pas enregistré" en cas de wifi salle instable). Elles
   sont gardées en cache LOCAL (mémoire + localStorage, pour survivre à
   un rechargement/plantage du navigateur) au fil de l'épreuve, et
   envoyées en une fois au clic sur "Terminer" — avec retries et blocage
   de la fin d'épreuve tant que l'envoi n'est pas confirmé, comme avant.
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

/* ---------- Cache local des réponses (2026-09-05) ---------------------
 * Clé par jeton (propre à chaque stagiaire) + épreuve, pour ne jamais
 * mélanger le cache d'un stagiaire précédent sur un appareil partagé, ni
 * réappliquer un cache d'une épreuve déjà terminée/regénérée. */
function cleCacheReponses(jeton) { return `habelec-qcm-reponses-${jeton}`; }

function sauvegarderCacheReponses() {
  if (!Q.jeton || !Q.sujet) return;
  try {
    const reponses = {};
    Q.sujet.questions.forEach(q => {
      if ((q.reponse_donnee || []).length) reponses[q.id] = q.reponse_donnee;
    });
    localStorage.setItem(cleCacheReponses(Q.jeton), JSON.stringify({
      epreuve_id: Q.sujet.epreuve_id, reponses,
    }));
  } catch (e) { DEBUG.erreur('sauvegarderCacheReponses', e.message); }
}

/** Réapplique, sur le sujet fraîchement reçu du serveur, les réponses restées en
 *  cache local d'une session interrompue (rechargement de page, coupure réseau,
 *  onglet fermé par erreur...). N'écrase rien côté serveur : purement local. */
function restaurerCacheReponses() {
  if (!Q.jeton || !Q.sujet) return;
  try {
    const brut = localStorage.getItem(cleCacheReponses(Q.jeton));
    if (!brut) return;
    const cache = JSON.parse(brut);
    if (cache.epreuve_id !== Q.sujet.epreuve_id) {
      // Cache d'une épreuve différente (regénérée depuis) : on l'ignore et le purge.
      localStorage.removeItem(cleCacheReponses(Q.jeton));
      return;
    }
    Q.sujet.questions.forEach(q => {
      if (cache.reponses[q.id]) q.reponse_donnee = cache.reponses[q.id];
    });
  } catch (e) { DEBUG.erreur('restaurerCacheReponses', e.message); }
}

function effacerCacheReponses() {
  if (!Q.jeton) return;
  try { localStorage.removeItem(cleCacheReponses(Q.jeton)); } catch {}
}

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
    restaurerCacheReponses();
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
          <button class="pastille ${i === Q.index ? 'actif' : ''} ${(x.reponse_donnee || []).length ? 'faite' : ''}"
            title="Question ${i + 1}"
            onclick="allerQuestion(${i})">${i + 1}</button>`).join('')}</div>
        ${Q.index === qs.length - 1
          ? `<button class="principal" onclick="terminerQcm()">Terminer</button>`
          : `<button onclick="naviguerQcm(1)">Suivante →</button>`}
      </footer>
    </div>`;

  $$('.propositions input').forEach(i => i.addEventListener('change', enregistrerReponseLocale));
  demarrerChrono();
}

/** 2026-09-05 : plus aucun appel réseau ici — la réponse est gardée en
 *  mémoire (Q.sujet) ET en localStorage (survit à un rechargement de
 *  page), et ne part vers le serveur qu'au moment de "Terminer" (voir
 *  envoyerReponsesEtTerminer). Ça évite qu'une coupure wifi ponctuelle en
 *  cours d'épreuve fasse perdre une réponse déjà cochée à l'écran. */
function enregistrerReponseLocale() {
  const q = Q.sujet.questions[Q.index];
  const choix = $$('.propositions input:checked').map(i => i.value);
  q.reponse_donnee = choix;
  $$('.proposition').forEach(p =>
    p.classList.toggle('choisie', p.querySelector('input').checked));
  sauvegarderCacheReponses();
  rafraichirBarreEtPastilles();
}

/** Tente d'enregistrer UNE réponse côté serveur, avec plusieurs essais (courte
 *  pause entre chaque). Utilisée uniquement pendant l'envoi final (voir
 *  envoyerReponsesEtTerminer) — plus pendant la navigation normale. */
async function enregistrerAvecReprise(q, choix, tentatives = 3) {
  for (let essai = 1; essai <= tentatives; essai++) {
    try {
      await rpc('enregistrer_reponse', {
        p_jeton: Q.jeton, p_epreuve_question_id: q.id, p_reponses: choix,
      });
      return true;
    } catch (e) {
      DEBUG.erreur('enregistrer_reponse (essai ' + essai + '/' + tentatives + ')', e.message);
      if (essai < tentatives) await new Promise(r => setTimeout(r, 700 * essai));
    }
  }
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
  await envoyerReponsesEtTerminer();
}

/** 2026-09-05 : c'est ICI que toutes les réponses gardées en cache local
 *  partent vers le serveur, une seule fois, au moment de "Terminer" —
 *  avec un écran dédié montrant la progression de l'envoi. Si certaines
 *  échouent malgré les essais, on NE finalise PAS l'épreuve (le cache
 *  local est conservé intact) et on propose de réessayer l'envoi. */
async function envoyerReponsesEtTerminer() {
  const aEnvoyer = Q.sujet.questions.filter(q => (q.reponse_donnee || []).length > 0);
  let envoyees = 0;
  rendreEcranEnvoi(envoyees, aEnvoyer.length);

  const echecs = [];
  for (const q of aEnvoyer) {
    const ok = await enregistrerAvecReprise(q, q.reponse_donnee);
    envoyees++;
    if (!ok) echecs.push(q);
    rendreEcranEnvoi(envoyees, aEnvoyer.length, echecs.length);
  }

  if (echecs.length) {
    rendreEcranEnvoiEchec(echecs.length, aEnvoyer.length);
    return;
  }

  await finaliserQcm();
}

function rendreEcranEnvoi(envoyees, total, echecs = 0) {
  $('#ecran').innerHTML = `
    <div class="stagiaire-accueil">
      <div class="carte">
        <h1>Envoi de tes réponses…</h1>
        <div class="jauge"><div style="width:${total ? (envoyees / total) * 100 : 100}%"></div></div>
        <p class="aide">${envoyees}/${total} envoyée(s)${echecs ? ` — ${echecs} en erreur, nouvel essai en cours` : ''}.
          Ne ferme pas cette page.</p>
      </div>
    </div>`;
}

function rendreEcranEnvoiEchec(nbEchecs, total) {
  $('#ecran').innerHTML = `
    <div class="stagiaire-accueil">
      <div class="carte">
        <h1>Envoi incomplet</h1>
        <p class="ko">${nbEchecs} réponse(s) sur ${total} n'ont pas pu être envoyées
          (connexion instable).</p>
        <p class="aide">Tes réponses restent gardées sur cet appareil, rien n'est perdu —
          vérifie ta connexion (ou rapproche-toi du routeur wifi) puis réessaie.</p>
        <button class="principal" onclick="envoyerReponsesEtTerminer()">Réessayer l'envoi</button>
      </div>
    </div>`;
}

async function finaliserQcm() {
  clearInterval(Q.minuteur);
  try {
    await rpc('terminer_epreuve', { p_jeton: Q.jeton });
    effacerCacheReponses();
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
    if (reste <= 0) { clearInterval(Q.minuteur); toast('Temps écoulé'); envoyerReponsesEtTerminer(); }
  };
  maj();
  Q.minuteur = setInterval(maj, 1000);
}
