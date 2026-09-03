/* =====================================================================
   HE_entrainement.js — QCM de positionnement (entraînement libre)
   (2026-09-03, demande de Jeremy)

   Route #entrainement (à ne pas confondre avec #stagiaire, l'examen réel) :
   le stagiaire choisit le(s) titre(s) visé(s) et s'entraîne sur des
   questions tirées sur les mêmes bases que l'examen (Annexe D.3), mais
   avec la bonne réponse et l'explication affichées immédiatement après
   chaque question. Rien n'est enregistré côté serveur — aucun impact sur
   le dossier du stagiaire ni sur son évaluation officielle. Accessible par
   un QR code distinct de celui de l'examen, mais avec le même code de
   session (juste pour retrouver l'intitulé affiché à l'écran).
   ===================================================================== */

const ENT = { code: null, session: null, questions: [], index: 0 };

async function ecranEntrainement(cible) {
  const codePrerempli = new URLSearchParams(location.hash.split('?')[1] || '').get('code');
  if (!ENT.code && codePrerempli) ENT.code = codePrerempli.toUpperCase();
  if (ENT.questions.length) return rendreQuestionEntrainement(cible);
  rendreChoixTitresEntrainement(cible);
}

function rendreChoixTitresEntrainement(cible) {
  const symboles = (S.referentiel.symboles || []).slice()
    .sort((a, b) => (a.libelle || '').localeCompare(b.libelle || ''));
  cible.innerHTML = `
    <div class="stagiaire-accueil">
      <h1>QCM de positionnement</h1>
      <p class="sous-titre">Entraînement libre — la bonne réponse s'affiche après chaque question.
        Ça ne compte pas pour ton dossier.</p>
      <form id="form-entrainement" class="carte">
        <label>Code de la session
          <input name="code" maxlength="10" required autocapitalize="characters" autocomplete="off"
                 value="${esc(ENT.code || '')}" class="saisie-code"></label>
        <fieldset><legend>Titre(s) visé(s)</legend>
          ${symboles.length
            ? symboles.map(sy => `
                <label class="case"><input type="checkbox" name="symbole" value="${esc(sy.code)}"> ${esc(sy.libelle)}</label>`).join('')
            : '<p class="aide">Référentiel non chargé — recharge la page.</p>'}
        </fieldset>
        <button class="principal" type="submit">Commencer</button>
      </form>
    </div>`;

  $('#form-entrainement').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const symboles = $$('input[name="symbole"]:checked').map(i => i.value);
    if (!symboles.length) return toast('Choisis au moins un titre', 'erreur');
    ENT.code = f.code.value.trim().toUpperCase();
    try {
      const res = await rpc('tirage_positionnement', { p_code: ENT.code, p_symboles: symboles });
      ENT.questions = (res.questions || []).map(q => ({ ...q, choix: [], corrige: false }));
      ENT.session = res.session;
      ENT.index = 0;
      if (!ENT.questions.length) return toast('Aucune question disponible pour ce choix', 'erreur');
      rendreQuestionEntrainement($('#ecran'));
    } catch (e) { erreurSupabase('Tirage du QCM de positionnement', e); }
  });
}

function reponseCorrecte(q) {
  const bonnesIds = q.reponses.filter(r => r.correcte).map(r => r.id);
  return bonnesIds.length > 0
    && bonnesIds.every(id => q.choix.includes(id))
    && q.choix.every(id => bonnesIds.includes(id));
}

function rendreQuestionEntrainement(cible) {
  const qs = ENT.questions;
  const q = qs[ENT.index];

  cible.innerHTML = `
    <div class="passation">
      <header class="entete-passation">
        <div>${esc(ENT.session || '')} — entraînement</div>
        <div class="progression">
          <div class="jauge"><div style="width:${(ENT.index / qs.length) * 100}%"></div></div>
          <span>Question ${ENT.index + 1}/${qs.length}</span>
        </div>
      </header>

      <article class="question">
        <div class="numero">Question ${ENT.index + 1} sur ${qs.length}
          ${q.fondamentale ? '<span class="puce fond">Question fondamentale</span>' : ''}</div>
        <h2>${esc(q.enonce)}</h2>
        ${q.image_url ? `<img class="vignette-question-qcm" src="${esc(q.image_url)}" alt="Illustration de la question">` : ''}
        ${q.choix_multiple ? '<p class="aide">Plusieurs réponses possibles.</p>' : ''}
        <div class="propositions">${q.reponses.map(r => {
          const cochee = q.choix.includes(r.id);
          let classe = 'proposition';
          if (q.corrige) {
            if (r.correcte) classe += ' bonne';
            else if (cochee) classe += ' mauvaise';
          } else if (cochee) classe += ' choisie';
          return `<label class="${classe}">
            <input type="${q.choix_multiple ? 'checkbox' : 'radio'}" name="rep" value="${r.id}"
              ${cochee ? 'checked' : ''} ${q.corrige ? 'disabled' : ''}>
            <span>${esc(r.libelle)}</span></label>`;
        }).join('')}</div>
        ${q.corrige ? `<div class="correction-entrainement">
          <p>${reponseCorrecte(q) ? '<b class="ok">✔ Bonne réponse</b>' : '<b class="ko">✘ Réponse incorrecte</b>'}</p>
          ${q.explication ? `<p class="explication">${esc(q.explication)}</p>` : ''}
        </div>` : ''}
      </article>

      <footer class="pied-passation">
        <button ${ENT.index === 0 ? 'disabled' : ''} onclick="naviguerEntrainement(-1)">← Précédente</button>
        ${!q.corrige
          ? `<button class="principal" onclick="corrigerQuestionEntrainement()">Vérifier</button>`
          : ENT.index === qs.length - 1
            ? `<button class="principal" onclick="finEntrainement()">Voir le résultat</button>`
            : `<button class="principal" onclick="naviguerEntrainement(1)">Suivante →</button>`}
      </footer>
    </div>`;

  $$('.propositions input').forEach(i => i.addEventListener('change', () => {
    q.choix = $$('.propositions input:checked').map(x => x.value);
  }));
}

function corrigerQuestionEntrainement() {
  const q = ENT.questions[ENT.index];
  if (!q.choix.length) return toast('Choisis au moins une réponse', 'erreur');
  q.corrige = true;
  rendreQuestionEntrainement($('#ecran'));
}

function naviguerEntrainement(delta) {
  ENT.index = Math.max(0, Math.min(ENT.questions.length - 1, ENT.index + delta));
  rendreQuestionEntrainement($('#ecran'));
}

function finEntrainement() {
  const qs = ENT.questions;
  const bonnes = qs.filter(reponseCorrecte).length;
  const fondEchouees = qs.filter(q => q.fondamentale && !reponseCorrecte(q)).length;

  $('#ecran').innerHTML = `
    <div class="stagiaire-accueil">
      <h1>Résultat de l'entraînement</h1>
      <div class="carte">
        <p><b>${bonnes} / ${qs.length}</b> bonnes réponses (${Math.round(bonnes / qs.length * 100)} %)</p>
        ${fondEchouees ? `<p class="ko">${fondEchouees} question(s) fondamentale(s) ratée(s)</p>` : ''}
        <p class="aide">Cet entraînement n'est pas enregistré et n'a aucun impact sur ton évaluation officielle.</p>
        <button class="principal" onclick="recommencerEntrainement()">Recommencer</button>
      </div>
    </div>`;
}

function recommencerEntrainement() {
  ENT.questions = [];
  ENT.index = 0;
  ecranEntrainement($('#ecran'));
}
