// app.js — LE MÉTIER. Écrans, listes, formulaires. C'est ici qu'on travaille.
// Dépend de core.js (sb, S, show, $, esc, toast, chargerFormation).

const NIVEAUX = ['A+', 'A', 'ECA', 'NA', 'NE'];
const NIV_CLASSE = { 'A+': 'Aplus', 'A': 'A', 'ECA': 'ECA', 'NA': 'NA', 'NE': 'NE' };
// Nombre de jours réglable par formation (Paramètres formations) — J1..Jn
function joursFormation() {
  const n = (S.formation && S.formation.nb_jours) || 5;
  return Array.from({ length: n }, (_, i) => 'J' + (i + 1));
}

// ============================================================
// ACCUEIL STAFF — tableau de bord + changement de vision
// ============================================================
function changerVision(role) {
  S.vision = role;
  S.stagiaire = null;
  if (role === 'stagiaire') return ecranChoixSessionVision();
  ecranAccueilStaff();
}

// Barème d'encadrement (RIOFE) : nb de formateurs requis selon le nb de stagiaires
function formateursRequis(f, nbStag) {
  const bar = f.bareme_formateurs || [];
  if (!bar.length) return 0;
  for (const t of bar) if (nbStag >= t.min && nbStag <= t.max) return t.formateurs;
  return nbStag < bar[0].min ? bar[0].formateurs : bar[bar.length - 1].formateurs;
}

function jauge(n, requis, libelle, max) {
  const ok = max ? n <= max && n > 0 : n >= requis;
  const base = max || requis;
  const pct = base ? Math.min(100, Math.round(n / base * 100)) : 0;
  return `<div class="jauge-bloc"><small>${libelle} : <b class="${ok ? 'statut-valide' : 'statut-na'}">${n}/${base}</b></small>
    <div class="jauge"><div style="width:${pct}%;background:${ok ? 'var(--ok)' : 'var(--warn)'}"></div></div></div>`;
}

function carteSession(s) {
  const f = s.formations;
  const estFMPA = f.type_formation === 'continue';
  const nbStag = s._nbStag || 0;
  // FMPA (formation continue) : pas de RP requis, et le ratio formateur/stagiaires est fixe (1
  // formateur pour 6 stagiaires) plutôt que le barème de la formation initiale — l'effectif n'est
  // par ailleurs pas plafonné (un CIS entier, voire plusieurs, peut être présent en même temps).
  const reqF = estFMPA ? Math.max(1, Math.ceil(nbStag / 6)) : formateursRequis(f, nbStag || f.nb_stagiaires_max);
  // Le GFor peut supprimer une session tant qu'elle n'est pas clôturée (statut « terminee ») —
  // au-delà, la session porte des données définitives (PV, décisions du jury...) qu'on ne veut
  // pas pouvoir effacer d'un clic.
  const peutSupprimer = S.vision === 'gfor' && s.statut !== 'terminee';
  return `<div class="carte carte-session" style="border-left-color:${esc(f.couleur)}" onclick="ouvrirSession('${s.id}')">
    ${peutSupprimer ? `<button class="btn petit secondaire" style="float:right" title="Supprimer cette session (non clôturée)" onclick="event.stopPropagation();supprimerSession('${s.id}')">🗑️</button>` : ''}
    <span class="badge" style="background:${esc(f.couleur)};color:#fff">${esc(f.domaine)}</span>
    <span class="badge" style="background:${estFMPA ? '#ef6c00' : '#37474f'};color:#fff" title="${estFMPA ? 'Formation continue (FMPA)' : 'Formation initiale'}">${estFMPA ? 'FMPA' : 'FORMATION INITIALE'}</span>
    <b>${esc(f.libelle)}</b> — ${esc(s.lieu || 'lieu à définir')}
    <div class="info">${esc(s.date_debut || 'dates à définir')} → ${esc(s.date_fin || '')} · RP : ${esc(s.responsable || '—')} · code stagiaire : <b>${esc(s.code_acces)}</b></div>
    <div class="ligne" style="margin-top:8px">
      ${estFMPA ? `<div class="jauge-bloc"><small>Stagiaires : <b>${nbStag}</b></small></div>` : jauge(nbStag, null, 'Stagiaires', f.nb_stagiaires_max)}
      ${estFMPA ? '' : jauge(s.responsable ? 1 : 0, f.nb_rp_requis || 1, 'Resp. péda.')}
      ${jauge(s._nbForm, reqF, estFMPA ? 'Formateurs (1 / 6 stag.)' : 'Formateurs FPS')}
    </div>
  </div>`;
}

function majMenu(actif) {
  const m = $('menu-gauche');
  if (!S.user || S.vision === 'stagiaire') { m.style.display = 'none'; return; }
  // Les formateurs (moniteurs de centre) peuvent créer une session, mais uniquement de type FMPA
  // (formation continue) — cf. ecranNouvelleSession qui filtre la liste des formations en conséquence.
  const peutCreer = S.vision === 'rp' || S.vision === 'gfor' || S.vision === 'formateur';
  m.innerHTML = `<button class="${actif === 'dash' ? 'actif' : ''}" onclick="ecranAccueilStaff()">🏠 Tableau de bord</button>` +
    (peutCreer ? `<button class="${actif === 'new' ? 'actif' : ''}" onclick="ecranNouvelleSession()">➕ Nouvelle session${S.vision === 'formateur' ? ' FMPA' : ''}</button>` : '') +
    `<button class="${actif === 'apt' ? 'actif' : ''}" onclick="ecranGestionFormateurs()">👨‍🏫 Formateurs</button>` +
    (S.vision === 'gfor' ? `<button class="${actif === 'param-form' ? 'actif' : ''}" onclick="ecranParametresFormations()">⚙️ Paramètres formations</button>` : '') +
    ((S.vision === 'rp' || S.vision === 'gfor' || S.vision === 'chef_centre') ? `<button class="${actif === 'archives' ? 'actif' : ''}" onclick="ecranArchives()">🗂️ Archives entretiens & PV</button>` : '') +
    ((S.vision === 'rp' || S.vision === 'gfor' || S.vision === 'chef_centre') ? `<button class="${actif === 'fmpa' ? 'actif' : ''}" onclick="ecranSuiviFMPA()">📊 Suivi FMPA</button>` : '') +
    (S.vision === 'gfor' ? `<button class="${actif === 'effectifs' ? 'actif' : ''}" onclick="ecranEffectifsCIS()">👥 Effectifs CIS</button>` : '') +
    `<button class="${actif === 'parcours' ? 'actif' : ''}" onclick="ecranMonParcoursStagiaire()">📖 Mon parcours stagiaire</button>`;
  m.style.display = '';
}

const GRADES = ['SAP', 'CAP', 'CCH', 'SGT', 'SCH', 'ADJ', 'ADC', 'LTN', 'CNE', 'CDT', 'LCL', 'COL'];
const DOMAINES_COMP = ['INCENDIE', 'PPBE', 'SSUAP', 'SR'];
const STATUTS = ['SPV', 'SPP', 'PATS'];
// Liste des CIS du Finistère — à ajuster librement ici si besoin
const CIS_29 = ['AUDIERNE', 'BANNALEC', 'BREST', 'BRIEC', 'CAMARET-SUR-MER', 'CARHAIX', 'CHATEAULIN',
  'CHATEAUNEUF-DU-FAOU', 'CLEDER', 'CLOHARS-CARNOET', 'CONCARNEAU', 'CROZON', 'DE L\'AVEN', 'DOUARNENEZ',
  'FOUESNANT-PLEUVEN', 'GUERLESQUIN', 'GUIPAVAS', 'HUELGOAT', 'ILE DE BATZ', 'ILE DE SEIN', 'ILE MOLENE',
  'OUESSANT', 'LANDERNEAU', 'LANDIVISIAU', 'LANMEUR', 'LANNILIS', 'LE CONQUET', 'LE FAOU', 'LE GUILVINEC',
  'LESNEVEN', 'MOELAN-SUR-MER', 'MORLAIX', 'PLABENNEC', 'PLEYBEN', 'PLEYBER-CHRIST', 'PLONEOUR-LANVERN',
  'PLOUDALMEZEAU', 'PLOUESCAT', 'PLOUGASNOU', 'PLOUGASTEL-DAOULAS', 'PLOUGUERNEAU', 'PLOUIGNEAU',
  'PLOZEVET', 'PONT-AVEN', 'PONT-CROIX', 'PONT-L\'ABBE', 'QUERRIEN', 'QUIMPER', 'QUIMPERLE', 'ROSCOFF',
  'ROSPORDEN', 'SAINT-POL-DE-LEON', 'SAINT-RENAN', 'SCAER', 'SIZUN'].map(c => 'CIS ' + c)
  .concat(['SSSM']); // Service de Santé et de Secours Médical — traité comme un centre dans cette liste (rattachement des personnels)

function selectCIS(id, valeur, onchange) {
  return `<select id="${id}"${onchange ? ` onchange="${onchange}"` : ''}><option value="">— CIS —</option>
    ${CIS_29.map(c => `<option ${c === valeur ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
}

// Une même personne peut cumuler plusieurs niveaux (formateur / RP / for de for)
// dans un même domaine, chacun avec sa propre date de fin de validité.
function couleurRole(role) {
  return role === 'rp' ? '#1565c0' : role === 'for_de_for' ? '#6a1b9a' : role === 'isp' ? '#00838f' : '#607d8b';
}
function libelleRoleQualif(role) {
  return role === 'rp' ? 'RP' : role === 'for_de_for' ? 'For de For' : role === 'isp' ? 'ISP' : 'Form.';
}

function badgeQualif(q, suppr) {
  const auj = new Date().toISOString().slice(0, 10);
  const ok = q.fin_validite >= auj;
  return `<span class="badge" style="background:${couleurRole(q.role)};color:#fff;margin:2px">
    ${q.domaine} ${libelleRoleQualif(q.role)} <span style="opacity:.85">→ ${q.fin_validite}</span>${ok ? '' : ' ⚠'}
    ${suppr ? `<a onclick="event.stopPropagation();supprQualification(${q.id})" style="cursor:pointer;color:#fff;font-weight:bold"> ✕</a>` : ''}
  </span>`;
}

// ============================================================
// NOUVELLE SESSION — le RP est filtré selon le domaine de la formation
// ============================================================
async function ecranNouvelleSession() {
  majMenu('new');
  show('ecran-staff-accueil');
  // Un formateur (moniteur de centre) ne peut créer que des sessions FMPA (formation continue) —
  // la formation initiale (multi-jours) reste réservée au RP/GFor.
  const seulementFMPA = S.vision === 'formateur';
  const [f, apt] = await Promise.all([
    sb.from('formations').select('*').eq('actif', true),
    sb.from('aptitudes').select('*, qualifications(*)'),
  ]);
  if (f.error) return toast(f.error.message, false);
  window._aptRP = apt.data || [];
  window._formations = seulementFMPA ? (f.data || []).filter(x => x.type_formation === 'continue') : (f.data || []);
  if (seulementFMPA && !window._formations.length) {
    $('staff-dashboard').innerHTML = `<div class="carte"><h2>Nouvelle session FMPA</h2>
      <p class="info">Aucune formation continue n'est configurée pour l'instant — voir avec le Groupement Formation.</p></div>`;
    return;
  }
  $('staff-dashboard').innerHTML = `<div class="carte">
    <h2>${seulementFMPA ? 'Nouvelle session FMPA' : 'Nouvelle session'}</h2>
    <div class="ligne">
      <div><label>Formation</label>
        <select id="ns-formation" onchange="majListeRP();_majBlocFMPA()">${window._formations.map(x =>
          `<option value="${x.id}" data-code="${esc(x.code)}" data-dom="${esc(x.domaine_competence || '')}" data-type="${esc(x.type_formation)}">${esc(x.libelle)}</option>`).join('')}</select></div>
      <div><label>Lieu</label>${selectCIS('ns-lieu', seulementFMPA && S.user ? S.user.cis : undefined, 'majListeRP()')}</div>
    </div>
    <div class="ligne">
      <div><label>Date début</label><input id="ns-debut" type="date"></div>
      <div><label>Date fin</label><input id="ns-fin" type="date"></div>
    </div>
    <label>Responsable pédagogique (RP qualifié pour ce domaine)</label>
    <select id="ns-resp"></select>
    <div id="ns-bloc-fmpa"></div>
    <button class="btn" onclick="creerSession()">Créer la session</button>
  </div>`;
  majListeRP();
  await _majBlocFMPA();
}

// Affiche, quand la formation choisie est de type « continue » (FMPA), le choix du programme
// FMPA de l'année puis la ou les séquences couvertes par cette session précise (une séquence
// pouvant être couverte en plusieurs fois, par des formateurs différents).
async function _majBlocFMPA() {
  const opt = $('ns-formation').selectedOptions[0];
  const bloc = $('ns-bloc-fmpa');
  if (!opt || opt.dataset.type !== 'continue') { bloc.innerHTML = ''; window._programmesFMPADispo = []; return; }
  const formationId = Number(opt.value);
  const { data, error } = await sb.from('programmes_fmpa').select('*, sequences_fmpa(*)').eq('formation_id', formationId).order('annee', { ascending: false });
  if (error) return toast(error.message, false);
  window._programmesFMPADispo = data || [];
  if (!window._programmesFMPADispo.length) {
    bloc.innerHTML = `<div class="info" style="color:#c8102e">Aucun programme FMPA défini pour cette formation — demander au Groupement Formation de le créer (Paramètres formations > 🗓️ Séquences FMPA).</div>`;
    return;
  }
  bloc.innerHTML = `<label>Programme FMPA (année)</label>
    <select id="ns-fmpa-prog" onchange="_majSequencesFMPA()">${window._programmesFMPADispo.map(p => `<option value="${p.id}">${p.annee}</option>`).join('')}</select>
    <label style="margin-top:8px">Séquence(s) couverte(s) par cette session</label>
    <div id="ns-fmpa-sequences"></div>`;
  _majSequencesFMPA();
}

function _majSequencesFMPA() {
  const progId = Number($('ns-fmpa-prog').value);
  const prog = (window._programmesFMPADispo || []).find(p => p.id === progId);
  const seqs = prog ? [...(prog.sequences_fmpa || [])].sort((a, b) => a.ordre - b.ordre) : [];
  $('ns-fmpa-sequences').innerHTML = seqs.map(s =>
    `<label style="display:block"><input type="checkbox" class="ns-fmpa-seq" value="${s.id}" style="width:auto"> ${esc(s.libelle)} (${s.volume_horaire} h)</label>`).join('') ||
    '<span class="info">Aucune séquence dans ce programme</span>';
}

function majListeRP() {
  const optForm = $('ns-formation').selectedOptions[0];
  const dom = optForm.dataset.dom;
  const estFMPA = optForm.dataset.type === 'continue';
  const lieuCIS = $('ns-lieu') ? $('ns-lieu').value : '';
  // Formation initiale : responsable = RP qualifié uniquement. Formation continue (FMPA) : pas de
  // qualif RP requise — n'importe quel formateur qualifié dans le domaine peut être responsable,
  // en priorité un formateur du centre de secours de la session (sans exclure les autres CIS).
  const rolesAcceptes = estFMPA ? ['rp', 'formateur', 'for_de_for'] : ['rp'];
  let candidats = window._aptRP
    .map(a => ({ a, q: (a.qualifications || []).find(q => rolesAcceptes.includes(q.role) && (!dom || q.domaine === dom)) }))
    .filter(x => x.q);
  if (estFMPA && lieuCIS) {
    candidats = [...candidats].sort((x, y) => (x.a.cis === lieuCIS ? 0 : 1) - (y.a.cis === lieuCIS ? 0 : 1));
  }
  $('ns-resp').innerHTML = `<option value="">— À définir —</option>` +
    candidats.map(x => `<option value="${x.a.id}" data-fin="${x.q.fin_validite}" data-nom="${esc(x.a.prenom + ' ' + x.a.nom)}">
      ${esc(x.a.grade || '')} ${esc(x.a.prenom)} ${esc(x.a.nom)}${estFMPA && x.a.cis === lieuCIS ? ' ⭐ (même CIS)' : ''} — ${libelleRoleQualif(x.q.role)} ${esc(x.q.domaine)} valide jusqu'au ${x.q.fin_validite}</option>`).join('');
}

// ============================================================
// LISTE D'APTITUDE = GESTION DES UTILISATEURS (GFor)
// Une personne + des qualifications par domaine (rôle et validité propres)
// ============================================================
let _qualisEnCours = [];

async function ecranGestionFormateurs() {
  majMenu('apt');
  show('ecran-staff-accueil');
  _qualisEnCours = [];
  const { data: apt, error } = await sb.from('aptitudes').select('*, qualifications(*)').order('nom');
  if (error) return toast(error.message, false);
  const estGfor = S.vision === 'gfor';
  window._apt = apt || [];

  const lignes = (apt || []).map(a => `<tr>
      <td>${esc(a.matricule || '')}</td><td>${esc(a.grade || '')}</td>
      <td><b>${esc(a.nom)}</b> ${esc(a.prenom)}${a.gfor ? ' <span class="badge" style="background:#6a1b9a;color:#fff">GFOR</span>' : ''}${a.chef_centre ? ' <span class="badge" style="background:#00695c;color:#fff">CHEF CENTRE</span>' : ''}</td>
      <td>${esc(a.statut || '')}</td><td>${esc(a.cis || '')}</td>
      <td>${esc(a.email || '')}</td>
      <td>${(a.qualifications || []).map(q => badgeQualif(q, estGfor)).join(' ') || '<span class="info">aucune</span>'}</td>
      ${estGfor ? `<td style="white-space:nowrap">
        <button class="btn petit secondaire" title="Modifier ses informations" onclick="ecranModifierAptitude(${a.id})">✏️</button>
        ${a.email ? `<button class="btn petit secondaire" title="Réinitialiser le mot de passe" onclick="resetMdp('${esc(a.email)}')">🔑</button>` : ''}
        <button class="btn petit secondaire" onclick="supprAptitude(${a.id})">✕</button></td>` : ''}
    </tr>`).join('');

  $('staff-dashboard').innerHTML = `<div class="carte">
    <h2>Liste d'aptitude — formateurs et RP (${(apt || []).length})</h2>
    <div class="info">Une personne peut être RP dans un domaine et simple formateur dans un autre, chaque qualification a sa date de fin de validité. L'email sert de compte utilisateur (« Première connexion » sur l'écran d'accueil). 🔑 = réinitialisation du mot de passe.</div>
    <div class="table-scroll"><table>
      <tr><th>Matricule</th><th>Grade</th><th>Nom Prénom</th><th>Statut</th><th>CIS</th><th>Email</th><th>Qualifications</th>${estGfor ? '<th></th>' : ''}</tr>
      ${lignes}
    </table></div>
    ${estGfor ? `
      <h3>Ajout individuel</h3>
      <div class="ligne">
        <div><label>Matricule</label><input id="ap-mat"></div>
        <div><label>Grade</label><select id="ap-grade">${GRADES.map(g => `<option>${g}</option>`).join('')}</select></div>
        <div><label>Statut</label><select id="ap-statut">${STATUTS.map(s => `<option>${s}</option>`).join('')}</select></div>
      </div>
      <div class="ligne">
        <div><label>Nom</label><input id="ap-nom"></div>
        <div><label>Prénom</label><input id="ap-prenom"></div>
      </div>
      <div class="ligne">
        <div><label>CIS de rattachement</label>${selectCIS('ap-cis')}</div>
        <div><label>Email (compte utilisateur)</label><input id="ap-email" type="email"></div>
      </div>
      <label>Mot de passe initial (optionnel)</label>
      <input id="ap-mdp" type="password" placeholder="6 caractères minimum — laisser vide pour passer par l'email">
      <div class="info">Si renseigné (avec un email), le compte est créé directement avec ce mot de passe — la personne pourra le changer ensuite dans « Mon profil ». Utile si les emails de confirmation n'arrivent pas (filtres antispam type Mailinblack).</div>
      <label><input type="checkbox" id="ap-gfor" style="width:auto"> Donner l'accès GFor (gestion complète : sessions, formateurs, liste d'aptitude...)</label>
      <label><input type="checkbox" id="ap-chef-centre" style="width:auto"> Donner l'accès Chef de centre (suivi des MSP des stagiaires de son CIS, réglé ci-dessus)</label>
      <label>Qualifications de la personne</label>
      <div class="ligne">
        <div><label>Domaine</label><select id="ap-q-dom">${DOMAINES_COMP.map(d => `<option>${d}</option>`).join('')}</select></div>
        <div><label>Rôle</label><select id="ap-q-role"><option value="formateur">Formateur</option><option value="rp">RP</option><option value="for_de_for">For de For</option><option value="isp">ISP (infirmier sapeur-pompier)</option></select></div>
        <div><label>Fin de validité</label><input id="ap-q-fin" type="date"></div>
        <div style="align-self:flex-end"><button class="btn petit" onclick="ajouterQualifEnCours()">➕ Ajouter</button></div>
      </div>
      <div id="ap-q-liste" style="margin:8px 0"></div>
      <button class="btn" onclick="ajouterAptitude()">Enregistrer la personne</button>

      <h3>Ajouter une qualification à une personne existante</h3>
      <div class="ligne">
        <div><label>Personne</label><select id="qx-apt">${(apt || []).map(a => `<option value="${a.id}">${esc(a.nom)} ${esc(a.prenom)}</option>`).join('')}</select></div>
        <div><label>Domaine</label><select id="qx-dom">${DOMAINES_COMP.map(d => `<option>${d}</option>`).join('')}</select></div>
        <div><label>Rôle</label><select id="qx-role"><option value="formateur">Formateur</option><option value="rp">RP</option><option value="for_de_for">For de For</option><option value="isp">ISP (infirmier sapeur-pompier)</option></select></div>
        <div><label>Fin de validité</label><input id="qx-fin" type="date"></div>
        <div style="align-self:flex-end"><button class="btn petit" onclick="ajouterQualifExistant()">➕ Ajouter</button></div>
      </div>

      <h3>Import Excel</h3>
      <p class="info">Une ligne par qualification (une même personne peut donc avoir plusieurs lignes). Colonnes : Matricule, Nom, Prénom, Grade, Statut, CIS, Email, Domaine, Rôle, Fin de validité, Mot de passe, GFor.
        Les deux dernières colonnes sont optionnelles : renseigne « Mot de passe » (6 caractères minimum, sur une seule ligne par personne suffit) pour créer directement son compte de connexion, et « GFor » = oui pour lui donner l'accès complet.</p>
      <button class="btn secondaire" onclick="telechargerModeleAptitude()">📄 Télécharger le modèle</button>
      <label style="margin-top:10px">Fichier à importer (.xlsx)</label>
      <input type="file" accept=".xlsx,.xls,.csv" onchange="importerAptitudes(this)">`
    : `<p class="info">Liste gérée par le Groupement Formation (vision GFor).</p>`}
  </div>`;
}

function _rendreQualisEnCours() {
  $('ap-q-liste').innerHTML = _qualisEnCours.map((q, i) =>
    `<span class="badge" style="background:${couleurRole(q.role)};color:#fff;margin:2px">
      ${q.domaine} ${libelleRoleQualif(q.role)} → ${q.fin_validite}
      <a onclick="_qualisEnCours.splice(${i},1);ajouterQualifEnCours._maj()" style="cursor:pointer;color:#fff"> ✕</a></span>`).join('');
}
function ajouterQualifEnCours() {
  const fin = $('ap-q-fin').value;
  if (!fin) return toast('Renseigner la fin de validité', false);
  const dom = $('ap-q-dom').value;
  const role = $('ap-q-role').value;
  // Une même personne peut cumuler plusieurs niveaux (formateur / RP / for de for) dans un même domaine ;
  // seul le doublon exact domaine+rôle est bloqué.
  if (_qualisEnCours.some(q => q.domaine === dom && q.role === role)) return toast('Ce niveau (' + libelleRoleQualif(role) + ') est déjà ajouté pour ce domaine', false);
  _qualisEnCours.push({ domaine: dom, role, fin_validite: fin });
  _rendreQualisEnCours();
}
ajouterQualifEnCours._maj = _rendreQualisEnCours;

async function ajouterAptitude() {
  const nom = $('ap-nom').value.trim(), prenom = $('ap-prenom').value.trim();
  if (!nom || !prenom) return toast('Nom et prénom requis', false);
  if (!_qualisEnCours.length) return toast('Ajouter au moins une qualification (domaine + rôle + validité)', false);
  const email = $('ap-email').value.trim().toLowerCase() || null;
  const mdp = $('ap-mdp').value;
  const gfor = $('ap-gfor').checked;
  const chefCentre = $('ap-chef-centre').checked;
  const { data: pers, error } = await sb.from('aptitudes').insert({
    matricule: $('ap-mat').value.trim() || null, grade: $('ap-grade').value,
    statut: $('ap-statut').value, nom, prenom,
    cis: $('ap-cis').value || null,
    email, gfor, chef_centre: chefCentre,
  }).select().single();
  if (error) return toast(error.message, false);
  const { error: e2 } = await sb.from('qualifications').insert(
    _qualisEnCours.map(q => ({ ...q, aptitude_id: pers.id })));
  if (e2) return toast(e2.message, false);

  // Création directe du compte avec mot de passe (utile quand les emails de confirmation
  // n'arrivent pas — filtre antispam, etc.). Ne fonctionne sans reconnexion manuelle que si
  // « Confirm email » est désactivé côté Supabase (Authentication > Providers > Email).
  if (email && mdp) {
    if (mdp.length < 6) {
      toast('Personne enregistrée, mais mot de passe ignoré (6 caractères minimum)', false);
    } else {
      const { data: inscription, error: e3 } = await sb.auth.signUp({ email, password: mdp });
      if (e3) {
        toast('Personne enregistrée, mais compte non créé : ' + e3.message, false);
      } else if (inscription.session) {
        // signUp a rendu actif le nouveau compte à la place du tien : on se déconnecte
        // immédiatement pour ne pas rester connecté à sa place.
        await sb.auth.signOut();
        toast('Compte créé avec mot de passe pour ' + prenom + ' ' + nom + ' — reconnecte-toi maintenant.');
        show('ecran-login');
        return;
      } else {
        toast('Personne enregistrée, compte créé — confirmation par email encore requise avant sa 1ère connexion.');
        ecranGestionFormateurs();
        return;
      }
    }
  }
  toast('Personne enregistrée avec ' + _qualisEnCours.length + ' qualification(s)');
  ecranGestionFormateurs();
}

async function ajouterQualifExistant() {
  const fin = $('qx-fin').value;
  if (!fin) return toast('Renseigner la fin de validité', false);
  const { error } = await sb.from('qualifications').upsert({
    aptitude_id: Number($('qx-apt').value), domaine: $('qx-dom').value,
    role: $('qx-role').value, fin_validite: fin,
  }, { onConflict: 'aptitude_id,domaine,role' });
  if (error) return toast(error.message, false);
  toast('Qualification ajoutée'); ecranGestionFormateurs();
}

async function supprQualification(id) {
  const { error } = await sb.from('qualifications').delete().eq('id', id);
  if (error) return toast(error.message, false);
  ecranGestionFormateurs();
}

async function supprAptitude(id) {
  if (!confirm('Retirer cette personne (et toutes ses qualifications) de la liste d\'aptitude ?')) return;
  const { error } = await sb.from('aptitudes').delete().eq('id', id);
  if (error) return toast(error.message, false);
  ecranGestionFormateurs();
}

async function resetMdp(email) {
  if (!confirm('Envoyer un email de réinitialisation de mot de passe à ' + email + ' ?')) return;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  toast(error ? error.message : 'Email de réinitialisation envoyé à ' + email, !error);
}

// ---------- Modifier une personne de la liste d'aptitude (corriger une erreur de saisie) ----------
function ecranModifierAptitude(id) {
  const a = (window._apt || []).find(x => x.id === id);
  if (!a) return;
  $('staff-dashboard').innerHTML = `<div class="carte">
    <span class="lien-retour" onclick="ecranGestionFormateurs()">← Retour à la liste d'aptitude</span>
    <h2>Modifier — ${esc(a.prenom)} ${esc(a.nom)}</h2>
    <div class="ligne">
      <div><label>Matricule</label><input id="ma-mat" value="${esc(a.matricule || '')}"></div>
      <div><label>Grade</label><select id="ma-grade">${GRADES.map(g => `<option ${g === a.grade ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
    </div>
    <div class="ligne">
      <div><label>Nom</label><input id="ma-nom" value="${esc(a.nom)}"></div>
      <div><label>Prénom</label><input id="ma-prenom" value="${esc(a.prenom)}"></div>
    </div>
    <div class="ligne">
      <div><label>Statut</label><select id="ma-statut"><option value="">—</option>${STATUTS.map(s => `<option ${s === a.statut ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label>CIS de rattachement</label>${selectCIS('ma-cis', a.cis || '')}</div>
    </div>
    <label>Email (compte utilisateur)</label><input id="ma-email" type="email" value="${esc(a.email || '')}">
    <label><input type="checkbox" id="ma-gfor" style="width:auto" ${a.gfor ? 'checked' : ''}> Donner l'accès GFor (gestion complète : sessions, formateurs, liste d'aptitude...)</label>
    <label><input type="checkbox" id="ma-chef-centre" style="width:auto" ${a.chef_centre ? 'checked' : ''}> Donner l'accès Chef de centre (suivi des MSP des stagiaires de son CIS, réglé ci-dessus)</label>
    <button class="btn" onclick="enregistrerModifAptitude(${a.id})">Enregistrer les corrections</button>

    <h3>Compte de connexion</h3>
    <div class="info">Si cette personne n'a jamais fini de créer son compte (cas fréquent : elle est dans la liste d'aptitude mais aucun compte de connexion n'existe encore), tu peux lui en créer un directement avec un mot de passe de ton choix — sans passer par un email.</div>
    <label>Mot de passe à créer</label>
    <input id="ma-mdp" type="password" placeholder="6 caractères minimum">
    <button class="btn secondaire" onclick="creerCompteAptitudeExistante(${a.id})">Créer le compte avec ce mot de passe</button>
  </div>`;
}

async function creerCompteAptitudeExistante(id) {
  const a = (window._apt || []).find(x => x.id === id);
  const email = $('ma-email').value.trim().toLowerCase();
  const mdp = $('ma-mdp').value;
  if (!email) return toast('Renseigner un email avant de créer le compte', false);
  if (mdp.length < 6) return toast('Mot de passe : 6 caractères minimum', false);
  const { data: inscription, error } = await sb.auth.signUp({ email, password: mdp });
  if (error) return toast(error.message, false);
  if (inscription.session) {
    // signUp a rendu actif le nouveau compte à la place du tien : on se déconnecte
    // immédiatement pour ne pas rester connecté à sa place.
    await sb.auth.signOut();
    toast('Compte créé pour ' + (a ? a.prenom + ' ' + a.nom : email) + ' — reconnecte-toi maintenant.');
    show('ecran-login');
  } else {
    toast('Compte créé — confirmation par email encore requise avant sa 1ère connexion.');
    ecranGestionFormateurs();
  }
}

async function enregistrerModifAptitude(id) {
  const nom = $('ma-nom').value.trim(), prenom = $('ma-prenom').value.trim();
  if (!nom || !prenom) return toast('Nom et prénom requis', false);
  const email = $('ma-email').value.trim().toLowerCase() || null;
  const gfor = $('ma-gfor').checked;
  const chefCentre = $('ma-chef-centre').checked;
  const { data: apt, error } = await sb.from('aptitudes').update({
    matricule: $('ma-mat').value.trim() || null, grade: $('ma-grade').value,
    nom, prenom, statut: $('ma-statut').value || null, cis: $('ma-cis').value || null,
    email, gfor, chef_centre: chefCentre,
  }).eq('id', id).select('*, qualifications(*)').single();
  if (error) return toast(error.message, false);
  if (apt) await synchroniserRoleProfil(apt);
  toast('Informations corrigées'); ecranGestionFormateurs();
}

// Garde le rôle du profil (droits d'accès) synchronisé avec la liste d'aptitude,
// pour le cas où le compte de connexion existait déjà avant une modification
// (ex : on coche l'accès GFor sur une personne qui a déjà un compte).
async function synchroniserRoleProfil(aptitude) {
  if (!aptitude.email) return;
  const quals = aptitude.qualifications || [];
  const estRP = quals.some(q => q.role === 'rp');
  // Sans aucune qualification (ni formateur, ni RP), la personne est considérée comme
  // un simple stagiaire (ex : recrue) plutôt que formateur par défaut.
  const nouveauRole = aptitude.gfor ? 'gfor'
    : aptitude.chef_centre ? 'chef_centre'
    : estRP ? 'rp'
    : quals.length ? 'formateur' : 'stagiaire';
  const { error } = await sb.from('profils').update({ role: nouveauRole }).eq('email', aptitude.email);
  if (error) console.warn('Synchronisation profil impossible :', error.message);
}

// ---------- Mon profil (accessible en cliquant sur son identité dans le bandeau) ----------
async function ecranMonProfil() {
  if (!S.user) return;
  const { data: { user } } = await sb.auth.getUser();
  const { data: apt } = await sb.from('aptitudes').select('*').ilike('email', user?.email || '').maybeSingle();

  $('staff-dashboard').innerHTML = `<div class="carte">
    <span class="lien-retour" onclick="ecranAccueilStaff()">← Retour</span>
    <h2>Mon profil</h2>
    <div class="info">Connecté avec : ${esc(user?.email || '')}</div>
    <label>Nom affiché dans l'appli</label>
    <input id="mp-nom" value="${esc(S.user.nom)}">
    <button class="btn secondaire" onclick="enregistrerMonNom()">Enregistrer le nom</button>

    <h3>Changer mon mot de passe</h3>
    <label>Nouveau mot de passe (6 caractères minimum)</label>
    <input id="mp-mdp" type="password">
    <button class="btn secondaire" onclick="changerMonMdp()">Mettre à jour le mot de passe</button>

    ${apt ? `
      <h3>Corriger mes informations (liste d'aptitude)</h3>
      <div class="info">Si une information te concernant est erronée, corrige-la ici directement.</div>
      <div class="ligne">
        <div><label>Matricule</label><input id="mp-mat" value="${esc(apt.matricule || '')}"></div>
        <div><label>Grade</label><select id="mp-grade">${GRADES.map(g => `<option ${g === apt.grade ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      </div>
      <div class="ligne">
        <div><label>Statut</label><select id="mp-statut"><option value="">—</option>${STATUTS.map(s => `<option ${s === apt.statut ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div><label>CIS de rattachement</label>${selectCIS('mp-cis', apt.cis || '')}</div>
      </div>
      <button class="btn secondaire" onclick="enregistrerMesInfosAptitude(${apt.id})">Corriger mes informations</button>
    ` : `<p class="info">Aucune fiche dans la liste d'aptitude associée à cet email — contacte le GFor.</p>`}
  </div>`;
  show('ecran-staff-accueil');
}

async function enregistrerMonNom() {
  const nom = $('mp-nom').value.trim();
  if (!nom) return toast('Nom requis', false);
  const { error } = await sb.from('profils').update({ nom }).eq('id', S.user.id);
  if (error) return toast(error.message, false);
  S.user.nom = nom;
  $('bandeau-user').textContent = nom;
  toast('Nom mis à jour');
}

async function changerMonMdp() {
  const mdp = $('mp-mdp').value;
  if (mdp.length < 6) return toast('6 caractères minimum', false);
  const { error } = await sb.auth.updateUser({ password: mdp });
  toast(error ? error.message : 'Mot de passe mis à jour', !error);
  if (!error) $('mp-mdp').value = '';
}

async function enregistrerMesInfosAptitude(id) {
  const { error } = await sb.from('aptitudes').update({
    matricule: $('mp-mat').value.trim() || null, grade: $('mp-grade').value,
    statut: $('mp-statut').value || null, cis: $('mp-cis').value || null,
  }).eq('id', id);
  if (error) return toast(error.message, false);
  toast('Informations corrigées');
}

// ---------- Import Excel (une ligne par qualification) ----------
function versDateISO(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function importerAptitudes(input) {
  const fichier = input.files[0];
  if (!fichier) return;
  const lecteur = new FileReader();
  lecteur.onload = async e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const lignes = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const brutes = [];
      for (const l of lignes) {
        const o = {};
        for (const k of Object.keys(l)) {
          const c = norm(k);
          if (c.startsWith('matri')) o.matricule = String(l[k]).trim();
          else if (c.startsWith('nom')) o.nom = String(l[k]).trim();
          else if (c.startsWith('pren')) o.prenom = String(l[k]).trim();
          else if (c.startsWith('grade')) o.grade = String(l[k]).trim().toUpperCase();
          else if (c.startsWith('statut')) o.statut = STATUTS.includes(String(l[k]).trim().toUpperCase()) ? String(l[k]).trim().toUpperCase() : null;
          else if (c.startsWith('cis')) o.cis = String(l[k]).trim();
          else if (c.startsWith('email') || c.startsWith('mail')) o.email = String(l[k]).trim().toLowerCase();
          else if (c.startsWith('domaine')) o.domaine = DOMAINES_COMP.find(d => norm(l[k]).includes(d.toLowerCase())) || null;
          else if (c.startsWith('role') || c.startsWith('qualif')) o.role =
            (norm(l[k]).includes('for de for') || norm(l[k]).includes('fdf')) ? 'for_de_for'
            : (norm(l[k]).includes('rp') || norm(l[k]).includes('respon')) ? 'rp' : 'formateur';
          else if (c.includes('valid') || c.includes('fin')) o.fin_validite = versDateISO(l[k]);
          else if (c.startsWith('mdp') || c.includes('motdepasse') || c.startsWith('password'))
            o.mdp = String(l[k] ?? '').trim();
          else if (c.startsWith('gfor')) o.gfor = /^(oui|yes|true|1|x)$/i.test(String(l[k] ?? '').trim());
        }
        if (o.nom && o.prenom) brutes.push(o);
      }
      if (!brutes.length) return toast('Aucune ligne exploitable — vérifier les colonnes (voir le modèle)', false);

      // Regroupement par personne (email, sinon matricule, sinon nom+prénom)
      const { data: existants } = await sb.from('aptitudes').select('*');
      const cle = o => (o.email || '') + '|' + (o.matricule || '') + '|' + norm(o.nom + o.prenom);
      const trouve = o => (existants || []).find(x =>
        (o.email && x.email === o.email) || (o.matricule && x.matricule === o.matricule) ||
        (norm(x.nom + x.prenom) === norm(o.nom + o.prenom)));
      const groupes = {};
      for (const o of brutes) (groupes[cle(o)] = groupes[cle(o)] || []).push(o);

      // Compte GFor courant, pour pouvoir restaurer sa session entre deux créations de compte
      // (sb.auth.signUp() active automatiquement la session du compte qu'il vient de créer).
      const { data: { session: sessionGFor } } = await sb.auth.getSession();

      let nbP = 0, nbQ = 0, nbComptes = 0, nbComptesEchec = 0;
      for (const g of Object.values(groupes)) {
        const o = g[0];
        let pers = trouve(o);
        if (!pers) {
          const ins = await sb.from('aptitudes').insert({
            matricule: o.matricule || null, nom: o.nom, prenom: o.prenom, grade: o.grade || null,
            statut: o.statut || null, cis: o.cis || null, email: o.email || null, gfor: o.gfor || false }).select().single();
          if (ins.error) return toast(ins.error.message, false);
          pers = ins.data; nbP++;
        } else if (o.email && !pers.email) {
          // Complète l'email s'il manquait — nécessaire pour pouvoir créer le compte juste après.
          const upd = await sb.from('aptitudes').update({ email: o.email }).eq('id', pers.id).select().single();
          if (!upd.error) pers = upd.data;
        }
        const qualis = g.filter(x => x.domaine && x.fin_validite)
          .map(x => ({ aptitude_id: pers.id, domaine: x.domaine, role: x.role || 'formateur', fin_validite: x.fin_validite }));
        if (qualis.length) {
          const { error: eq } = await sb.from('qualifications').upsert(qualis, { onConflict: 'aptitude_id,domaine,role' });
          if (eq) return toast(eq.message, false);
          nbQ += qualis.length;
        }

        // Création du compte de connexion si un mot de passe est renseigné dans le fichier
        if (o.mdp && pers.email) {
          if (o.mdp.length < 6) {
            nbComptesEchec++;
          } else {
            const { error: eSignup } = await sb.auth.signUp({ email: pers.email, password: o.mdp });
            if (eSignup) {
              nbComptesEchec++;
            } else {
              nbComptes++;
              // Restaure immédiatement la session du GFor avant de traiter la personne suivante.
              if (sessionGFor) await sb.auth.setSession({ access_token: sessionGFor.access_token, refresh_token: sessionGFor.refresh_token });
            }
          }
        }
      }
      let msg = nbP + ' personne(s) créée(s), ' + nbQ + ' qualification(s) importée(s)';
      if (nbComptes) msg += ', ' + nbComptes + ' compte(s) de connexion créé(s)';
      if (nbComptesEchec) msg += ' (' + nbComptesEchec + ' compte(s) non créé(s) — email déjà utilisé ou mot de passe trop court)';
      toast(msg);
      ecranGestionFormateurs();
    } catch (err) { toast('Fichier illisible : ' + err.message, false); }
  };
  lecteur.readAsArrayBuffer(fichier);
}

function telechargerModeleAptitude() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Matricule', 'Nom', 'Prénom', 'Grade', 'Statut', 'CIS', 'Email', 'Domaine', 'Rôle', 'Fin de validité', 'Mot de passe', 'GFor'],
    ['V0912345', 'GUEGAN', 'Pauline', 'ADC', 'SPV', 'CIS BANNALEC', 'p.guegan@sdis29.fr', 'INCENDIE', 'RP', '31/12/2027', 'motdepasse1', 'non'],
    ['V0912345', 'GUEGAN', 'Pauline', 'ADC', 'SPV', 'CIS BANNALEC', 'p.guegan@sdis29.fr', 'PPBE', 'RP', '31/12/2027', '', ''],
    ['V0912345', 'GUEGAN', 'Pauline', 'ADC', 'SPV', 'CIS BANNALEC', 'p.guegan@sdis29.fr', 'SSUAP', 'Formateur', '30/06/2027', '', ''],
    ['V0954321', 'SINIC', 'Chloé', 'CCH', 'SPP', 'CIS QUIMPERLE', 'c.sinic@sdis29.fr', 'SSUAP', 'Formateur', '30/06/2027', 'autremdp2', 'non'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Aptitudes');
  XLSX.writeFile(wb, 'modele_liste_aptitude.xlsx');
}

async function ecranAccueilStaff() {
  majMenu('dash');
  show('ecran-staff-accueil');
  const [sess, stag, forms, formt] = await Promise.all([
    sb.from('sessions').select('*, formations(*)').order('date_debut', { ascending: true, nullsFirst: false }),
    sb.from('stagiaires').select('id, session_id, cis, nom, prenom'),
    sb.from('session_formateurs').select('id, session_id, nom'),
    sb.from('formations').select('*').eq('actif', true),
  ]);
  if (sess.error) return toast(sess.error.message, false);
  let sessions = sess.data;
  for (const s of sessions) {
    s._nbStag = (stag.data || []).filter(x => x.session_id === s.id).length;
    s._nbForm = (forms.data || []).filter(x => x.session_id === s.id).length;
  }

  // Vision RP / Formateur : ne montrer que ses propres sessions actives ou en préparation
  // (déclaré RP, ou inscrit comme formateur) — les sessions terminées restent visibles de tous.
  // « Vue globale » (GFor uniquement) permet de désactiver ce filtre pour voir/tester comme si
  // on était omniscient, sans avoir besoin d'un second compte.
  sessions = sessions.filter(s => {
    if (s.statut === 'terminee') return true;
    if (S.omniscient) return true;
    if (S.vision === 'rp') return !!(S.user && s.responsable === S.user.nom);
    if (S.vision === 'formateur') return !!(S.user && (forms.data || []).some(f => f.session_id === s.id && f.nom === S.user.nom));
    // Chef de centre : uniquement les sessions où au moins un stagiaire de son CIS est inscrit.
    if (S.vision === 'chef_centre') return !!(S.user && (stag.data || []).some(x => x.session_id === s.id && x.cis === S.user.cis));
    return true;
  });

  // Classement par dates réelles : en cours / en préparation (à venir) / terminées
  const auj = new Date().toISOString().slice(0, 10);
  const enCours = sessions.filter(s => s.date_debut && s.date_fin && s.date_debut <= auj && auj <= s.date_fin && s.statut !== 'terminee');
  const aVenir = sessions.filter(s => (!s.date_debut || s.date_debut > auj) && s.statut !== 'terminee');
  const passees = sessions.filter(s => !enCours.includes(s) && !aVenir.includes(s));

  // À venir : trié par thématique (domaine) puis par date
  aVenir.sort((a, b) => (a.formations.domaine + (a.date_debut || '9999')).localeCompare(b.formations.domaine + (b.date_debut || '9999')));
  const parDomaine = {};
  for (const s of aVenir) (parDomaine[s.formations.domaine] = parDomaine[s.formations.domaine] || []).push(s);

  $('staff-dashboard').innerHTML = `
    ${S.vision === 'chef_centre' ? _carteMesStagiairesChefCentre(enCours, aVenir, stag.data || []) : ''}
    <div class="carte stat-row"><div class="chiffre">${enCours.length}</div><div>session(s) en cours</div></div>
    <div class="carte stat-row"><div class="chiffre">${aVenir.length}</div><div>session(s) en préparation</div></div>
    <div class="carte stat-row"><div class="chiffre">${passees.length}</div><div>session(s) terminée(s)</div></div>
    ${enCours.length ? '<div class="section-titre">🔴 En cours</div>' + enCours.map(carteSession).join('') : ''}
    ${Object.keys(parDomaine).map(d =>
      `<div class="section-titre">📅 En préparation — ${esc(d)}</div>` + parDomaine[d].map(carteSession).join('')).join('')}
    ${!enCours.length && !aVenir.length ? '<div class="carte"><p class="info">Aucune session en cours ou planifiée.</p></div>' : ''}
    ${passees.length ? '<div class="section-titre">✔ Terminées</div>' + passees.map(carteSession).join('') : ''}`;
}

// Carte dédiée en haut du tableau de bord du chef de centre : liste nommément les stagiaires de
// son CIS actuellement en formation (sessions en cours), puis ceux à venir — plutôt que de le
// laisser déduire cette info depuis la liste générique des sessions (peu lisible quand une
// session mélange plusieurs CIS).
function _carteMesStagiairesChefCentre(enCours, aVenir, stagiairesToutesSessions) {
  const cis = S.user ? S.user.cis : null;
  const mesStagiaires = sessions => sessions.map(s => ({
    session: s,
    stagiaires: stagiairesToutesSessions.filter(x => x.session_id === s.id && x.cis === cis),
  })).filter(g => g.stagiaires.length);

  const bloc = (groupes, vide) => groupes.length
    ? groupes.map(g => `<div class="ligne" style="align-items:flex-start;cursor:pointer" onclick="ouvrirSession('${g.session.id}')">
        <div style="flex:1">
          <b>${esc(g.session.formations.libelle)}</b> — ${esc(g.session.lieu || 'lieu à définir')}
          <div class="info">${esc(g.session.date_debut || '?')} → ${esc(g.session.date_fin || '?')}</div>
          <div>${g.stagiaires.map(s => `<span class="badge" style="background:#00695c;color:#fff;margin:2px">${esc(s.prenom)} ${esc(s.nom)}</span>`).join(' ')}</div>
        </div>
      </div>`).join('')
    : `<p class="info">${vide}</p>`;

  const groupesEnCours = mesStagiaires(enCours);
  const groupesAVenir = mesStagiaires(aVenir);
  const nbEnCours = groupesEnCours.reduce((n, g) => n + g.stagiaires.length, 0);

  return `<div class="carte">
    <h2>Mes stagiaires (${esc(cis || 'CIS non renseigné')})</h2>
    <div class="section-titre">🔴 En formation actuellement (${nbEnCours})</div>
    ${bloc(groupesEnCours, 'Aucun stagiaire de ton CIS en formation en ce moment.')}
    <div class="section-titre">📅 À venir</div>
    ${bloc(groupesAVenir, 'Aucun stagiaire de ton CIS inscrit sur une session à venir.')}
  </div>`;
}

// ---------- Vision stagiaire (pour l'encadrement) ----------
async function ecranChoixSessionVision() {
  majMenu();
  show('ecran-staff-accueil');
  const { data: sessions, error } = await sb.from('sessions').select('*, formations(libelle)').order('created_at', { ascending: false });
  if (error) return toast(error.message, false);
  $('staff-dashboard').innerHTML = `<div class="carte">
    <h2>Vision stagiaire — choisir la session</h2>
    ${sessions.length ? sessions.map(s => `<button class="btn-liste" onclick="visionStagiaireSession('${s.id}')">
      <b>${esc(s.formations.libelle)}</b> — ${esc(s.lieu || '')} (${esc(s.code_acces)})</button>`).join('')
      : '<p class="info">Aucune session disponible.</p>'}
  </div>`;
}

async function visionStagiaireSession(sessionId) {
  const { data: sess, error } = await sb.from('sessions').select('*').eq('id', sessionId).single();
  if (error) return toast(error.message, false);
  S.session = sess;
  await chargerFormation(sess.formation_id);
  const { data: stags } = await sb.from('stagiaires').select('*').eq('session_id', sessionId).order('nom');
  if (!stags || !stags.length) return toast('Aucun stagiaire dans cette session', false);
  window._stags = stags;
  $('staff-dashboard').innerHTML = `<div class="carte">
    <h2>Voir la formation comme quel stagiaire ?</h2>
    ${stags.map(st => `<button class="btn-liste" onclick="visionStagiaireNom(${st.id})">${esc(st.prenom)} ${esc(st.nom)}</button>`).join('')}
  </div>`;
}

function visionStagiaireNom(id) {
  S.stagiaire = window._stags.find(s => s.id === id);
  ecranAccueilStagiaire();
}

async function creerSession() {
  const sel = $('ns-formation');
  const fCode = sel.selectedOptions[0].dataset.code;
  const code = fCode + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const optR = $('ns-resp').selectedOptions[0];
  const responsable = optR && optR.value ? optR.dataset.nom : null;
  const dateFinS = $('ns-fin').value || null;
  if (optR && optR.value && dateFinS && optR.dataset.fin < dateFinS)
    return toast('Impossible : la qualification RP de ' + optR.dataset.nom + ' expire le ' + optR.dataset.fin + ', avant la fin de la session.', false);
  // Seuils NA/ECA « avis du jury » repris des valeurs par défaut de la formation
  // (réglables ensuite finement session par session dans l'onglet Paramètres).
  const formationChoisie = (window._formations || []).find(x => x.id === Number(sel.value));
  // Session FMPA (formation continue) : rattachement au programme de l'année + séquences cochées.
  const estFMPA = formationChoisie && formationChoisie.type_formation === 'continue';
  const progSelect = $('ns-fmpa-prog');
  const programmeId = estFMPA && progSelect && progSelect.value ? Number(progSelect.value) : null;
  const sequenceIds = estFMPA
    ? [...document.querySelectorAll('.ns-fmpa-seq:checked')].map(el => Number(el.value))
    : [];
  if (estFMPA && window._programmesFMPADispo && window._programmesFMPADispo.length && !sequenceIds.length)
    return toast('Cocher au moins une séquence FMPA couverte par cette session', false);
  const { data, error } = await sb.from('sessions').insert({
    formation_id: Number(sel.value),
    code_acces: code,
    lieu: $('ns-lieu').value || null,
    date_debut: $('ns-debut').value || null,
    date_fin: $('ns-fin').value || null,
    responsable,
    seuil_na_jury: (formationChoisie && formationChoisie.seuil_na_jury_defaut) || 2,
    seuil_eca_jury: (formationChoisie && formationChoisie.seuil_eca_jury_defaut) || 4,
    programme_fmpa_id: programmeId,
  }).select().single();
  if (error) return toast(error.message, false);
  if (sequenceIds.length) {
    const { error: e2 } = await sb.from('session_sequences_fmpa').insert(
      sequenceIds.map(sid => ({ session_id: data.id, sequence_fmpa_id: sid })));
    if (e2) toast('Session créée, mais erreur sur les séquences FMPA : ' + e2.message, false);
  }
  toast('Session créée — code stagiaire : ' + code);
  ouvrirSession(data.id);
}

// ============================================================
// SESSION — chargement des données + onglets
// ============================================================
async function chargerDonneesSession(sessionId) {
  const [stag, form, pass, equi, evals, autos, bilans, planning, entretiens, avisFin] = await Promise.all([
    sb.from('stagiaires').select('*').eq('session_id', sessionId).order('nom'),
    sb.from('session_formateurs').select('*').eq('session_id', sessionId).order('nom'),
    sb.from('passages').select('*').eq('session_id', sessionId).order('numero'),
    sb.from('passage_equipiers').select('*, passages!inner(session_id)').eq('passages.session_id', sessionId),
    sb.from('evaluations').select('*, passages!inner(session_id)').eq('passages.session_id', sessionId),
    sb.from('autoevaluations').select('*, passages!inner(session_id)').eq('passages.session_id', sessionId),
    sb.from('bilans_journaliers').select('*').eq('session_id', sessionId),
    sb.from('blocs_planning').select('*').eq('session_id', sessionId).order('ordre'),
    sb.from('entretiens_individuels').select('*').eq('session_id', sessionId),
    sb.from('avis_fin_stage').select('*').eq('session_id', sessionId),
  ]);
  for (const r of [stag, form, pass, equi, evals, autos, bilans, planning, entretiens, avisFin]) if (r.error) throw r.error;
  S.data = {
    stagiaires: stag.data, formateurs: form.data, passages: pass.data,
    equipiers: equi.data, evaluations: evals.data, autoevaluations: autos.data,
    bilansJournaliers: bilans.data, blocsPlanning: planning.data, entretiens: entretiens.data,
    avisFinStage: avisFin.data,
  };

  // Marque directement chaque formateur ISP (qualification role='isp') sur S.data.formateurs, pour
  // que le chronogramme (planning.js/pdf.js) puisse déterminer le(s) jour(s) de présence ISP sans
  // dépendre d'un chargement préalable de l'onglet Équipe pédagogique.
  const aptiIds = (form.data || []).map(f => f.aptitude_id).filter(Boolean);
  if (aptiIds.length) {
    const { data: qualis } = await sb.from('qualifications').select('aptitude_id, role').in('aptitude_id', aptiIds).eq('role', 'isp');
    const idsISP = new Set((qualis || []).map(q => q.aptitude_id));
    S.data.formateurs.forEach(f => { f._isp = f.aptitude_id ? idsISP.has(f.aptitude_id) : false; });
  } else {
    S.data.formateurs.forEach(f => { f._isp = false; });
  }
}

// Jour(s) de présence ISP de la session, dérivés de la présence (jour_debut/jour_fin) du ou des
// formateurs qualifiés ISP inscrits dans l'équipe pédagogique — pas d'un champ séparé, puisque la
// disponibilité réelle de l'ISP dépend de son planning propre et se règle au même endroit que la
// présence de n'importe quel formateur (onglet Équipe pédagogique).
function joursPresenceISP() {
  const nbJours = (S.formation && S.formation.nb_jours) || 5;
  const jours = new Set();
  (S.data.formateurs || []).filter(f => f._isp).forEach(f => {
    const jd = f.jour_debut || 1;
    const jf = f.jour_fin || nbJours;
    for (let d = jd; d <= jf; d++) jours.add('J' + d);
  });
  return jours;
}

// Suppression d'une session non clôturée (GFor uniquement, cf. carteSession) — toutes les données
// rattachées (stagiaires, passages, évaluations, entretiens, formateurs, séquences FMPA...) sont
// supprimées en cascade par la base (foreign keys on delete cascade), en un seul delete ici.
async function supprimerSession(sessionId) {
  const { data: sess } = await sb.from('sessions').select('code_acces, statut').eq('id', sessionId).single();
  if (sess && sess.statut === 'terminee') return toast('Cette session est clôturée — suppression impossible', false);
  if (!confirm(`Supprimer définitivement la session ${sess ? sess.code_acces : ''} ? Toutes ses données (stagiaires, évaluations, entretiens...) seront perdues. Cette action est irréversible.`)) return;
  const { error } = await sb.from('sessions').delete().eq('id', sessionId);
  if (error) return toast(error.message, false);
  toast('Session supprimée');
  ecranAccueilStaff();
}

async function ouvrirSession(sessionId) {
  const { data: sess, error } = await sb.from('sessions').select('*, formations(libelle)').eq('id', sessionId).single();
  if (error) return toast(error.message, false);
  S.session = sess;
  await chargerFormation(sess.formation_id);
  await chargerDonneesSession(sessionId);
  // Blocs de planning imposés par la formation (réactivation de mémoire, bilan journalier...) :
  // instanciés dès l'ouverture de la session (pas seulement quand on visite l'onglet
  // Chronogramme), pour qu'ils soient déjà en place si un stagiaire consulte son programme avant
  // que le RP n'ait ouvert cet onglet lui-même. Fonction définie dans planning.js — protégée par
  // ce typeof pour ne jamais faire planter l'appli si ce fichier n'a pas encore été ré-uploadé.
  if (typeof assurerBlocsPlanningFixes === 'function') {
    const aCree = await assurerBlocsPlanningFixes();
    if (aCree) await chargerDonneesSession(sessionId);
  }

  $('session-titre').textContent = sess.formations.libelle + ' — ' + (sess.lieu || '');
  $('session-infos').textContent =
    (sess.date_debut || '?') + ' → ' + (sess.date_fin || '?') +
    ' · Responsable : ' + (sess.responsable || '?') +
    ' · Code stagiaire : ' + sess.code_acces;

  // Chef de centre : accès restreint au seul suivi MSP (filtré sur les stagiaires de son CIS),
  // pas de gestion des stagiaires/formateurs/évaluations des autres centres.
  // Formateur (simple, sans casquette RP) : pas d'accès à la Feuille de garde (organisation des
  // MSP) ni à l'onglet Validation (décision de certification) — ce sont des attributions RP/GFor.
  // Les onglets Stagiaires et Chronogramme restent visibles mais allégés (voir ongletStagiaires
  // et _rendreOngletPlanning : simple consultation, pas de gestion).
  const onglets = S.vision === 'chef_centre'
    ? [['msp', 'Suivi MSP']]
    : S.vision === 'formateur'
    ? [
        ['stagiaires', 'Stagiaires'], ['formateurs', 'Formateurs'],
        ['evaluations', 'Évaluations'], ['msp', 'Suivi MSP'], ['comparatif', 'Comparatif'],
        ['bilanjour', 'Bilan journalier'], ['planning', 'Chronogramme'], ['avis', 'Mon avis de fin de stage'],
      ]
    : [
        ['stagiaires', 'Stagiaires'], ['formateurs', 'Formateurs'], ['garde', 'Feuille de garde'],
        ['evaluations', 'Évaluations'], ['msp', 'Suivi MSP'], ['validation', 'Validation'], ['comparatif', 'Comparatif'],
        ['bilanjour', 'Bilan journalier'], ['planning', 'Chronogramme'], ['avis', 'Mon avis de fin de stage'],
      ];
  // Réglages du stage, entretiens individuels, PV de stage et compte rendu de fin de stage :
  // réservés au RP et au GFor
  if (S.vision === 'rp' || S.vision === 'gfor') {
    onglets.push(['entretiens', 'Entretiens individuels']);
    onglets.push(['compterendu', 'Compte rendu de fin de stage']);
    onglets.push(['parametres', 'Paramètres']);
  }
  $('session-onglets').innerHTML = onglets.map(([id, lbl]) =>
    `<button id="ong-${id}" onclick="ongletSession('${id}')">${lbl}</button>`).join('');
  show('ecran-session');
  ongletSession(S.vision === 'chef_centre' ? 'msp' : S.vision === 'formateur' ? 'evaluations' : 'stagiaires');
}

function ongletSession(id) {
  document.querySelectorAll('#session-onglets button').forEach(b => b.classList.remove('actif'));
  // L'onglet peut être absent du menu (ex : « entretiens » ouvert directement depuis les Archives
  // par un chef de centre, qui n'a pas ce bouton dans sa barre d'onglets) — sans casser l'affichage.
  const bouton = $('ong-' + id);
  if (bouton) bouton.classList.add('actif');
  ({ stagiaires: ongletStagiaires, formateurs: ongletFormateurs, garde: ongletGarde,
     evaluations: ongletEvaluations, msp: ongletSuiviMSP, validation: ongletValidation, comparatif: ongletComparatif,
     bilanjour: ongletBilanJournalier, planning: ongletPlanning, entretiens: ongletEntretiens,
     avis: ongletAvisFinStage, compterendu: ongletCompteRenduFinStage, parametres: ongletParametresStage }[id])();
}

// ---------- Onglet Stagiaires ----------
// Vision formateur (simple, sans casquette RP) : accès allégé, juste la liste (photo, nom,
// prénom, matricule, CIS) + la prise de photo, sans les actions de gestion (compte personnel,
// historique, suppression, ajout/import) qui restent réservées au RP/GFor.
function ongletStagiaires() {
  const allege = S.vision === 'formateur';
  const lignes = S.data.stagiaires.map(s => `
    <tr>
      <td>${s.photo_url ? `<img src="${esc(s.photo_url)}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;vertical-align:middle">` : `<span class="avatar-stag" style="width:32px;height:32px;font-size:11px">${esc(initiales(s))}</span>`}</td>
      <td>${esc(s.nom)}</td><td>${esc(s.prenom)}</td><td>${esc(s.matricule || '')}</td><td>${esc(s.cis || '')}</td>
      ${allege ? '' : `<td>${s.aptitude_id
        ? '<span class="statut-valide" title="Identité stable liée (photo/historique partagés entre stages) — ne veut pas forcément dire qu\'un compte de connexion (email + mot de passe) a été créé. Voir 🔑 pour ça.">🪪 identité liée</span>'
        : '<span class="info">—</span>'}</td>`}
      <td style="white-space:nowrap">
        <label class="btn petit secondaire" style="cursor:pointer">📷<input type="file" accept="image/*" style="display:none" onchange="uploaderPhotoStagiaire(${s.id}, this)"></label>
        ${allege ? '' : `
        <button class="btn petit secondaire" title="Compte personnel" onclick="ecranCompteStagiaire(${s.id})">🔑</button>
        ${s.aptitude_id ? `<button class="btn petit secondaire" title="Historique multi-stages" onclick="voirHistoriqueStagiaire(${s.aptitude_id})">🕘</button>` : ''}
        <button class="btn petit secondaire" onclick="supprStagiaire(${s.id})">✕</button>`}
      </td>
    </tr>`).join('');
  $('session-contenu').innerHTML = `
    <div class="carte">
      <h2>Stagiaires (${S.data.stagiaires.length})</h2>
      <div class="info">${allege ? '📷 = ajouter/mettre à jour la photo du stagiaire.' : '📷 = photo (grille d\'évaluation par équipe) · 🔑 = créer/lier le compte personnel du stagiaire (suivi de son parcours sur plusieurs stages) · 🕘 = voir son historique d\'autres stages, une fois le compte lié.'}</div>
      ${allege ? '' : '<button class="btn secondaire" onclick="genererChevalets()">🎪 Générer les chevalets (toute la session)</button>'}
      <div class="table-scroll"><table>
        <tr><th>Photo</th><th>Nom</th><th>Prénom</th><th>Matricule</th><th>CIS</th>${allege ? '' : '<th>Compte</th>'}<th></th></tr>${lignes}
      </table></div>
      ${allege ? '' : `
      <h3>Ajouter un stagiaire</h3>
      <div class="ligne">
        <div><label>Nom</label><input id="st-nom"></div>
        <div><label>Prénom</label><input id="st-prenom"></div>
      </div>
      <div class="ligne">
        <div><label>Matricule</label><input id="st-mat"></div>
        <div><label>CIS de rattachement</label>${selectCIS('st-cis')}</div>
      </div>
      <button class="btn" onclick="ajouterStagiaire()">Ajouter</button>

      <h3>Import Excel</h3>
      <p class="info">Colonnes attendues : Civilité, Nom, Prénom, Matricule, CIS. Utile pour charger directement une liste de convocation exportée d'un autre logiciel (ex. GEEF) : exporte la liste en Excel/CSV, réordonne au besoin les colonnes selon le modèle ci-dessous, puis importe.</p>
      <button class="btn secondaire" onclick="telechargerModeleStagiaires()">📄 Télécharger le modèle</button>
      <label style="margin-top:10px">Fichier à importer (.xlsx)</label>
      <input type="file" accept=".xlsx,.xls,.csv" onchange="importerStagiaires(this)">`}
    </div>`;
}

function telechargerModeleStagiaires() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Civilité', 'Nom', 'Prénom', 'Matricule', 'CIS'],
    ['M', 'BERNARD', 'Esteban', 'V0911111', 'CIS BANNALEC'],
    ['Mme', 'JORAND', 'Romane', 'V0922222', 'CIS QUIMPERLE'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stagiaires');
  XLSX.writeFile(wb, 'modele_stagiaires.xlsx');
}

function importerStagiaires(input) {
  const fichier = input.files[0];
  if (!fichier) return;
  const lecteur = new FileReader();
  lecteur.onload = async e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const lignes = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const { data: aptitudes } = await sb.from('aptitudes').select('*');
      const rows = [];
      for (const l of lignes) {
        const o = { session_id: S.session.id };
        for (const k of Object.keys(l)) {
          const c = norm(k);
          if (c.startsWith('nom')) o.nom = String(l[k]).trim();
          else if (c.startsWith('pren')) o.prenom = String(l[k]).trim();
          else if (c.startsWith('matri')) o.matricule = String(l[k]).trim();
          else if (c.startsWith('cis')) o.cis = String(l[k]).trim();
          else if (c.startsWith('civil')) {
            const v = norm(l[k]);
            o.civilite = v.startsWith('mme') || v.startsWith('mde') ? 'Mme' : v.startsWith('m') ? 'M' : null;
          }
        }
        // pas de doublon : on ignore les stagiaires déjà présents dans la session
        if (o.nom && o.prenom && !S.data.stagiaires.some(s =>
          norm(s.nom + s.prenom) === norm(o.nom + o.prenom))) {
          // Rattachement automatique à une fiche d'identité déjà connue (autre stage suivi, ou
          // formateur) — récupère aussi sa photo commune sans action supplémentaire.
          const apt = (aptitudes || []).find(a => o.matricule && a.matricule === o.matricule) ||
            (aptitudes || []).find(a => norm(a.nom + a.prenom) === norm(o.nom + o.prenom));
          if (apt) { o.aptitude_id = apt.id; if (apt.photo_url) o.photo_url = apt.photo_url; }
          rows.push(o);
        }
      }
      if (!rows.length) return toast('Aucune ligne exploitable ou stagiaires déjà tous présents', false);
      const { error } = await sb.from('stagiaires').insert(rows);
      if (error) return toast(error.message, false);
      toast(rows.length + ' stagiaire(s) importé(s)');
      await chargerDonneesSession(S.session.id); ongletStagiaires();
    } catch (err) { toast('Fichier illisible : ' + err.message, false); }
  };
  lecteur.readAsArrayBuffer(fichier);
}

async function ajouterStagiaire() {
  const nom = $('st-nom').value.trim(), prenom = $('st-prenom').value.trim();
  if (!nom || !prenom) return toast('Nom et prénom requis', false);
  const matricule = $('st-mat').value.trim() || null;
  const { data: nouveau, error } = await sb.from('stagiaires').insert({
    session_id: S.session.id, nom, prenom,
    matricule, cis: $('st-cis').value || null,
  }).select().single();
  if (error) return toast(error.message, false);
  // Si cette personne a déjà une fiche d'identité (autre stage suivi, ou formateur), on la
  // rattache automatiquement et on récupère sa photo commune sans action supplémentaire.
  const apt = await _trouverAptitudeCorrespondante(nom, prenom, matricule);
  if (apt) await sb.from('stagiaires').update({ aptitude_id: apt.id, photo_url: apt.photo_url || null }).eq('id', nouveau.id);
  await chargerDonneesSession(S.session.id); ongletStagiaires(); toast('Stagiaire ajouté');
}

async function supprStagiaire(id) {
  if (!confirm('Supprimer ce stagiaire et toutes ses évaluations ?')) return;
  const { error } = await sb.from('stagiaires').delete().eq('id', id);
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id); ongletStagiaires();
}

// ---------- Rapprochement avec l'identité stable (aptitudes) ----------
// Une même personne physique a une ligne « stagiaire » par session mais une seule fiche
// d'identité stable dans aptitudes. On la retrouve par matricule (fiable) ou à défaut par
// nom+prénom, pour partager entre stages tout ce qui est propre à la personne (photo, historique).
async function _trouverAptitudeCorrespondante(nom, prenom, matricule) {
  const { data: candidats } = await sb.from('aptitudes').select('*');
  if (!candidats) return null;
  return candidats.find(a => matricule && a.matricule === matricule) ||
    candidats.find(a => (a.nom + a.prenom).toLowerCase() === (nom + prenom).toLowerCase()) || null;
}

// Retourne l'aptitude déjà liée à ce stagiaire, ou la retrouve/la crée (même logique de
// rapprochement que creerCompteStagiaire) — utilisé pour rattacher une photo sans forcément
// passer par la création d'un compte de connexion.
async function _resoudreOuCreerAptitude(s) {
  if (s.aptitude_id) {
    const { data } = await sb.from('aptitudes').select('*').eq('id', s.aptitude_id).maybeSingle();
    if (data) return data;
  }
  const existant = await _trouverAptitudeCorrespondante(s.nom, s.prenom, s.matricule);
  if (existant) {
    if (!s.aptitude_id) await sb.from('stagiaires').update({ aptitude_id: existant.id }).eq('id', s.id);
    return existant;
  }
  const { data: nouveau, error } = await sb.from('aptitudes').insert({
    matricule: s.matricule || null, nom: s.nom, prenom: s.prenom, cis: s.cis || null,
  }).select().single();
  if (error) throw error;
  await sb.from('stagiaires').update({ aptitude_id: nouveau.id }).eq('id', s.id);
  return nouveau;
}

// ---------- Photo du stagiaire (bucket Supabase Storage « photos-stagiaires ») ----------
// La photo est désormais rattachée à l'identité stable (aptitudes), commune à tous les stages
// de la personne : un formateur qui met à jour la photo la met à jour partout, sans avoir à la
// re-déposer à chaque nouveau stage.
async function uploaderPhotoStagiaire(id, input) {
  const fichier = input.files[0];
  if (!fichier) return;
  if (fichier.size > 3 * 1024 * 1024) return toast('Photo trop lourde (3 Mo maximum)', false);
  const s = S.data.stagiaires.find(x => x.id === id);
  if (!s) return;
  let apt;
  try { apt = await _resoudreOuCreerAptitude(s); }
  catch (err) { return toast('Rattachement identité impossible : ' + err.message, false); }

  const ext = (fichier.name.split('.').pop() || 'jpg').toLowerCase();
  const chemin = 'apt-' + apt.id + '/' + Date.now() + '.' + ext;
  const { error: eUp } = await sb.storage.from('photos-stagiaires').upload(chemin, fichier, { upsert: true });
  if (eUp) return toast('Envoi impossible : ' + eUp.message, false);
  const { data: pub } = sb.storage.from('photos-stagiaires').getPublicUrl(chemin);

  const { error: eApt } = await sb.from('aptitudes').update({ photo_url: pub.publicUrl }).eq('id', apt.id);
  if (eApt) return toast(eApt.message, false);
  // Photo commune : répercutée sur tous les stages déjà enregistrés de cette personne, pas
  // seulement la session en cours.
  const { error: eMaj } = await sb.from('stagiaires').update({ photo_url: pub.publicUrl }).eq('aptitude_id', apt.id);
  if (eMaj) return toast(eMaj.message, false);
  await chargerDonneesSession(S.session.id); ongletStagiaires();
  toast('Photo enregistrée — commune à tous les stages de ' + s.prenom + ' ' + s.nom);
}

// ---------- Compte personnel du stagiaire ----------
// Un stagiaire est aussi, potentiellement, une personne de la liste d'aptitude (un formateur CCH
// peut par exemple devenir stagiaire sur une session CA1E1E) : on réutilise la même table
// « aptitudes » comme identité stable de la personne, quel que soit son rôle du moment.
// stagiaires.aptitude_id relie la ligne « stagiaire » (propre à une session) à cette identité,
// ce qui permet de retrouver tout son parcours (formateur ou stagiaire) au même endroit.
async function ecranCompteStagiaire(id) {
  const s = S.data.stagiaires.find(x => x.id === id);
  if (!s) return;
  let apt = null;
  if (s.aptitude_id) {
    const { data } = await sb.from('aptitudes').select('*').eq('id', s.aptitude_id).maybeSingle();
    apt = data;
  } else {
    // Suggestion de rapprochement : une personne existante dans la liste d'aptitude
    // (même matricule, ou même nom + prénom) est peut-être déjà cette personne.
    const { data: candidats } = await sb.from('aptitudes').select('*');
    apt = (candidats || []).find(a =>
      (s.matricule && a.matricule === s.matricule)) ||
      (candidats || []).find(a => (a.nom + a.prenom).toLowerCase() === (s.nom + s.prenom).toLowerCase()) || null;
  }
  $('session-contenu').innerHTML = `<div class="carte">
    <span class="lien-retour" onclick="ongletStagiaires()">← Retour aux stagiaires</span>
    <h2>Compte personnel — ${esc(s.prenom)} ${esc(s.nom)}</h2>
    ${s.aptitude_id
      ? `<div class="info">Déjà relié à la liste d'aptitude (identité stable) — email : ${esc(apt?.email || 'non renseigné')}.</div>`
      : apt
        ? `<div class="info">Une fiche correspondante existe déjà dans la liste d'aptitude (${esc(apt.prenom)} ${esc(apt.nom)}${apt.matricule ? ', matricule ' + esc(apt.matricule) : ''}) — elle sera reliée à ce stagiaire pour permettre le suivi de son parcours.</div>`
        : `<div class="info">Aucune fiche correspondante trouvée — une nouvelle fiche d'identité sera créée pour cette personne.</div>`}
    <label>Email (compte de connexion)</label>
    <input id="cs-email" type="email" value="${esc(apt?.email || '')}">
    <label>Mot de passe à créer (laisser vide pour ne relier que l'identité, sans créer le compte maintenant)</label>
    <input id="cs-mdp" type="password" placeholder="6 caractères minimum">
    <button class="btn" onclick="creerCompteStagiaire(${id})">Enregistrer</button>
  </div>`;
}

async function creerCompteStagiaire(id) {
  const s = S.data.stagiaires.find(x => x.id === id);
  if (!s) return;
  const email = $('cs-email').value.trim().toLowerCase();
  const mdp = $('cs-mdp').value;

  let aptitudeId = s.aptitude_id;
  if (!aptitudeId) {
    // Rapprochement identique à ecranCompteStagiaire, refait ici pour ne pas dépendre de l'état d'écran.
    const { data: candidats } = await sb.from('aptitudes').select('*');
    const existant = (candidats || []).find(a => (s.matricule && a.matricule === s.matricule)) ||
      (candidats || []).find(a => (a.nom + a.prenom).toLowerCase() === (s.nom + s.prenom).toLowerCase());
    if (existant) {
      aptitudeId = existant.id;
      if (email && !existant.email) await sb.from('aptitudes').update({ email }).eq('id', existant.id);
    } else {
      const { data: nouveau, error: eIns } = await sb.from('aptitudes').insert({
        matricule: s.matricule || null, nom: s.nom, prenom: s.prenom, cis: s.cis || null, email: email || null,
      }).select().single();
      if (eIns) return toast(eIns.message, false);
      aptitudeId = nouveau.id;
    }
    const { error: eLien } = await sb.from('stagiaires').update({ aptitude_id: aptitudeId }).eq('id', id);
    if (eLien) return toast(eLien.message, false);
    // Photo commune : si l'identité retrouvée a déjà une photo (déposée lors d'un autre stage)
    // et que ce stagiaire n'en a pas encore, on la récupère automatiquement.
    if (existant && existant.photo_url && !s.photo_url) {
      await sb.from('stagiaires').update({ photo_url: existant.photo_url }).eq('id', id);
    }
  } else if (email) {
    await sb.from('aptitudes').update({ email }).eq('id', aptitudeId);
  }

  if (mdp) {
    if (mdp.length < 6) {
      toast('Identité enregistrée, mais mot de passe ignoré (6 caractères minimum)', false);
    } else if (!email) {
      toast('Identité enregistrée, mais compte non créé : renseigner un email', false);
    } else {
      const { data: { session: sessionActuelle } } = await sb.auth.getSession();
      const { data: inscription, error: eSignup } = await sb.auth.signUp({ email, password: mdp });
      if (eSignup) {
        toast('Identité enregistrée, mais compte non créé : ' + eSignup.message, false);
      } else if (inscription.session) {
        // signUp a activé la session du nouveau compte à la place de la tienne : on se déconnecte
        // immédiatement pour ne pas rester connecté à sa place.
        await sb.auth.signOut();
        toast('Compte créé pour ' + s.prenom + ' ' + s.nom + ' — reconnecte-toi maintenant.');
        show('ecran-login');
        return;
      } else {
        toast('Identité enregistrée, compte créé — confirmation par email encore requise avant sa 1ère connexion.');
      }
      if (sessionActuelle) await sb.auth.setSession({ access_token: sessionActuelle.access_token, refresh_token: sessionActuelle.refresh_token });
    }
  } else {
    toast('Identité enregistrée');
  }
  await chargerDonneesSession(S.session.id); ongletStagiaires();
}

// Historique multi-stages d'une personne (formateur devenu stagiaire, ou stagiaire ayant
// déjà suivi d'autres stages) : consultable par RP/GFor depuis l'onglet Stagiaires.
async function voirHistoriqueStagiaire(aptitudeId) {
  const { data: passages, error } = await sb.from('stagiaires')
    .select('*, sessions(*, formations(libelle, couleur))').eq('aptitude_id', aptitudeId);
  if (error) return toast(error.message, false);
  const lignes = (passages || [])
    .sort((a, b) => (b.sessions?.date_debut || '').localeCompare(a.sessions?.date_debut || ''))
    .map(p => `<div class="carte carte-session" style="border-left-color:${esc(p.sessions?.formations?.couleur || '#607d8b')}" onclick="ouvrirSession('${p.sessions?.id}')">
        <b>${esc(p.sessions?.formations?.libelle || '?')}</b> — ${esc(p.sessions?.lieu || '')}
        <div class="info">${esc(p.sessions?.date_debut || '?')} → ${esc(p.sessions?.date_fin || '?')}
          ${p.decision_jury ? ' · Décision : ' + (p.decision_jury === 'valide' ? '✅ Validé' : '❌ Non validé') : ''}</div>
        <button class="btn petit secondaire" style="margin-top:6px" onclick="event.stopPropagation(); genererLivretHistorique('${p.sessions?.id}', ${p.id}, this)">📘 Consulter le livret de ce stage</button>
      </div>`).join('');
  $('session-contenu').innerHTML = `<div class="carte">
    <span class="lien-retour" onclick="ongletStagiaires()">← Retour aux stagiaires</span>
    <h2>Historique des stages</h2>
    <div class="info">Tous les stages suivis par cette personne, tous rôles confondus (formateur pouvant devenir stagiaire, etc.). Cliquer sur un stage l'ouvre, ou télécharger directement son livret de certification pour voir comment il/elle s'en est sorti (difficultés, décision du jury…).</div>
    ${lignes || '<p class="info">Aucun autre stage enregistré.</p>'}
  </div>`;
}

// Génère le livret de certification d'un stage passé directement depuis l'historique multi-stages,
// sans avoir à naviguer manuellement dans cette session (utile pour un formateur qui veut savoir
// rapidement comment s'est passé un stage précédent — difficultés rencontrées, décision du jury…).
// Recharge temporairement session/formation/données dans l'état global S, comme le ferait
// ouvrirSession(), car genererLivretCertification() en dépend.
async function genererLivretHistorique(sessionId, stagiaireId, bouton) {
  if (!sessionId) return toast('Session introuvable', false);
  if (bouton) { bouton.disabled = true; bouton.textContent = 'Génération…'; }
  try {
    const { data: sess, error } = await sb.from('sessions').select('*, formations(libelle)').eq('id', sessionId).single();
    if (error) throw error;
    S.session = sess;
    await chargerFormation(sess.formation_id);
    await chargerDonneesSession(sessionId);
    await genererLivretCertification(stagiaireId);
  } catch (err) {
    toast('Livret impossible : ' + err.message, false);
  } finally {
    if (bouton) { bouton.disabled = false; bouton.textContent = '📘 Consulter le livret de ce stage'; }
  }
}

// ============================================================
// ARCHIVES — entretiens individuels signés & PV de stage générés, au-delà de la session
// actuellement ouverte (ex : un RP retrouvant un stagiaire déjà rencontré sur un stage
// précédent, ou le chef de centre consultant les entretiens des stagiaires de son CIS).
// Accès en lecture pour RP/GFor/chef de centre ; l'édition reste réservée à l'onglet
// « Entretiens individuels » / « Paramètres » de la session concernée.
// ============================================================
async function ecranArchives() {
  majMenu('archives');
  show('ecran-staff-accueil');
  const filtreCis = S.vision === 'chef_centre' ? (S.user ? S.user.cis : null) : null;

  const [entRes, pvRes] = await Promise.all([
    sb.from('entretiens_individuels')
      .select('*, stagiaires(nom, prenom, cis), sessions(lieu, date_debut, date_fin, code_acces, formations(libelle))')
      .not('signe_le', 'is', null)
      .order('signe_le', { ascending: false }),
    sb.from('sessions')
      .select('*, formations(libelle), stagiaires(cis)')
      .not('pv_genere_le', 'is', null)
      .order('pv_genere_le', { ascending: false }),
  ]);
  if (entRes.error) return toast(entRes.error.message, false);
  if (pvRes.error) return toast(pvRes.error.message, false);

  const entretiens = (entRes.data || []).filter(e => !filtreCis || (e.stagiaires && e.stagiaires.cis === filtreCis));
  const sessionsPV = (pvRes.data || []).filter(s => !filtreCis || (s.stagiaires || []).some(st => st.cis === filtreCis));

  const lignesEnt = entretiens.map(e => `<tr>
      <td>${esc(e.sessions && e.sessions.formations ? e.sessions.formations.libelle : '')}</td>
      <td>${esc(e.sessions ? e.sessions.lieu || '' : '')}</td>
      <td>${esc(e.stagiaires ? e.stagiaires.prenom + ' ' + e.stagiaires.nom : '')}</td>
      <td>${e.type === 'mi_parcours' ? 'Mi-parcours' : 'Fin de stage'}</td>
      <td>${e.decision !== 'normal' ? (e.decision === 'ajournement' ? '⚠️ Ajournement' : '🔁 Résolution') : '—'}</td>
      <td>${esc((e.signe_le || '').slice(0, 10))}</td>
      <td><button class="btn petit secondaire" onclick="_ouvrirArchiveEntretien('${e.session_id}', ${e.stagiaire_id}, '${e.type}')">Ouvrir</button></td>
    </tr>`).join('');

  const lignesPV = sessionsPV.map(s => `<tr>
      <td>${esc(s.formations ? s.formations.libelle : '')}</td>
      <td>${esc(s.lieu || '')}</td>
      <td>${esc(s.date_debut || '')} → ${esc(s.date_fin || '')}</td>
      <td>${esc((s.pv_genere_le || '').slice(0, 10))}</td>
      <td><button class="btn petit secondaire" onclick="ouvrirSession('${s.id}')">Ouvrir la session</button></td>
    </tr>`).join('');

  $('staff-dashboard').innerHTML = `<div class="carte">
    <h2>Archives — entretiens individuels & PV de stage</h2>
    <div class="info">Consultation des entretiens signés et des PV de stage générés, au-delà de la session actuellement ouverte.${filtreCis ? ' Filtré sur ' + esc(filtreCis) + '.' : ''}</div>
    <h3>Entretiens individuels signés</h3>
    <div class="table-scroll"><table>
      <tr><th>Formation</th><th>Lieu</th><th>Stagiaire</th><th>Type</th><th>Décision</th><th>Signé le</th><th></th></tr>
      ${lignesEnt || '<tr><td colspan="7"><span class="info">Aucun entretien signé pour l\'instant.</span></td></tr>'}
    </table></div>
    <h3 style="margin-top:20px">PV de stage générés</h3>
    <div class="table-scroll"><table>
      <tr><th>Formation</th><th>Lieu</th><th>Dates</th><th>Généré le</th><th></th></tr>
      ${lignesPV || '<tr><td colspan="5"><span class="info">Aucun PV généré pour l\'instant.</span></td></tr>'}
    </table></div>
  </div>`;
}

async function _ouvrirArchiveEntretien(sessionId, stagiaireId, type) {
  await ouvrirSession(sessionId);
  ongletSession('entretiens');
  formEntretien(stagiaireId, type);
}

// ---------- Mon parcours (stagiaire) — accessible à toute personne de la liste d'aptitude,
// que ce soit son espace principal (compte « stagiaire » pur) ou un complément à son espace
// formateur/RP/GFor habituel (ex : formateur CCH devenu stagiaire sur une session CA1E1E).
async function ecranMonParcoursStagiaire() {
  majMenu('parcours');
  show('ecran-staff-accueil');
  const { data: { user } } = await sb.auth.getUser();
  const { data: apt } = await sb.from('aptitudes').select('*').ilike('email', user?.email || '').maybeSingle();
  if (!apt) {
    $('staff-dashboard').innerHTML = `<div class="carte"><p class="info">Aucune fiche d'identité trouvée pour ton compte — contacte le GFor.</p></div>`;
    return;
  }
  const { data: passages, error } = await sb.from('stagiaires')
    .select('*, sessions(*, formations(libelle, couleur))').eq('aptitude_id', apt.id);
  if (error) return toast(error.message, false);
  const lignes = (passages || [])
    .sort((a, b) => (b.sessions?.date_debut || '').localeCompare(a.sessions?.date_debut || ''))
    .map(p => `<div class="carte carte-session" style="border-left-color:${esc(p.sessions?.formations?.couleur || '#607d8b')}" onclick="ouvrirMonStage(${p.id}, '${p.sessions?.id}')">
        <b>${esc(p.sessions?.formations?.libelle || '?')}</b> — ${esc(p.sessions?.lieu || '')}
        <div class="info">${esc(p.sessions?.date_debut || '?')} → ${esc(p.sessions?.date_fin || '?')}
          ${p.decision_jury ? ' · Décision : ' + (p.decision_jury === 'valide' ? '✅ Validé' : '❌ Non validé') : ''}</div>
      </div>`).join('');
  $('staff-dashboard').innerHTML = `<div class="carte">
    <h2>Mon parcours de stagiaire</h2>
    <div class="info">Tous les stages où tu as été inscrit(e) comme stagiaire, quelle que soit ta fonction habituelle par ailleurs.</div>
  </div>
  ${lignes || '<div class="carte"><p class="info">Aucun stage enregistré à ton nom pour le moment.</p></div>'}`;
}

// Ouvre son propre passage de stagiaire (vue stagiaire classique) depuis « Mon parcours »,
// sans repasser par un code de session.
async function ouvrirMonStage(stagiaireId, sessionId) {
  const { data: sess, error } = await sb.from('sessions').select('*').eq('id', sessionId).single();
  if (error) return toast(error.message, false);
  S.session = sess;
  await chargerFormation(sess.formation_id);
  const { data: stag } = await sb.from('stagiaires').select('*').eq('id', stagiaireId).single();
  S.stagiaire = stag;
  $('bandeau-user').textContent = (stag.prenom + ' ' + stag.nom) + ' (mon parcours)';
  ecranAccueilStagiaire();
}

// ---------- Onglet Formateurs (inscription depuis la liste d'aptitude) ----------
// Affiche pour chaque membre de l'équipe : son grade (ISP mis en évidence — un ISP n'est pas
// forcément formateur ou for de for, certains ne sont présents que pour l'encadrement médical),
// sa qualification dans le domaine de la formation le cas échéant, et sa présence sur la semaine
// (certains formateurs/ISP se succèdent, ne sont pas là toute la durée du stage).
async function ongletFormateurs() {
  const { data: apt } = await sb.from('aptitudes').select('*, qualifications(*)');
  window._aptFormateurs = apt || [];
  const domComp = S.formation ? S.formation.domaine_competence : null;
  const dejaIds = S.data.formateurs.map(f => f.aptitude_id).filter(Boolean);
  const dejaNoms = S.data.formateurs.map(f => f.nom);
  const auj = new Date().toISOString().slice(0, 10);
  const dispo = (apt || [])
    .map(a => {
      // Une personne peut avoir plusieurs qualifications dans le même domaine (formateur/RP/for de for) :
      // on privilégie une qualification encore valide. L'ISP est une qualification à part (rôle « isp »),
      // pas liée au domaine de la formation — on la propose toujours, même hors domaine.
      const isp = (a.qualifications || []).find(q => q.role === 'isp' && q.fin_validite >= auj);
      const quals = (a.qualifications || []).filter(q => q.role !== 'isp' && (!domComp || q.domaine === domComp));
      const q = quals.find(q => q.fin_validite >= auj) || isp || quals[0];
      return { a, q };
    })
    .filter(x => x.q && !dejaIds.includes(x.a.id) && !dejaNoms.includes(x.a.prenom + ' ' + x.a.nom));

  const nbJours = (S.formation && S.formation.nb_jours) || 5;
  const gererJury = S.vision === 'rp' || S.vision === 'gfor';
  const equipe = S.data.formateurs.map(f => {
    const a = f.aptitude_id ? (apt || []).find(x => x.id === f.aptitude_id) : null;
    const qualISP = a ? (a.qualifications || []).find(q => q.role === 'isp') : null;
    const isISP = !!qualISP;
    const qualDom = a ? (a.qualifications || []).find(q => q.role !== 'isp' && (!domComp || q.domaine === domComp)) : null;
    const badgeGrade = a && a.grade ? `<span class="badge">${esc(a.grade)}</span>` : '';
    const badgeISP = isISP ? `<span class="badge" style="background:#00838f;color:#fff">🩺 ISP</span>` : '';
    const badgeRole = qualDom
      ? `<span class="badge" style="background:${couleurRole(qualDom.role)};color:#fff">${libelleRoleQualif(qualDom.role)} ${esc(qualDom.domaine)}</span>`
      : (isISP ? `<span class="badge" style="background:#999;color:#fff">Présence médicale (non formateur)</span>` : '');
    const presence = (f.jour_debut || f.jour_fin)
      ? `J${f.jour_debut || 1} → J${f.jour_fin || nbJours}`
      : 'Toute la session';
    const jurySection = gererJury ? `
      <div style="margin-top:6px">
        <label><input type="checkbox" ${f.membre_jury ? 'checked' : ''} onchange="toggleMembreJury(${f.id}, this.checked)" style="width:auto"> Membre du jury (doit signer le PV de stage)</label>
        ${f.membre_jury ? (f.signe_jury_le
          ? `<span class="entretien-statut fait" style="margin-left:8px">✅ A signé le ${esc(f.signe_jury_le.slice(0, 10))}</span>`
          : `<button class="btn petit secondaire" style="margin-left:8px" onclick="formSignatureJury(${f.id})">✍️ Signature jury</button>`) : ''}
        <div id="jury-form-${f.id}"></div>
      </div>` : '';
    return `<div class="bloc-comp">
      <b>${esc(f.nom)}</b> ${badgeGrade} ${badgeISP} ${badgeRole}
      <span class="info" style="margin-left:8px">📅 ${esc(presence)}</span>
      <button class="btn petit secondaire" style="float:right;margin-left:4px" onclick="supprFormateur(${f.id})">✕</button>
      <button class="btn petit secondaire" style="float:right" onclick="formPresenceFormateur(${f.id})">📅 Présence</button>
      <div id="presence-form-${f.id}"></div>
      ${jurySection}
    </div>`;
  }).join('');

  const isp29 = S.formation && S.formation.necessite_isp;
  const aUnISP = S.data.formateurs.some(f => {
    const a = f.aptitude_id ? (apt || []).find(x => x.id === f.aptitude_id) : null;
    return a && (a.qualifications || []).some(q => q.role === 'isp');
  });

  $('session-contenu').innerHTML = `
    <div class="carte">
      <h2>Équipe pédagogique (${S.data.formateurs.length})</h2>
      <div class="info">🩺 ISP = infirmier sapeur-pompier — qualification à part entière (comme formateur/RP/for de for), certains sont aussi qualifiés formateur/for de for (badge coloré), d'autres n'interviennent que pour l'encadrement médical (« Présence médicale »). 📅 Présence = jours où la personne est effectivement là (utile quand plusieurs formateurs se succèdent sur la semaine) — c'est aussi cette présence qui détermine le jour ISP mis en évidence dans le chronogramme.</div>
      ${isp29 ? `<div class="info" style="${aUnISP ? '' : 'color:#c8102e;font-weight:bold'}">${aUnISP ? '✅ Un ISP est inscrit dans l\'équipe pédagogique.' : '⚠️ Cette formation nécessite l\'intervention d\'un ISP — aucun ISP inscrit pour l\'instant.'}</div>` : ''}
      ${equipe}
      <h3>Inscrire un formateur (liste d'aptitude${domComp ? ' — domaine ' + esc(domComp) : ''})</h3>
      ${dispo.length ? `
        <select id="fo-apt">${dispo.map(x =>
          `<option value="${x.a.id}" data-fin="${x.q.fin_validite}" data-nom="${esc(x.a.prenom + ' ' + x.a.nom)}">
            ${esc(x.a.grade || '')} ${esc(x.a.prenom)} ${esc(x.a.nom)} (${esc(x.a.cis || '')}) — ${libelleRoleQualif(x.q.role)}${x.q.domaine ? ' ' + esc(x.q.domaine) : ''}, valide jusqu'au ${x.q.fin_validite}</option>`).join('')}</select>
        <div class="ligne">
          <div><label>Présent du jour … (facultatif, par défaut toute la session)</label><input id="fo-jd" type="number" min="1" max="${nbJours}"></div>
          <div><label>… au jour …</label><input id="fo-jf" type="number" min="1" max="${nbJours}"></div>
        </div>
        <button class="btn" onclick="ajouterFormateur()">Inscrire</button>`
      : `<p class="info">Personne de qualifié${domComp ? ' en ' + esc(domComp) : ''} et disponible dans la liste d'aptitude (menu « Formateurs », vision GFor).</p>`}
      ${gererJury ? `
      <h3>Ajouter un membre du jury (hors liste d'aptitude)</h3>
      <div class="info">Pour un membre du jury qui n'est pas formateur/RP dans l'appli (intervenant extérieur, médecin SSSM...). Ajouté directement comme membre du jury, sans qualification ni identité liée.</div>
      <div class="ligne">
        <div><label>Nom</label><input id="jury-ext-nom" placeholder="Nom Prénom"></div>
        <div style="align-self:flex-end"><button class="btn petit" onclick="ajouterMembreJuryExterne()">➕ Ajouter au jury</button></div>
      </div>` : ''}
    </div>`;
}

async function ajouterMembreJuryExterne() {
  const nom = $('jury-ext-nom').value.trim();
  if (!nom) return toast('Nom requis', false);
  const { error } = await sb.from('session_formateurs').insert({
    session_id: S.session.id, nom, aptitude_id: null, membre_jury: true,
  });
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id); ongletFormateurs(); toast('Membre du jury ajouté');
}

async function ajouterFormateur() {
  const opt = $('fo-apt').selectedOptions[0];
  if (!opt) return;
  if (S.session.date_fin && opt.dataset.fin < S.session.date_fin)
    return toast('Impossible : la qualification de ' + opt.dataset.nom + ' expire le ' + opt.dataset.fin + ', avant la fin de la session (' + S.session.date_fin + ').', false);
  const jd = Number($('fo-jd').value) || null;
  const jf = Number($('fo-jf').value) || null;
  const { error } = await sb.from('session_formateurs').insert({
    session_id: S.session.id, nom: opt.dataset.nom, aptitude_id: Number(opt.value),
    jour_debut: jd, jour_fin: jf,
  });
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id); ongletFormateurs(); toast('Formateur inscrit');
}

async function supprFormateur(id) {
  const { error } = await sb.from('session_formateurs').delete().eq('id', id);
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id); ongletFormateurs();
}

// Petit formulaire inline pour ajuster la présence d'un formateur déjà inscrit — pratique quand
// deux formateurs se succèdent sur la semaine (ex. l'un J1-J3, l'autre J4-J5).
function formPresenceFormateur(id) {
  const f = S.data.formateurs.find(x => x.id === id);
  if (!f) return;
  const nbJours = (S.formation && S.formation.nb_jours) || 5;
  $('presence-form-' + id).innerHTML = `
    <div class="ligne" style="margin-top:6px">
      <div><label>Présent du jour …</label><input id="pf-jd-${id}" type="number" min="1" max="${nbJours}" value="${f.jour_debut || ''}"></div>
      <div><label>… au jour … (laisser vide = toute la session)</label><input id="pf-jf-${id}" type="number" min="1" max="${nbJours}" value="${f.jour_fin || ''}"></div>
      <div style="align-self:flex-end"><button class="btn petit" onclick="enregistrerPresenceFormateur(${id})">Enregistrer</button></div>
    </div>`;
}

async function enregistrerPresenceFormateur(id) {
  const jd = Number($('pf-jd-' + id).value) || null;
  const jf = Number($('pf-jf-' + id).value) || null;
  const { error } = await sb.from('session_formateurs').update({ jour_debut: jd, jour_fin: jf }).eq('id', id);
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id); ongletFormateurs(); toast('Présence mise à jour');
}

// Jury de stage : parmi l'équipe pédagogique, ceux qui siègent au jury signent le PV de stage
// (livrable 9) une fois tous les entretiens individuels signés (voir genererPVStage, pdf.js).
async function toggleMembreJury(id, checked) {
  const payload = { membre_jury: checked };
  if (!checked) { payload.signature_jury = null; payload.signe_jury_le = null; }
  const { error } = await sb.from('session_formateurs').update(payload).eq('id', id);
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id); ongletFormateurs();
}

function formSignatureJury(id) {
  const f = S.data.formateurs.find(x => x.id === id);
  if (!f) return;
  $('jury-form-' + id).innerHTML = `
    <div style="margin-top:6px">
      <label>Signature de ${esc(f.nom)} (jury)</label>
      ${_zoneSignature('jury-sig-' + id, f.signature_jury, false)}
      <button class="btn petit" onclick="enregistrerSignatureJury(${id})">Enregistrer la signature</button>
    </div>`;
  _initSignatures(['jury-sig-' + id]);
}

async function enregistrerSignatureJury(id) {
  const sig = _lireSignature('jury-sig-' + id);
  if (!sig) return toast('Signature vide', false);
  const { error } = await sb.from('session_formateurs').update({ signature_jury: sig, signe_jury_le: new Date().toISOString() }).eq('id', id);
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id);
  toast('Signature du jury enregistrée');
  ongletFormateurs();
}

// ---------- Onglet Feuille de garde ----------
// Un passage est considéré « déjà évalué » dès qu'au moins une évaluation formateur existe pour
// lui — au-delà de ce point, le supprimer effacerait un travail de notation déjà fait, donc pas
// de bouton supprimer sur ces passages (voir onglet « MSP déjà évaluées »).
function _passageAUneEvaluation(p) {
  return S.data.evaluations.some(ev => ev.passage_id === p.id);
}

let _gardeVueActuelle = 'planifiees';

function ongletGarde() {
  $('session-contenu').innerHTML = `
    <div class="carte">
      <h2>Feuille de garde — passages</h2>
      <div class="onglets">
        <button id="garde-tab-planifiees" class="actif" onclick="_gardeChangerVue('planifiees')">🗓️ MSP planifiées</button>
        <button id="garde-tab-evaluees" onclick="_gardeChangerVue('evaluees')">✅ MSP déjà évaluées</button>
      </div>
      <div id="garde-zone"></div>
    </div>`;
  _gardeVueActuelle = 'planifiees';
  _rendreGarde();
}

function _gardeChangerVue(mode) {
  _gardeVueActuelle = mode;
  $('garde-tab-planifiees').classList.toggle('actif', mode === 'planifiees');
  $('garde-tab-evaluees').classList.toggle('actif', mode === 'evaluees');
  _rendreGarde();
}

function _rendreGarde() {
  const utiliseTypes = S.formation.utilise_types_msp;
  const nomStag = id => { const s = S.data.stagiaires.find(x => x.id === id); return s ? s.prenom + ' ' + s.nom : '?'; };
  const libelleType = t => t === 'complexe' ? '🔴 Complexe' : t === 'mineure' ? '🟢 Mineure' : '';
  const evaluees = _gardeVueActuelle === 'evaluees';
  const passagesVue = S.data.passages.filter(p => _passageAUneEvaluation(p) === evaluees);
  const lignes = passagesVue.map(p => {
    const eq = S.data.equipiers.filter(e => e.passage_id === p.id);
    const theme = S.formation.themes.find(t => t.id === p.theme_id);
    return `<tr>
      <td>${p.numero}</td><td>${esc(p.jour)}</td><td>${esc(theme ? theme.libelle : '')}</td>
      ${utiliseTypes ? `<td>${esc(libelleType(p.type_msp))}</td>` : ''}
      <td>${esc(p.sujet || '')}</td><td>${p.evaluateur ? esc(p.evaluateur) : '<span class="statut-eca">À affecter</span>'}</td>
      <td>${eq.map(e => esc(nomStag(e.stagiaire_id)) + (e.evalue ? '' : ' <small>(non évalué)</small>')).join('<br>')}</td>
      <td>${evaluees
        ? '<span class="info" title="Déjà évalué : suppression désactivée pour ne pas perdre les notes saisies.">🔒</span>'
        : `<button class="btn petit secondaire" onclick="supprPassage(${p.id})">✕</button>`}</td></tr>`;
  }).join('');

  $('garde-zone').innerHTML = `
      <div class="table-scroll"><table>
        <tr><th>N°</th><th>Jour</th><th>Thème</th>${utiliseTypes ? '<th>Type MSP</th>' : ''}<th>Sujet</th><th>Évaluateur</th><th>Équipiers</th><th></th></tr>
        ${lignes || `<tr><td colspan="${utiliseTypes ? 8 : 7}" class="info">${evaluees ? 'Aucune MSP évaluée pour le moment.' : 'Aucune MSP planifiée pour le moment.'}</td></tr>`}
      </table></div>
      ${evaluees ? '' : `
      <h3>Programmer un passage</h3>
      <div class="ligne">
        <div><label>Jour</label><select id="pa-jour">${joursFormation().map(j => `<option>${j}</option>`).join('')}</select></div>
        <div><label>Thème</label><select id="pa-theme">${S.formation.themes.map(t => `<option value="${t.id}">${esc(t.libelle)}</option>`).join('')}</select></div>
      </div>
      ${utiliseTypes ? `<div class="ligne">
        <div><label>Type de MSP</label><select id="pa-type-msp">
          <option value="">— non défini —</option>
          <option value="mineure">Mineure</option>
          <option value="complexe">Complexe</option>
        </select></div>
      </div>` : ''}
      <div class="ligne">
        <div><label>Sujet / cas concret</label>
          <input id="pa-sujet" list="liste-cas" placeholder="libre ou choisir">
          <datalist id="liste-cas">${S.formation.cas.map(c => `<option value="${esc(c.libelle)}">`).join('')}</datalist></div>
        <div><label>Évaluateur</label>
          <select id="pa-eval">
            <option value="">— À affecter (un formateur se positionnera) —</option>
            ${[...new Set([S.session.responsable, ...S.data.formateurs.map(f => f.nom)].filter(Boolean))]
              .map(n => `<option>${esc(n)}</option>`).join('')}
          </select></div>
      </div>
      <label>Équipiers du passage (cocher « évalué » pour ceux qui comptent pour la certification)</label>
      ${S.data.stagiaires.map(s => `
        <div class="bloc-comp">
          <input type="checkbox" id="pa-eq-${s.id}" style="width:auto"> ${esc(s.prenom)} ${esc(s.nom)}
          &nbsp;·&nbsp; <input type="checkbox" id="pa-ev-${s.id}" checked style="width:auto"> <small>évalué</small>
        </div>`).join('')}
      <button class="btn" onclick="ajouterPassage()">Programmer</button>
      `}`;
}

async function ajouterPassage() {
  const equipiers = S.data.stagiaires.filter(s => $('pa-eq-' + s.id).checked);
  if (!equipiers.length) return toast('Sélectionner au moins un équipier', false);
  // Numéro unique : max en base + contrainte unique (session_id, numero), réessai si collision
  const { data: dernier } = await sb.from('passages').select('numero')
    .eq('session_id', S.session.id).order('numero', { ascending: false }).limit(1);
  let numero = ((dernier && dernier[0]) ? dernier[0].numero : 0) + 1;
  let passage = null, error = null;
  for (let essai = 0; essai < 3; essai++) {
    ({ data: passage, error } = await sb.from('passages').insert({
      session_id: S.session.id, numero,
      jour: $('pa-jour').value, theme_id: Number($('pa-theme').value),
      type_msp: (S.formation.utilise_types_msp && $('pa-type-msp')) ? ($('pa-type-msp').value || null) : null,
      sujet: $('pa-sujet').value.trim() || null, evaluateur: $('pa-eval').value || null,
    }).select().single());
    if (!error) break;
    if (error.code === '23505') { numero++; continue; } // doublon : on prend le suivant
    break;
  }
  if (error) return toast(error.message, false);
  const { error: e2 } = await sb.from('passage_equipiers').insert(
    equipiers.map(s => ({ passage_id: passage.id, stagiaire_id: s.id, evalue: $('pa-ev-' + s.id).checked })));
  if (e2) return toast(e2.message, false);
  await chargerDonneesSession(S.session.id); ongletGarde(); toast('Passage n°' + numero + ' programmé');
}

async function supprPassage(id) {
  if (!confirm('Supprimer ce passage et ses évaluations ?')) return;
  const { error } = await sb.from('passages').delete().eq('id', id);
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id); ongletGarde();
}

// ---------- Onglet Évaluations (saisie formateur) ----------
// Vue « tableau de bord du formateur » : ses propres passages + ceux à affecter en priorité,
// les MSP non entièrement évaluées remontent en haut de la liste.
function ongletEvaluations() {
  const nomStag = id => { const s = S.data.stagiaires.find(x => x.id === id); return s ? s.prenom + ' ' + s.nom : '?'; };
  const toutEvalue = p => {
    const eq = S.data.equipiers.filter(e => e.passage_id === p.id && e.evalue);
    return eq.length > 0 && eq.every(e => S.data.evaluations.some(ev => ev.passage_id === p.id && ev.stagiaire_id === e.stagiaire_id));
  };

  let passages = S.data.passages.filter(p => S.data.equipiers.some(e => e.passage_id === p.id && e.evalue));

  // Vision formateur : n'afficher que ses propres passages + ceux encore à affecter,
  // pour ne pas polluer sa lecture avec les passages des collègues.
  if (S.vision === 'formateur' && S.user) {
    passages = passages.filter(p => !p.evaluateur || p.evaluateur === S.user.nom);
  }

  // Priorité aux MSP non entièrement évaluées, puis par numéro
  passages = passages.slice().sort((a, b) => {
    const da = toutEvalue(a) ? 1 : 0, db = toutEvalue(b) ? 1 : 0;
    return da !== db ? da - db : a.numero - b.numero;
  });

  const blocs = passages.map(p => {
    const theme = S.formation.themes.find(t => t.id === p.theme_id);
    const eq = S.data.equipiers.filter(e => e.passage_id === p.id && e.evalue);
    const complet = toutEvalue(p);
    return `<div class="carte" style="${complet ? 'opacity:.7' : ''}">
      <h3>Passage n°${p.numero} · ${esc(p.jour)} · ${esc(theme ? theme.libelle : '')} ${p.sujet ? '· ' + esc(p.sujet) : ''}
        ${complet ? '<span class="niv niv-A">complet ✓</span>' : '<span class="niv niv-NE">à évaluer</span>'}</h3>
      <div class="info">Évaluateur : ${p.evaluateur
        ? esc(p.evaluateur) + (S.user && p.evaluateur === S.user.nom ? ' (vous)' : '')
        : `<span class="statut-eca">à affecter</span> <button class="btn petit" onclick="prendrePassage(${p.id})">🙋 Je prends ce passage</button>`}</div>
      <div class="info">${eq.map(e => {
        const fait = S.data.evaluations.some(ev => ev.passage_id === p.id && ev.stagiaire_id === e.stagiaire_id);
        return esc(nomStag(e.stagiaire_id)) + (fait ? ' ✓' : ' ○');
      }).join(' · ')}</div>
      <button class="btn" onclick="formEvaluationPassage(${p.id})">Évaluer l'équipe (${eq.length})</button>
    </div>`;
  }).join('');
  $('session-contenu').innerHTML = `
    <div class="carte">
      <button class="btn" onclick="formNouvelleMSP()">➕ Nouvelle MSP à évaluer</button>
    </div>
    ${blocs || '<div class="carte"><p class="info">Aucun passage programmé pour le moment.</p></div>'}`;
}

// Création rapide d'une MSP directement depuis l'onglet Évaluations : numéro de passage
// attribué automatiquement, évaluateur = soi-même, puis bascule directement sur la saisie.
function formNouvelleMSP() {
  $('session-contenu').innerHTML = `
    <div class="carte">
      <span class="lien-retour" onclick="ongletEvaluations()">← Retour</span>
      <h2>Nouvelle MSP à évaluer</h2>
      <div class="info">Le numéro de passage est attribué automatiquement.${S.user ? ' Évaluateur : ' + esc(S.user.nom) + '.' : ''}</div>
      <div class="ligne">
        <div><label>Jour</label><select id="pa2-jour">${joursFormation().map(j => `<option>${j}</option>`).join('')}</select></div>
        <div><label>Thème</label><select id="pa2-theme">${S.formation.themes.map(t => `<option value="${t.id}">${esc(t.libelle)}</option>`).join('')}</select></div>
      </div>
      ${S.formation.utilise_types_msp ? `<div class="ligne">
        <div><label>Type de MSP</label><select id="pa2-type-msp">
          <option value="">— non défini —</option>
          <option value="mineure">Mineure</option>
          <option value="complexe">Complexe</option>
        </select></div>
      </div>` : ''}
      <label>Sujet / cas concret</label>
      <input id="pa2-sujet" list="liste-cas2" placeholder="libre ou choisir">
      <datalist id="liste-cas2">${S.formation.cas.map(c => `<option value="${esc(c.libelle)}">`).join('')}</datalist>
      <label>Équipiers du passage</label>
      ${S.data.stagiaires.map(s => `
        <div class="bloc-comp">
          <input type="checkbox" id="pa2-eq-${s.id}" style="width:auto"> ${esc(s.prenom)} ${esc(s.nom)}
        </div>`).join('')}
      <button class="btn" onclick="creerMSPRapide()">Créer et évaluer</button>
    </div>`;
}

async function creerMSPRapide() {
  const equipiers = S.data.stagiaires.filter(s => $('pa2-eq-' + s.id).checked);
  if (!equipiers.length) return toast('Sélectionner au moins un équipier', false);
  // Numéro unique : max en base + contrainte unique (session_id, numero), réessai si collision
  const { data: dernier } = await sb.from('passages').select('numero')
    .eq('session_id', S.session.id).order('numero', { ascending: false }).limit(1);
  let numero = ((dernier && dernier[0]) ? dernier[0].numero : 0) + 1;
  let passage = null, error = null;
  for (let essai = 0; essai < 3; essai++) {
    ({ data: passage, error } = await sb.from('passages').insert({
      session_id: S.session.id, numero,
      jour: $('pa2-jour').value, theme_id: Number($('pa2-theme').value),
      type_msp: (S.formation.utilise_types_msp && $('pa2-type-msp')) ? ($('pa2-type-msp').value || null) : null,
      sujet: $('pa2-sujet').value.trim() || null,
      evaluateur: S.user ? S.user.nom : null,
    }).select().single());
    if (!error) break;
    if (error.code === '23505') { numero++; continue; }
    break;
  }
  if (error) return toast(error.message, false);
  const { error: e2 } = await sb.from('passage_equipiers').insert(
    equipiers.map(s => ({ passage_id: passage.id, stagiaire_id: s.id, evalue: true })));
  if (e2) return toast(e2.message, false);
  await chargerDonneesSession(S.session.id);
  toast('Passage n°' + numero + ' créé');
  formEvaluationPassage(passage.id);
}

async function prendrePassage(passageId) {
  const { data, error } = await sb.from('passages').update({ evaluateur: S.user.nom })
    .eq('id', passageId).is('evaluateur', null).select();
  if (error) return toast(error.message, false);
  if (!data.length) toast('Trop tard, un autre formateur s\'est positionné', false);
  else toast('Passage affecté à ' + S.user.nom);
  await chargerDonneesSession(S.session.id);
  ongletEvaluations();
}

// ---------- Évaluation de toute l'équipe d'un passage sur une seule page (pensé mobile) ----------
// Une colonne par équipier (avatar + nom), une ligne par compétence avec un menu déroulant,
// puis APP à proposer / commentaire par équipier en bas de page.
let _evalPassageCourante = null; // {passageId, parStagiaire: {stagId: {notes:{}, app1, app2, app3, commentaire}}}

function initiales(s) {
  return (((s.prenom || '?')[0] || '?') + ((s.nom || '?')[0] || '?')).toUpperCase();
}

function formEvaluationPassage(passageId) {
  const p = S.data.passages.find(x => x.id === passageId);
  const eq = S.data.equipiers.filter(e => e.passage_id === passageId && e.evalue);
  const stags = eq.map(e => S.data.stagiaires.find(s => s.id === e.stagiaire_id)).filter(Boolean);
  if (!stags.length) return toast('Aucun équipier sur ce passage', false);

  _evalPassageCourante = { passageId, parStagiaire: {} };
  let ressentiExistant = null;
  for (const s of stags) {
    const existante = S.data.evaluations.find(ev => ev.passage_id === passageId && ev.stagiaire_id === s.id);
    _evalPassageCourante.parStagiaire[s.id] = {
      notes: existante ? { ...existante.notes } : {},
      app1: existante?.app1 || '', app2: existante?.app2 || '', app3: existante?.app3 || '',
      commentaire: existante?.commentaire || '',
      ressenti_mot: existante?.ressenti_mot || '',
    };
    if (existante && existante.ressenti_formateur != null) ressentiExistant = existante.ressenti_formateur;
  }

  const theme = S.formation.themes.find(t => t.id === p.theme_id);
  const colonneStag = s => `<div class="colonne-stag">
      ${s.photo_url
        ? `<img src="${esc(s.photo_url)}" alt="" class="avatar-stag" style="object-fit:cover">`
        : `<div class="avatar-stag">${esc(initiales(s))}</div>`}
      <div class="nom-stag">${esc(s.prenom)}<br>${esc(s.nom)}</div>
    </div>`;

  $('session-contenu').innerHTML = `
    <div class="carte">
      <span class="lien-retour" onclick="ongletEvaluations()">← Retour aux passages</span>
      <h2>Passage n°${p.numero} · ${esc(p.jour)} · ${esc(theme ? theme.libelle : '')}</h2>
      <div class="info">A+ acquis avec analyse / A acquis / ECA en cours / NA non acquis / NE non évalué. Note : pas encore de photo stagiaire dans l'appli — initiales en attendant.</div>
      <div class="grille-eval-equipe">${stags.map(colonneStag).join('')}</div>
      ${S.formation.competences.map(c => `
        <div class="section-titre" style="margin-top:16px">${esc(c.code)} — ${esc(c.libelle)}</div>
        <div class="grille-eval-equipe">
          ${stags.map(s => `<div class="colonne-stag">
            <select onchange="_evalPassageCourante.parStagiaire[${s.id}].notes[${c.id}] = this.value || undefined">
              <option value="">—</option>
              ${NIVEAUX.map(n => `<option value="${n}" ${_evalPassageCourante.parStagiaire[s.id].notes[c.id] === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>`).join('')}
        </div>`).join('')}
      <div class="section-titre" style="margin-top:16px">APP à proposer / Commentaire / Mot (ressenti)</div>
      <div class="grille-eval-equipe">
        ${stags.map(s => `<div class="colonne-stag">
          <textarea placeholder="APP 1" oninput="_evalPassageCourante.parStagiaire[${s.id}].app1 = this.value">${esc(_evalPassageCourante.parStagiaire[s.id].app1)}</textarea>
          <textarea placeholder="APP 2" oninput="_evalPassageCourante.parStagiaire[${s.id}].app2 = this.value">${esc(_evalPassageCourante.parStagiaire[s.id].app2)}</textarea>
          <textarea placeholder="APP 3" oninput="_evalPassageCourante.parStagiaire[${s.id}].app3 = this.value">${esc(_evalPassageCourante.parStagiaire[s.id].app3)}</textarea>
          <textarea placeholder="Commentaire" oninput="_evalPassageCourante.parStagiaire[${s.id}].commentaire = this.value">${esc(_evalPassageCourante.parStagiaire[s.id].commentaire)}</textarea>
          <input type="text" placeholder="Mot (ex. Efficace, Hésitant…)" maxlength="40"
            title="Ressenti du formateur pour CE stagiaire, en un mot — distinct du ressenti chiffré ci-dessous qui vaut pour toute l'équipe"
            value="${esc(_evalPassageCourante.parStagiaire[s.id].ressenti_mot)}"
            oninput="_evalPassageCourante.parStagiaire[${s.id}].ressenti_mot = this.value">
        </div>`).join('')}
      </div>
      <label>Ressenti formateur (0 à 5, pour toute l'équipe de ce passage)</label>
      <select id="ev-ressenti-equipe">${[0, 1, 2, 3, 4, 5].map(n => `<option ${ressentiExistant === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <button class="btn" onclick="enregistrerEvaluationPassage()">Enregistrer l'évaluation de l'équipe</button>
    </div>`;
}

async function enregistrerEvaluationPassage() {
  const ressenti = Number($('ev-ressenti-equipe').value);
  const lignes = Object.entries(_evalPassageCourante.parStagiaire).map(([stagiaireId, d]) => ({
    passage_id: _evalPassageCourante.passageId, stagiaire_id: Number(stagiaireId),
    formateur: S.user ? S.user.nom : null, notes: d.notes, ressenti_formateur: ressenti,
    app1: (d.app1 || '').trim() || null, app2: (d.app2 || '').trim() || null, app3: (d.app3 || '').trim() || null,
    commentaire: (d.commentaire || '').trim() || null,
    ressenti_mot: (d.ressenti_mot || '').trim() || null,
  }));
  const { error } = await sb.from('evaluations').upsert(lignes, { onConflict: 'passage_id,stagiaire_id' });
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id);
  toast('Évaluation enregistrée pour toute l\'équipe'); ongletEvaluations();
}

// ---------- Onglet Suivi MSP (livrable 4 : suivi compétence groupe) ----------
// Page 1 (groupe) : consultable par tout l'encadrement (jamais par les stagiaires, cet onglet
// n'existe pas côté vision stagiaire). Page 2 (mots du formateur) : dupliquée côté stagiaire
// (voir ecranAccueilStagiaire) mais filtrée sur ses seuls passages.
// Cellule avec « jauge » façon barre de données Excel (fond en dégradé proportionnel à la valeur)
function celluleBarre(n, max, couleur) {
  if (!n) return `<td>0</td>`;
  const pct = max ? Math.round(n / max * 100) : 0;
  return `<td style="background:linear-gradient(to right, ${couleur} ${pct}%, transparent ${pct}%)">${n}</td>`;
}

let _mspVue = 'competences';

const MSP_SOUS_ONGLETS = [
  ['competences', 'Suivi des compétences'],
  ['mots', 'Mots du formateur'],
  ['formateur', 'Passages / formateur'],
  ['theme', 'Passages / thème'],
  ['cas', 'Passages / cas concret'],
];

function ongletSuiviMSP(vue) {
  if (vue) _mspVue = vue;
  // Chef de centre : uniquement le suivi des compétences (déjà filtré sur son CIS) — les vues
  // par formateur/thème/cas concret concernent toute la promotion et n'ont pas lieu d'être ici.
  if (S.vision === 'chef_centre') {
    $('session-contenu').innerHTML = _mspVueCompetences();
    return;
  }
  const nav = `<div class="onglets" style="margin-bottom:10px">${MSP_SOUS_ONGLETS.map(([id, lbl]) =>
    `<button class="${_mspVue === id ? 'actif' : ''}" onclick="ongletSuiviMSP('${id}')">${lbl}</button>`).join('')}</div>`;
  const rendus = {
    competences: _mspVueCompetences, mots: _mspVueMots,
    formateur: _mspVueFormateur, theme: _mspVueTheme, cas: _mspVueCas,
  };
  $('session-contenu').innerHTML = nav + rendus[_mspVue]();
}

// ---- Suivi des compétences : une colonne par MSP (numéro seul, pour rester lisible) ----
function _mspVueCompetences() {
  // Chef de centre : ne voit que les stagiaires de son propre CIS, pas toute la promotion.
  const stagiaires = S.vision === 'chef_centre' && S.user
    ? S.data.stagiaires.filter(s => s.cis === S.user.cis)
    : S.data.stagiaires;
  const blocs = stagiaires.map(s => {
    const mesPassages = S.data.equipiers.filter(e => e.stagiaire_id === s.id)
      .map(e => S.data.passages.find(p => p.id === e.passage_id)).filter(Boolean).sort((a, b) => a.numero - b.numero);
    if (!mesPassages.length) return '';
    const { bilan } = bilanStagiaire(s.id);
    const lignesComp = S.formation.competences.map(c => {
      const cellules = mesPassages.map(p => {
        const ev = S.data.evaluations.find(x => x.passage_id === p.id && x.stagiaire_id === s.id);
        const n = ev ? ev.notes[c.id] : null;
        return `<td>${n && n !== 'NE' ? `<span class="niv niv-${NIV_CLASSE[n]}">${n}</span>` : '—'}</td>`;
      }).join('');
      const b = bilan[c.id];
      const cls = classeStatutCompetence(b.statut);
      return `<tr><td><span class="code">${esc(c.code)}</span></td>${cellules}<td class="${cls}"><b>${b.statut}</b></td></tr>`;
    }).join('');
    const dec = s.decision_jury === 'valide' ? '<span class="statut-valide">✅ Validé</span>'
      : (s.decision_jury === 'non_valide' ? '<span class="statut-na">❌ Non validé</span>' : '<span class="info">— à décider —</span>');
    return `<h3>${esc(s.prenom)} ${esc(s.nom)}</h3>
      <div class="table-scroll"><table class="table-compacte table-msp-comp">
        <tr><th>Comp.</th>${mesPassages.map(p => `<th>${p.numero}</th>`).join('')}<th>Validation</th></tr>
        ${lignesComp}
      </table></div>
      <p class="info">Décision jury : ${dec}</p>`;
  }).join('');
  return `<div class="carte">
      <div class="info">Chaque colonne = le numéro de la MSP. Validation calculée selon la règle RIOFE (grisée = acquise 2 fois, blanche = a minima ECA).${
        S.vision === 'chef_centre' ? ' Vue restreinte aux stagiaires de ton CIS.' : ''}</div>
      ${blocs || `<p class="info">${S.vision === 'chef_centre' ? 'Aucun stagiaire de ton CIS sur cette session.' : 'Aucun passage enregistré.'}</p>`}
    </div>`;
}

function _mspVueMots() {
  const blocs = S.data.stagiaires.map(s => {
    const mesPassages = S.data.equipiers.filter(e => e.stagiaire_id === s.id)
      .map(e => S.data.passages.find(p => p.id === e.passage_id)).filter(Boolean).sort((a, b) => a.numero - b.numero);
    const lignes = mesPassages.map(p => {
      const ev = S.data.evaluations.find(x => x.passage_id === p.id && x.stagiaire_id === s.id);
      return `<tr><td>MSP n°${p.numero}</td><td>${ev && ev.commentaire ? esc(ev.commentaire) : '—'}</td></tr>`;
    }).join('');
    if (!lignes) return '';
    return `<h3>${esc(s.prenom)} ${esc(s.nom)}</h3><table><tr><th>Passage</th><th>Mot du formateur</th></tr>${lignes}</table>`;
  }).join('');
  return `<div class="carte">
      <div class="info">Chaque stagiaire peut aussi consulter cette page, mais uniquement pour ses propres passages, depuis son espace personnel.</div>
      ${blocs || '<p class="info">Aucun commentaire enregistré.</p>'}
    </div>`;
}

function _mspVueFormateur() {
  const stagiaires = S.data.stagiaires;
  const nomsFormateurs = [...new Set(S.data.evaluations.map(e => e.formateur).filter(Boolean))];
  let max = 1;
  const comptes = stagiaires.map(s => nomsFormateurs.map(f =>
    S.data.evaluations.filter(e => e.stagiaire_id === s.id && e.formateur === f).length));
  comptes.forEach(l => l.forEach(n => { if (n > max) max = n; }));
  const table = nomsFormateurs.length ? `
    <div class="table-scroll"><table class="table-compacte">
      <tr><th>Stagiaire</th>${nomsFormateurs.map(f => `<th>${esc(f)}</th>`).join('')}</tr>
      ${stagiaires.map((s, i) => `<tr><td>${esc(s.prenom)} ${esc(s.nom)}</td>${nomsFormateurs.map((f, j) => celluleBarre(comptes[i][j], max, '#f06292')).join('')}</tr>`).join('')}
    </table></div>` : '<p class="info">Aucune évaluation enregistrée.</p>';
  return `<div class="carte"><div class="info">Nombre de passages évalués, par formateur et par stagiaire.</div>${table}</div>`;
}

function _mspVueTheme() {
  const stagiaires = S.data.stagiaires;
  const themes = S.formation.themes;
  let max = 1;
  const comptes = stagiaires.map(s => themes.map(t =>
    S.data.evaluations.filter(e => {
      const p = S.data.passages.find(x => x.id === e.passage_id);
      return e.stagiaire_id === s.id && p && p.theme_id === t.id;
    }).length));
  comptes.forEach(l => l.forEach(n => { if (n > max) max = n; }));
  const table = themes.length ? `
    <div class="table-scroll"><table class="table-compacte">
      <tr><th>Stagiaire</th>${themes.map(t => `<th>${esc(t.libelle)}</th>`).join('')}</tr>
      ${stagiaires.map((s, i) => `<tr><td>${esc(s.prenom)} ${esc(s.nom)}</td>${themes.map((t, j) => celluleBarre(comptes[i][j], max, '#81c784')).join('')}</tr>`).join('')}
    </table></div>` : '<p class="info">Aucun thème défini pour cette formation.</p>';
  return `<div class="carte"><div class="info">Nombre de passages évalués, par thématique et par stagiaire.</div>${table}</div>`;
}

function _mspVueCas() {
  const stagiaires = S.data.stagiaires;
  const cas = S.formation.cas || [];
  const norm = t => String(t || '').trim().toLowerCase();
  const table = cas.length ? `
    <div class="table-scroll"><table class="table-compacte">
      <tr><th>Stagiaire</th>${cas.map(c => `<th>${esc(c.libelle)}</th>`).join('')}</tr>
      ${stagiaires.map(s => `<tr><td>${esc(s.prenom)} ${esc(s.nom)}</td>${cas.map(c => {
        const n = S.data.evaluations.filter(e => {
          const p = S.data.passages.find(x => x.id === e.passage_id);
          return e.stagiaire_id === s.id && p && norm(p.sujet) === norm(c.libelle);
        }).length;
        return `<td>${n}</td>`;
      }).join('')}</tr>`).join('')}
    </table></div>` : '<p class="info">Aucun cas concret défini pour cette formation.</p>';
  return `<div class="carte">
      <div class="info">Qui est déjà passé sur quel cas concret / MSP imposée — surtout utile pour CA1E1E PPBE et Équipier SUAP, mais disponible dès qu'une formation a des cas concrets définis.</div>
      ${table}
    </div>`;
}

// ---------- Onglet Validation (règles RIOFE) ----------
function classeStatutCompetence(statut) {
  if (statut === 'Validé' || statut === 'Validé (jury)') return 'statut-valide';
  if (statut === 'En cours') return 'statut-eca';
  if (statut === 'Avis du jury') return 'statut-jury';
  if (statut === 'Non validé (jury)') return 'statut-na';
  if (statut === '—') return '';
  return 'statut-na';
}

// Décision du jury pour UNE compétence précise d'UN stagiaire (distincte de s.decision_jury,
// qui est la décision finale globale du stage) — lue dans le jsonb {"<competence_id>": "valide"|"non_valide"}.
function _decisionJuryComp(s, competenceId) {
  const d = (s && s.decisions_jury_competences) || {};
  return d[competenceId] || '';
}

// Statut final affiché pour une compétence : identique au statut RIOFE brut, sauf quand ce
// statut brut est « Avis du jury » — dans ce cas, si le jury a déjà tranché pour CETTE
// compétence précisément (indépendamment des autres compétences en avis du jury du même
// stagiaire), on affiche le résultat de sa décision plutôt que « en attente ».
function _statutFinalCompetence(statutBrut, s, competenceId) {
  if (statutBrut !== 'Avis du jury') return statutBrut;
  const dec = _decisionJuryComp(s, competenceId);
  if (dec === 'valide') return 'Validé (jury)';
  if (dec === 'non_valide') return 'Non validé (jury)';
  return statutBrut;
}

function bilanStagiaire(stagiaireId) {
  const evalsToutes = S.data.evaluations.filter(e => e.stagiaire_id === stagiaireId);
  let evals = evalsToutes;

  // Paramètres du stage (onglet « Paramètres », réservé RP/GFor) : si un nombre de MSP de
  // certification est fixé, seules les N dernières MSP évaluées de ce stagiaire comptent.
  const nbMax = S.session && S.session.nb_msp_certification;
  if (nbMax) {
    const mesPassages = S.data.equipiers.filter(e => e.stagiaire_id === stagiaireId && e.evalue)
      .map(e => S.data.passages.find(p => p.id === e.passage_id)).filter(Boolean)
      .sort((a, b) => a.numero - b.numero);
    const retenus = new Set(mesPassages.slice(-nbMax).map(p => p.id));
    evals = evals.filter(e => retenus.has(e.passage_id));
  }

  const seuilNA = (S.session && S.session.seuil_na_jury) || 2;
  const seuilECA = (S.session && S.session.seuil_eca_jury) || 4;

  // Mode de validation spécifique à certaines formations (ex : CA1E1E — Sergent) : remplace la
  // logique standard « acquis 2 fois » par une condition unique — au moins une MSP taguée
  // « complexe » doit être notée intégralement en A/A+ (aucune ECA/NA/NE), toutes compétences
  // confondues — indépendamment du plafond « nb_msp_certification » ci-dessus (on regarde tout le parcours).
  let mspComplexeSansFaute = null; // null = mode non applicable à cette formation
  if (S.formation && S.formation.mode_validation === 'msp_complexe_sans_faute') {
    mspComplexeSansFaute = evalsToutes.some(ev => {
      const p = S.data.passages.find(pp => pp.id === ev.passage_id);
      if (!p || p.type_msp !== 'complexe') return false;
      const notes = ev.notes || {};
      return S.formation.competences.every(c => notes[c.id] === 'A' || notes[c.id] === 'A+');
    });
  }

  const bilan = {};
  for (const c of S.formation.competences) {
    // aPlus/aSimple comptés séparément (affichage détaillé dans l'onglet Validation) ; acquis
    // = les deux confondus, seule valeur utilisée par les règles de validation ci-dessous.
    let aPlus = 0, aSimple = 0, eca = 0, na = 0;
    for (const ev of evals) {
      const n = ev.notes[c.id];
      if (n === 'A+') aPlus++;
      else if (n === 'A') aSimple++;
      else if (n === 'ECA') eca++;
      else if (n === 'NA') na++;
    }
    const acquis = aPlus + aSimple;
    // Règle RIOFE : case grisée = « acquise » 2 fois ; case blanche = a minima ECA ;
    // au-delà des seuils NA/ECA réglés dans les Paramètres du stage, la validation relève de l'avis du jury.
    // (sauf mode_validation « msp_complexe_sans_faute », qui remplace entièrement cette logique)
    let statut;
    if (mspComplexeSansFaute !== null) {
      statut = mspComplexeSansFaute ? 'Validé' : (acquis + eca + na > 0 ? 'En cours' : '—');
    } else if (na >= seuilNA || eca >= seuilECA) {
      statut = 'Avis du jury';
    } else if (c.grisee) {
      statut = acquis >= 2 ? 'Validé' : (acquis + eca + na > 0 ? 'En cours' : '—');
    } else {
      statut = acquis > 0 || eca > 0 ? 'Validé' : (na > 0 ? 'Non acquis' : '—');
    }
    if (mspComplexeSansFaute === null && na === 1 && statut !== 'Validé' && statut !== 'Avis du jury') statut = 'Alerte NA';
    bilan[c.id] = { acquis, aPlus, aSimple, eca, na, statut };
  }
  return { bilan, nbPassages: evals.length, mspComplexeSansFaute };
}

// ---------- Onglet Paramètres du stage (réservé RP/GFor) ----------
function ongletParametresStage() {
  if (!(S.vision === 'rp' || S.vision === 'gfor')) {
    $('session-contenu').innerHTML = '<div class="carte"><p class="info">Réservé au responsable pédagogique et au GFor.</p></div>';
    return;
  }
  const sess = S.session;
  $('session-contenu').innerHTML = `
    <div class="carte">
      <h2>Paramètres du stage</h2>
      <div class="info">Réglages visibles et modifiables uniquement par le RP et le GFor. Ils s'appliquent immédiatement au calcul de validation (onglets Validation et Suivi MSP).</div>
      <label>Seuil NA déclenchant un avis du jury (nombre de « NA » sur une même compétence)</label>
      <input id="pr-seuil-na" type="number" min="1" value="${sess.seuil_na_jury ?? 2}">
      <label>Seuil ECA déclenchant un avis du jury (nombre de « ECA » sur une même compétence)</label>
      <input id="pr-seuil-eca" type="number" min="1" value="${sess.seuil_eca_jury ?? 4}">
      <label>Nombre de MSP prises en compte pour la certification</label>
      <input id="pr-nb-msp" type="number" min="1" placeholder="Laisser vide = toutes les MSP" value="${sess.nb_msp_certification ?? ''}">
      <div class="info">Si renseigné (ex. 5) : pour chaque stagiaire, seules ses N dernières MSP évaluées (les plus récentes, par numéro de passage) comptent pour la validation des compétences — même si le stagiaire en a fait davantage.</div>
      ${S.formation && S.formation.necessite_isp ? `
      <label>Présence ISP</label>
      <div class="info">Cette formation nécessite l'intervention d'un ISP. Le jour de présence réel dépend de sa disponibilité : il se règle dans l'onglet « Formateurs » (inscrire la personne qualifiée ISP puis préciser ses jours de présence), pas ici. ${(typeof joursPresenceISP === 'function' && joursPresenceISP().size) ? '✅ ISP présent le ' + Array.from(joursPresenceISP()).join(', ') + '.' : '⚠️ Aucun ISP inscrit pour l\'instant dans l\'équipe pédagogique.'}</div>` : ''}
      <label><input type="checkbox" id="pr-entretiens-obligatoires" style="width:auto" ${sess.entretiens_obligatoires !== false ? 'checked' : ''} ${S.vision === 'gfor' ? '' : 'disabled'}> Entretiens individuels obligatoires avant de pouvoir générer le PV de stage</label>
      <div class="info">${S.vision === 'gfor' ? 'Réglable uniquement par le GFor.' : 'Réglage réservé au GFor.'} Le PV de stage se génère depuis le bas de l'onglet Validation.</div>
      <button class="btn" onclick="enregistrerParametresStage()">Enregistrer</button>
    </div>
    ${_carteExportImportParametres()}`;
}

// ============================================================
// EXPORT / IMPORT DES PARAMÈTRES DE STAGE — un RP configure un stage à sa manière (chronogramme,
// seuils NA/ECA, trame des mises en situation) et veut la réutiliser sur un futur stage, souvent
// propre à un RP/lieu (pas un modèle global de formation). Exporté en fichier JSON téléchargeable,
// réimportable sur une autre session de LA MÊME FORMATION, tant qu'aucune MSP n'a encore été
// évaluée sur cette session cible (au-delà, importer par-dessus risquerait de mélanger une
// nouvelle trame avec des évaluations déjà saisies sur l'ancienne numérotation).
// ============================================================
function _carteExportImportParametres() {
  const dejaCommencee = (S.data.evaluations || []).length > 0;
  return `<div class="carte">
    <h2>Export / import des paramètres du stage</h2>
    <div class="info">Reprend les réglages NA/ECA, le nombre de MSP pour la certification, le chronogramme et la trame des mises en situation (jour, thème, sujet, type de MSP — sans les stagiaires ni les évaluateurs) pour les réutiliser sur un futur stage, souvent propres à un RP ou à un lieu de stage.</div>
    <button class="btn secondaire" onclick="exporterParametresStage()">⬇️ Exporter les paramètres de ce stage</button>
    <label style="margin-top:10px">Importer un fichier de paramètres (.json)</label>
    <input type="file" accept=".json" onchange="importerParametresStage(this)" ${dejaCommencee ? 'disabled' : ''}>
    <div class="info">${dejaCommencee
      ? `⚠️ Import désactivé : au moins une mise en situation a déjà été évaluée sur ce stage. L'import n'est possible que sur un stage neuf, avant la première MSP validée.`
      : `L'import n'est possible que sur une session de la même formation, et tant qu'aucune MSP n'a encore été évaluée sur ce stage.`}</div>
  </div>`;
}

async function exporterParametresStage() {
  const sess = S.session;
  const contenu = {
    type: 'export_parametres_stage_evaluation_sdis',
    version: 1,
    exporte_le: new Date().toISOString(),
    formation_id: S.formation ? S.formation.id : null,
    formation_code: S.formation ? S.formation.code : null,
    formation_libelle: S.formation ? S.formation.libelle : null,
    reglages: {
      seuil_na_jury: sess.seuil_na_jury ?? null,
      seuil_eca_jury: sess.seuil_eca_jury ?? null,
      nb_msp_certification: sess.nb_msp_certification ?? null,
    },
    chronogramme: (S.data.blocsPlanning || []).map(b => ({
      jour: b.jour, demi_journee: b.demi_journee, ordre: b.ordre,
      libelle: b.libelle, annotation: b.annotation, couleur: b.couleur,
      duree_minutes: b.duree_minutes, modele_id: b.modele_id || null,
    })),
    trame_msp: (S.data.passages || []).map(p => {
      const theme = p.theme_id ? (S.formation.themes || []).find(t => t.id === p.theme_id) : null;
      return {
        numero: p.numero, jour: p.jour, theme_id: p.theme_id || null,
        theme_libelle: theme ? theme.libelle : null, // filet de secours si theme_id ne matche pas à l'import
        type_msp: p.type_msp || null, sujet: p.sujet || null,
      };
    }),
  };
  const blob = new Blob([JSON.stringify(contenu, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `parametres_stage_${(S.formation ? S.formation.code : 'stage')}_${sess.code_acces}.json`.replace(/\s+/g, '_');
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Paramètres exportés');
}

function importerParametresStage(input) {
  const fichier = input.files[0];
  if (!fichier) return;
  if ((S.data.evaluations || []).length > 0) return toast('Import impossible : ce stage a déjà des MSP évaluées', false);
  const lecteur = new FileReader();
  lecteur.onload = async e => {
    try {
      const contenu = JSON.parse(e.target.result);
      if (contenu.type !== 'export_parametres_stage_evaluation_sdis') return toast('Fichier non reconnu', false);
      if (S.formation && contenu.formation_id && contenu.formation_id !== S.formation.id) {
        return toast(`Ce fichier a été exporté depuis la formation « ${contenu.formation_libelle || contenu.formation_code || '?'} », différente de la formation de ce stage (« ${S.formation.libelle} »). Import refusé.`, false);
      }

      // ---------- Réglages ----------
      const reglages = contenu.reglages || {};
      const payloadSession = {};
      if (reglages.seuil_na_jury != null) payloadSession.seuil_na_jury = reglages.seuil_na_jury;
      if (reglages.seuil_eca_jury != null) payloadSession.seuil_eca_jury = reglages.seuil_eca_jury;
      if (reglages.nb_msp_certification !== undefined) payloadSession.nb_msp_certification = reglages.nb_msp_certification;
      if (Object.keys(payloadSession).length) {
        const { error } = await sb.from('sessions').update(payloadSession).eq('id', S.session.id);
        if (error) return toast(error.message, false);
        Object.assign(S.session, payloadSession);
      }

      // ---------- Chronogramme ----------
      const blocsExistants = S.data.blocsPlanning || [];
      const nouveauxBlocs = (contenu.chronogramme || []).filter(b => {
        // Un bloc issu d'un modèle imposé (modele_id) déjà instancié pour ce jour/demi-journée
        // dans la session cible ne doit pas être dupliqué (l'app l'instancie déjà automatiquement
        // à l'ouverture du Chronogramme) — les blocs libres, eux, sont toujours importés.
        if (!b.modele_id) return true;
        return !blocsExistants.some(x => x.modele_id === b.modele_id && x.jour === b.jour && x.demi_journee === b.demi_journee);
      }).map(b => ({
        session_id: S.session.id, jour: b.jour, demi_journee: b.demi_journee, ordre: b.ordre || 0,
        libelle: b.libelle, annotation: b.annotation || null, couleur: b.couleur || null,
        duree_minutes: b.duree_minutes || null, modele_id: b.modele_id || null,
      }));
      if (nouveauxBlocs.length) {
        const { error } = await sb.from('blocs_planning').insert(nouveauxBlocs);
        if (error) return toast(error.message, false);
      }

      // ---------- Trame des mises en situation ----------
      const passagesExistants = S.data.passages || [];
      const numerosPris = new Set(passagesExistants.map(p => p.numero));
      let prochainNumero = numerosPris.size ? Math.max(...numerosPris) + 1 : 1;
      const themesFormation = (S.formation && S.formation.themes) || [];
      const normTheme = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      const nouveauxPassages = (contenu.trame_msp || []).map(p => {
        let numero = p.numero;
        if (numerosPris.has(numero)) numero = prochainNumero;
        numerosPris.add(numero);
        prochainNumero = Math.max(prochainNumero, numero + 1);
        // theme_id direct si même formation (cas courant) ; sinon filet de secours par libellé.
        let themeId = p.theme_id && themesFormation.some(t => t.id === p.theme_id) ? p.theme_id : null;
        if (!themeId && p.theme_libelle) {
          const t = themesFormation.find(t => normTheme(t.libelle) === normTheme(p.theme_libelle));
          if (t) themeId = t.id;
        }
        return {
          session_id: S.session.id, numero, jour: p.jour || 'J1',
          theme_id: themeId, type_msp: p.type_msp || null, sujet: p.sujet || null,
        };
      });
      if (nouveauxPassages.length) {
        const { error } = await sb.from('passages').insert(nouveauxPassages);
        if (error) return toast(error.message, false);
      }

      toast(`Paramètres importés : ${nouveauxBlocs.length} bloc(s) de chronogramme, ${nouveauxPassages.length} mise(s) en situation`);
      await chargerDonneesSession(S.session.id);
      ongletParametresStage();
    } catch (err) { toast('Fichier illisible : ' + err.message, false); }
  };
  lecteur.readAsText(fichier);
}

// ---------- PV de stage (livrable 9, modèle SDIS29) ----------
function _etatEntretiens() {
  const total = S.data.stagiaires.length;
  let miOk = 0, finOk = 0;
  S.data.stagiaires.forEach(s => {
    if (_entretien(s.id, 'mi_parcours') && _entretien(s.id, 'mi_parcours').signe_le) miOk++;
    if (_entretien(s.id, 'fin_stage') && _entretien(s.id, 'fin_stage').signe_le) finOk++;
  });
  return { total, miOk, finOk, complet: total > 0 && miOk === total && finOk === total };
}
function _etatJury() {
  const membres = S.data.formateurs.filter(f => f.membre_jury);
  const signes = membres.filter(f => f.signe_jury_le);
  return { total: membres.length, signes: signes.length, complet: membres.length > 0 && signes.length === membres.length };
}

function _carteEtatPVStage() {
  const sess = S.session;
  const entretiensObligatoires = sess.entretiens_obligatoires !== false;
  const etatEnt = _etatEntretiens();
  const etatJury = _etatJury();
  const peutGenerer = (!entretiensObligatoires || etatEnt.complet) && etatJury.complet;
  const verrouilleSignatureGfor = !!sess.pv_genere_le;
  return `
    <div class="carte">
      <h2>PV de stage</h2>
      <div class="info">Le PV de stage (modèle SDIS29) ne peut être généré que lorsque${entretiensObligatoires ? ' tous les entretiens individuels sont signés et que' : ''} tous les membres du jury (onglet Formateurs) ont signé.${!entretiensObligatoires ? ' Les entretiens individuels ne sont pas obligatoires pour cette session (réglage GFor, onglet Paramètres).' : ''}</div>
      <p>Entretiens mi-parcours signés : <b>${etatEnt.miOk}/${etatEnt.total}</b><br>
         Entretiens fin de stage signés : <b>${etatEnt.finOk}/${etatEnt.total}</b><br>
         Signatures du jury : <b>${etatJury.signes}/${etatJury.total}</b></p>

      <label>Nombre total d'heures de formation réalisées</label>
      <input id="pv-heures" type="number" min="0" step="0.5" value="${sess.nb_heures_formation ?? ''}">
      <label>Référence d'enregistrement (GFor)</label>
      <input id="pv-ref" value="${esc(sess.ref_enregistrement || '')}" placeholder="ex : FCPAE FPSE-SDIS29-N°20-XX">
      <label>Nom du GFor signataire</label>
      <input id="pv-gfor-nom" value="${esc(sess.gfor_signataire || '')}">
      <label>Signature du GFor</label>
      ${_zoneSignature('pv-gfor-sig', sess.gfor_signature, verrouilleSignatureGfor)}

      <h3>Identité des candidats (nécessaire pour le PV)</h3>
      <div class="table-scroll"><table>
        <tr><th>Matricule</th><th>Civilité</th><th>Nom Prénom</th><th>CIS</th><th>Observations</th></tr>
        ${S.data.stagiaires.map(s => `<tr>
          <td>${esc(s.matricule || '—')}</td>
          <td><select id="pv-civ-${s.id}"><option value="">—</option><option value="M" ${s.civilite === 'M' ? 'selected' : ''}>M</option><option value="Mme" ${s.civilite === 'Mme' ? 'selected' : ''}>Mme</option></select></td>
          <td>${esc(s.nom)} ${esc(s.prenom)}</td>
          <td>${esc(s.cis || '—')}</td>
          <td><input id="pv-obs-${s.id}" value="${esc(s.observations_pv || '')}" placeholder="absence, rattrapage..."></td>
        </tr>`).join('')}
      </table></div>
      <button class="btn secondaire" onclick="enregistrerIdentitesPV()">💾 Enregistrer les identités</button>

      ${sess.pv_genere_le
        ? `<div class="info" style="margin-top:10px">PV de stage généré le ${esc(sess.pv_genere_le.slice(0, 10))}.</div>
           <button class="btn" onclick="genererPVStage()">📄 Régénérer le PDF du PV</button>`
        : `<div style="margin-top:10px">
             <button class="btn" ${peutGenerer ? '' : 'disabled'} onclick="enregistrerInfosPV(true)">📄 Enregistrer et générer le PV de stage</button>
             <button class="btn secondaire" onclick="genererPVStage()">👁️ Aperçu du PDF (sans enregistrer)</button>
             ${!peutGenerer ? `<div class="info" style="color:#c8102e">Il manque des entretiens ou des signatures du jury pour générer officiellement le PV. L'aperçu reste disponible à tout moment, avec les données actuelles (même incomplètes).</div>` : ''}
           </div>`}
    </div>`;
}

async function enregistrerIdentitesPV() {
  for (const s of S.data.stagiaires) {
    const payload = {
      civilite: $('pv-civ-' + s.id).value || null,
      observations_pv: $('pv-obs-' + s.id).value.trim() || null,
    };
    const { error } = await sb.from('stagiaires').update(payload).eq('id', s.id);
    if (error) return toast(error.message, false);
    Object.assign(s, payload);
  }
  toast('Identités enregistrées');
}

async function enregistrerInfosPV(generer) {
  const payload = {
    nb_heures_formation: Number($('pv-heures').value) || null,
    ref_enregistrement: $('pv-ref').value.trim() || null,
    gfor_signataire: $('pv-gfor-nom').value.trim() || null,
  };
  const sig = _lireSignature('pv-gfor-sig');
  if (sig) payload.gfor_signature = sig;
  if (generer) {
    if (!payload.gfor_signataire || !(sig || S.session.gfor_signature)) return toast('Nom et signature du GFor requis pour générer le PV', false);
    payload.pv_genere_le = new Date().toISOString();
  }
  const { error } = await sb.from('sessions').update(payload).eq('id', S.session.id);
  if (error) return toast(error.message, false);
  Object.assign(S.session, payload);
  ongletValidation();
  if (generer) {
    await genererPVStage();
    toast('PV de stage généré');
  } else {
    toast('Informations enregistrées');
  }
}

async function enregistrerParametresStage() {
  const seuilNA = Number($('pr-seuil-na').value) || 2;
  const seuilECA = Number($('pr-seuil-eca').value) || 4;
  const nbMspRaw = $('pr-nb-msp').value.trim();
  const nbMsp = nbMspRaw ? Number(nbMspRaw) : null;
  const payload = { seuil_na_jury: seuilNA, seuil_eca_jury: seuilECA, nb_msp_certification: nbMsp };
  // Réglage réservé au GFor : la case existe (verrouillée) même pour un RP, on ne la sauvegarde
  // que si elle est effectivement modifiable, pour ne jamais écraser la valeur par erreur.
  if (S.vision === 'gfor') payload.entretiens_obligatoires = $('pr-entretiens-obligatoires').checked;
  const { error } = await sb.from('sessions').update(payload).eq('id', S.session.id);
  if (error) return toast(error.message, false);
  Object.assign(S.session, payload);
  toast('Paramètres du stage enregistrés');
}

// ============================================================
// SIGNATURE (canvas tactile) — composant réutilisé par les entretiens individuels, le GFor et
// le jury de stage. Capture un tracé au doigt/souris, restitué en PNG (base64) via _lireSignature().
// Rien n'est envoyé/stocké tant que le formulaire appelant ne lit pas explicitement le canvas.
// ============================================================
function _zoneSignature(zoneId, valeurExistante, lectureSeule) {
  if (lectureSeule) {
    return valeurExistante
      ? `<div class="zone-signature"><img src="${valeurExistante}" alt="signature" style="max-height:70px;border:1px solid #ddd;border-radius:4px;background:#fff"></div>`
      : `<div class="info">Non signé</div>`;
  }
  return `<div class="zone-signature">
    <canvas id="${zoneId}-canvas" width="300" height="100" style="border:1px solid #ccc;border-radius:4px;touch-action:none;background:#fff;max-width:100%"></canvas>
    <div><button type="button" class="btn petit secondaire" onclick="_effacerSignature('${zoneId}')">Effacer</button></div>
  </div>`;
}

// À appeler juste après avoir injecté le HTML contenant les zones de signature (les <canvas>
// doivent déjà être dans le DOM). Idempotent (protégé par canvas._sigInit).
function _initSignatures(zoneIds) {
  (zoneIds || []).forEach(zoneId => {
    const canvas = $(zoneId + '-canvas');
    if (!canvas || canvas._sigInit) return;
    canvas._sigInit = true;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    let dessine = false;
    const pos = e => {
      const r = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - r.left) * (canvas.width / r.width), y: (p.clientY - r.top) * (canvas.height / r.height) };
    };
    const debut = e => { dessine = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const trace = e => { if (!dessine) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
    const fin = () => { dessine = false; };
    canvas.addEventListener('mousedown', debut);
    canvas.addEventListener('mousemove', trace);
    canvas.addEventListener('mouseup', fin);
    canvas.addEventListener('mouseleave', fin);
    canvas.addEventListener('touchstart', debut, { passive: false });
    canvas.addEventListener('touchmove', trace, { passive: false });
    canvas.addEventListener('touchend', fin);
  });
}

function _effacerSignature(zoneId) {
  const canvas = $(zoneId + '-canvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function _signatureEstVide(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
  return true;
}

// Renvoie le dataURL PNG de la signature tracée, ou null si le canvas est vide (rien signé).
function _lireSignature(zoneId) {
  const canvas = $(zoneId + '-canvas');
  if (!canvas) return null;
  if (_signatureEstVide(canvas)) return null;
  return canvas.toDataURL('image/png');
}

// ============================================================
// ENTRETIENS INDIVIDUELS (mi-parcours / fin de stage) — réservé RP/GFor
// Chaque stagiaire a au plus un entretien de chaque type par session. Signature (canvas) du
// stagiaire puis du RP avant verrouillage définitif : l'entretien devient alors consultable en
// lecture seule (archivé), y compris pour le GFor, un futur RP et le chef de centre.
// ============================================================
function _entretien(stagiaireId, type) {
  return (S.data.entretiens || []).find(e => e.stagiaire_id === stagiaireId && e.type === type) || null;
}

function ongletEntretiens() {
  // Le chef de centre peut consulter (lecture seule, voir formEntretien) depuis les Archives
  // globales, mais n'a pas cet onglet dans le menu de la session — seuls RP/GFor l'ont en direct.
  if (!(S.vision === 'rp' || S.vision === 'gfor' || S.vision === 'chef_centre')) {
    $('session-contenu').innerHTML = '<div class="carte"><p class="info">Réservé au responsable pédagogique et au GFor.</p></div>';
    return;
  }
  const lignes = S.data.stagiaires.map(s => {
    const mi = _entretien(s.id, 'mi_parcours');
    const fin = _entretien(s.id, 'fin_stage');
    const statut = e => e && e.signe_le
      ? `<span class="entretien-statut fait">✅ Signé le ${esc(e.signe_le.slice(0, 10))}</span>`
      : e ? `<span class="entretien-statut attente">✏️ Brouillon</span>` : `<span class="info">Non fait</span>`;
    return `<tr>
      <td><b>${esc(s.prenom)} ${esc(s.nom)}</b></td>
      <td>${statut(mi)} <button class="btn petit secondaire" onclick="formEntretien(${s.id}, 'mi_parcours')">${mi ? 'Ouvrir' : 'Réaliser'}</button></td>
      <td>${statut(fin)} <button class="btn petit secondaire" onclick="formEntretien(${s.id}, 'fin_stage')">${fin ? 'Ouvrir' : 'Réaliser'}</button></td>
    </tr>`;
  }).join('');

  $('session-contenu').innerHTML = `
    <div class="carte">
      <h2>Entretiens individuels</h2>
      <div class="info">Deux entretiens par stagiaire : à mi-parcours et en fin de stage. Chacun peut donner lieu à un ajournement ou une résolution si nécessaire. Le commentaire de l'entretien de fin de stage est repris dans le Livret de certification du stagiaire. Une fois signé par le stagiaire et le RP, l'entretien est verrouillé et archivé (consultable par le GFor, le RP d'un prochain stage et le chef de centre).</div>
      <div class="table-scroll"><table>
        <tr><th>Stagiaire</th><th>Entretien mi-parcours</th><th>Entretien fin de stage</th></tr>
        ${lignes}
      </table></div>
      <div id="entretien-detail" style="margin-top:16px"></div>
    </div>`;
}

// Champs structurés propres à chaque livrable (modèles SDIS29 fournis) : la « Fiche de suivi et
// de résolution » (difficultés/mesures/engagements/suivi) et la « Fiche de motivation
// d'ajournement » (compétences évaluées A/ECA/NA + suites à donner) n'ont pas les mêmes champs,
// stockés à part dans entretiens_individuels.decision_donnees (jsonb) — le texte libre
// (decision_detail) reste le constat/motif en tête de fiche, commun aux deux modèles.
// Suggestion automatique A/ECA/NA pour une compétence, déduite du statut RIOFE déjà calculé dans
// l'onglet Validation (bilanStagiaire + décision du jury compétence par compétence si elle existe) —
// évite au RP de resaisir à la main ce qui est déjà tranché par ailleurs dans l'appli. Reste
// modifiable manuellement sur la fiche (radio boutons), cette valeur n'est qu'une suggestion de
// départ tant qu'aucun choix explicite n'a encore été enregistré.
function _suggestionStatutCompetence(stagiaireId, competenceId) {
  const s = S.data.stagiaires.find(x => x.id === stagiaireId);
  if (!s || !S.formation || !S.formation.competences || !S.formation.competences.length) return null;
  const { bilan } = bilanStagiaire(stagiaireId);
  const b = bilan[competenceId];
  if (!b) return null;
  const statutFinal = _statutFinalCompetence(b.statut, s, competenceId);
  if (statutFinal === 'Validé' || statutFinal === 'Validé (jury)') return 'A';
  if (statutFinal === 'En cours' || statutFinal === 'Alerte NA') return 'ECA';
  if (statutFinal === 'Non acquis' || statutFinal === 'Non validé (jury)') return 'NA';
  return null;
}

function _champsDecisionEntretien(decision, donnees, verrouille, stagiaireId) {
  const d = donnees || {};
  const dis = verrouille ? 'disabled' : '';
  if (decision === 'resolution') {
    const diff = d.difficultes || [];
    const mes = d.mesures || [];
    const suivi = d.suivi || [];
    return `
      <label>Difficultés identifiées</label>
      <label><input type="checkbox" id="en-diff-technique" ${dis} ${diff.includes('technique') ? 'checked' : ''} style="width:auto"> Techniques (gestes, protocoles)</label>
      <label><input type="checkbox" id="en-diff-organisationnelle" ${dis} ${diff.includes('organisationnelle') ? 'checked' : ''} style="width:auto"> Organisationnelles (méthode, matériel)</label>
      <label><input type="checkbox" id="en-diff-comportementale" ${dis} ${diff.includes('comportementale') ? 'checked' : ''} style="width:auto"> Comportementales (attitude, intégration dans le collectif)</label>
      <label><input type="checkbox" id="en-diff-autre-check" ${dis} ${d.difficultes_autre ? 'checked' : ''} style="width:auto"> Autres :</label>
      <input id="en-diff-autre-texte" ${dis} value="${esc(d.difficultes_autre_texte || '')}">

      <label>Mesures de résolution proposées</label>
      <label><input type="checkbox" id="en-mesure-accompagnement" ${dis} ${mes.includes('accompagnement') ? 'checked' : ''} style="width:auto"> Accompagnement spécifique (formateur référent / APP ciblé)</label>
      <label><input type="checkbox" id="en-mesure-travail-individuel" ${dis} ${mes.includes('travail_individuel') ? 'checked' : ''} style="width:auto"> Travail individuel (FOAD, référentiel, attitude…)</label>
      <textarea id="en-mesures-detail" ${dis} placeholder="Détail des mesures">${esc(d.mesures_detail || '')}</textarea>

      <label>Engagements du stagiaire</label>
      <textarea id="en-engagements" ${dis}>${esc(d.engagements || '')}</textarea>

      <label>Suivi / Évaluation de la mise en œuvre</label>
      <label><input type="checkbox" id="en-suivi-revue" ${dis} ${suivi.includes('revue_fin_stage') ? 'checked' : ''} style="width:auto"> Revue en fin de stage</label>
      <label><input type="checkbox" id="en-suivi-rattrapage" ${dis} ${suivi.includes('orientation_rattrapage') ? 'checked' : ''} style="width:auto"> Orientation vers un rattrapage ultérieur si nécessaire</label>`;
  }
  if (decision === 'ajournement') {
    const comp = d.competences || {};
    const suites = d.suites || [];
    const competences = (S.formation && S.formation.competences) || [];
    const lignesComp = competences.map(c => {
      // Priorité au choix déjà enregistré explicitement ; sinon suggestion automatique déduite du
      // statut RIOFE de la compétence (onglet Validation), pour ne pas ressaisir ce qui est déjà su.
      const valeur = comp[c.id] || _suggestionStatutCompetence(stagiaireId, c.id);
      return `
      <tr><td>${esc(c.code)} – ${esc(c.libelle)}</td>
        <td style="text-align:center"><input type="radio" name="en-comp-${c.id}" value="A" ${dis} ${valeur === 'A' ? 'checked' : ''}></td>
        <td style="text-align:center"><input type="radio" name="en-comp-${c.id}" value="ECA" ${dis} ${valeur === 'ECA' ? 'checked' : ''}></td>
        <td style="text-align:center"><input type="radio" name="en-comp-${c.id}" value="NA" ${dis} ${valeur === 'NA' ? 'checked' : ''}></td>
      </tr>`;
    }).join('');
    return `
      <label>Compétences évaluées</label>
      <div class="info">Pré-rempli automatiquement d'après le statut actuel dans l'onglet Validation — modifiable au besoin.</div>
      ${competences.length ? `
      <div class="table-scroll"><table>
        <tr><th>Compétence</th><th>Validée (A)</th><th>En cours (ECA)</th><th>Non acquise (NA)</th></tr>
        ${lignesComp}
      </table></div>` : `<div class="info">Aucune compétence définie pour cette formation.</div>`}

      <label>Proposition de suites à donner</label>
      <label><input type="checkbox" id="en-suite-rattrapage" ${dis} ${suites.includes('rattrapage_cible') ? 'checked' : ''} style="width:auto"> Rattrapage ciblé (APP / MSP complémentaires)</label>
      <label>Nombre de jours à effectuer lors d'un prochain stage</label>
      <input id="en-nb-jours-rattrapage" type="number" min="0" ${dis} value="${d.nb_jours_rattrapage ?? ''}">
      <label><input type="checkbox" id="en-suite-repassage" ${dis} ${suites.includes('repassage_complet') ? 'checked' : ''} style="width:auto"> Repassage de la formation complète (1 semaine)</label>`;
  }
  return '';
}

// Phrase institutionnelle générique, pré-remplie automatiquement quand le RP choisit Ajournement
// ou Résolution — volontairement neutre (résultats des évaluations de la semaine + critères
// RIOFE), qu'il s'agisse d'un motif technique ou de savoir-être : le RP n'a qu'à compléter après
// « au motif : » avec l'élément propre à ce stagiaire.
function _texteInstitutionnelDecision(decision) {
  const formationLib = S.formation ? S.formation.libelle : '';
  const debut = (S.session && S.session.date_debut) || '?';
  const fin = (S.session && S.session.date_fin) || '?';
  const lieu = (S.session && S.session.lieu) || '?';
  const cadre = `Au vu des résultats des évaluations de la semaine et des critères du RIOFE, l'équipe pédagogique de la formation ${formationLib} du ${debut} au ${fin} au CIS de ${lieu}`;
  if (decision === 'ajournement') return `${cadre} a décidé l'ajournement du stagiaire au motif : `;
  if (decision === 'resolution') return `${cadre} a décidé la mise en place d'un accompagnement au motif : `;
  return '';
}

function _onChangeDecisionEntretien(stagiaireId) {
  const val = $('en-decision').value;
  $('en-decision-detail-ligne').style.display = val === 'normal' ? 'none' : '';
  $('en-decision-detail-label').textContent = val === 'ajournement' ? "Motif(s) d'ajournement" : val === 'resolution' ? "Constat lors de l'entretien" : 'Motifs';
  // Pré-remplissage uniquement si le champ est encore vide, pour ne jamais écraser un texte déjà
  // rédigé par le RP (ex. en rebasculant d'un type de décision à l'autre après coup).
  const champDetail = $('en-decision-detail');
  if (champDetail && !champDetail.value.trim() && (val === 'ajournement' || val === 'resolution')) {
    champDetail.value = _texteInstitutionnelDecision(val);
  }
  $('en-decision-champs').innerHTML = _champsDecisionEntretien(val, {}, false, stagiaireId);
}

function formEntretien(stagiaireId, type) {
  const s = S.data.stagiaires.find(x => x.id === stagiaireId);
  if (!s) return;
  const e = _entretien(stagiaireId, type);
  // Le chef de centre est toujours en lecture seule ici, même si l'entretien n'est pas encore signé.
  const verrouille = !!(e && e.signe_le) || S.vision === 'chef_centre';
  const titre = type === 'mi_parcours' ? 'Entretien à mi-parcours' : 'Entretien de fin de stage';

  $('entretien-detail').innerHTML = `
    <div class="carte entretien-carte" style="background:#f7f7f9">
      <h3>${titre} — ${esc(s.prenom)} ${esc(s.nom)}</h3>
      <label>Date de l'entretien</label>
      <input id="en-date" type="date" ${verrouille ? 'disabled' : ''} value="${e && e.date_entretien ? e.date_entretien : new Date().toISOString().slice(0, 10)}">
      <label>Commentaire ${type === 'fin_stage' ? '(repris dans le Livret de certification du stagiaire)' : ''}</label>
      <textarea id="en-commentaire" ${verrouille ? 'disabled' : ''}>${e && e.commentaire ? esc(e.commentaire) : ''}</textarea>
      <label>Décision</label>
      <select id="en-decision" ${verrouille ? 'disabled' : ''} onchange="_onChangeDecisionEntretien(${stagiaireId})">
        <option value="normal" ${(!e || e.decision === 'normal') ? 'selected' : ''}>Normale (pas de suite particulière)</option>
        <option value="ajournement" ${e && e.decision === 'ajournement' ? 'selected' : ''}>Ajournement</option>
        <option value="resolution" ${e && e.decision === 'resolution' ? 'selected' : ''}>Résolution</option>
      </select>
      <div id="en-decision-detail-ligne" style="display:${e && e.decision && e.decision !== 'normal' ? '' : 'none'}">
        <label id="en-decision-detail-label">${e && e.decision === 'ajournement' ? "Motif(s) d'ajournement" : "Constat lors de l'entretien"}</label>
        <textarea id="en-decision-detail" ${verrouille ? 'disabled' : ''}>${e && e.decision_detail ? esc(e.decision_detail) : ''}</textarea>
        <div id="en-decision-champs">${_champsDecisionEntretien(e ? e.decision : 'normal', e ? e.decision_donnees : {}, verrouille, stagiaireId)}</div>
      </div>

      <label>Signature du stagiaire</label>
      ${_zoneSignature('en-sig-stag', e ? e.signature_stagiaire : null, verrouille)}
      <label>Signature du RP</label>
      ${_zoneSignature('en-sig-rp', e ? e.signature_rp : null, verrouille)}

      ${verrouille
        ? (!e
            ? `<div class="info">Cet entretien n'a pas encore été réalisé.</div>`
            : `<div class="info">${e.signe_le ? 'Entretien signé le ' + esc(e.signe_le.slice(0, 10)) + ' par ' + esc(e.rp_nom || '') + '.' : 'Entretien non signé (brouillon), consultation seule.'}</div>
               ${e.signe_le ? `<button class="btn secondaire" onclick="genererPDFEntretien(${stagiaireId}, '${type}')">📄 Voir le PDF</button>
               ${e.decision !== 'normal' ? `<button class="btn secondaire" onclick="genererPDFDecisionEntretien(${stagiaireId}, '${type}')">📄 ${e.decision === 'ajournement' ? "Fiche d'ajournement" : 'Fiche de résolution'}</button>` : ''}` : ''}`)
        : `<button class="btn secondaire" onclick="enregistrerEntretien(${stagiaireId}, '${type}', false)">💾 Enregistrer (brouillon)</button>
           <button class="btn" onclick="enregistrerEntretien(${stagiaireId}, '${type}', true)">✍️ Signer et verrouiller définitivement</button>
           ${e && e.decision !== 'normal' ? `<button class="btn secondaire" onclick="genererPDFDecisionEntretien(${stagiaireId}, '${type}')">📄 ${e.decision === 'ajournement' ? "Fiche d'ajournement" : 'Fiche de résolution'} (brouillon)</button>` : ''}`}
      <button class="btn secondaire" onclick="$('entretien-detail').innerHTML=''">Fermer</button>
    </div>`;
  if (!verrouille) _initSignatures(['en-sig-stag', 'en-sig-rp']);
}

function _lireDonneesDecisionEntretien(decision) {
  if (decision === 'resolution') {
    const difficultes = [];
    if ($('en-diff-technique') && $('en-diff-technique').checked) difficultes.push('technique');
    if ($('en-diff-organisationnelle') && $('en-diff-organisationnelle').checked) difficultes.push('organisationnelle');
    if ($('en-diff-comportementale') && $('en-diff-comportementale').checked) difficultes.push('comportementale');
    const mesures = [];
    if ($('en-mesure-accompagnement') && $('en-mesure-accompagnement').checked) mesures.push('accompagnement');
    if ($('en-mesure-travail-individuel') && $('en-mesure-travail-individuel').checked) mesures.push('travail_individuel');
    const suivi = [];
    if ($('en-suivi-revue') && $('en-suivi-revue').checked) suivi.push('revue_fin_stage');
    if ($('en-suivi-rattrapage') && $('en-suivi-rattrapage').checked) suivi.push('orientation_rattrapage');
    return {
      difficultes,
      difficultes_autre: !!($('en-diff-autre-check') && $('en-diff-autre-check').checked),
      difficultes_autre_texte: $('en-diff-autre-texte') ? $('en-diff-autre-texte').value.trim() : '',
      mesures,
      mesures_detail: $('en-mesures-detail') ? $('en-mesures-detail').value.trim() : '',
      engagements: $('en-engagements') ? $('en-engagements').value.trim() : '',
      suivi,
    };
  }
  if (decision === 'ajournement') {
    const competences = {};
    ((S.formation && S.formation.competences) || []).forEach(c => {
      const el = document.querySelector('input[name="en-comp-' + c.id + '"]:checked');
      if (el) competences[c.id] = el.value;
    });
    const suites = [];
    if ($('en-suite-rattrapage') && $('en-suite-rattrapage').checked) suites.push('rattrapage_cible');
    if ($('en-suite-repassage') && $('en-suite-repassage').checked) suites.push('repassage_complet');
    return {
      competences,
      suites,
      nb_jours_rattrapage: $('en-nb-jours-rattrapage') && $('en-nb-jours-rattrapage').value ? Number($('en-nb-jours-rattrapage').value) : null,
    };
  }
  return {};
}

async function enregistrerEntretien(stagiaireId, type, signer) {
  const decision = $('en-decision').value;
  const payload = {
    session_id: S.session.id,
    stagiaire_id: stagiaireId,
    type,
    date_entretien: $('en-date').value || null,
    commentaire: $('en-commentaire').value.trim() || null,
    decision,
    decision_detail: decision !== 'normal' ? ($('en-decision-detail').value.trim() || null) : null,
    decision_donnees: decision !== 'normal' ? _lireDonneesDecisionEntretien(decision) : {},
  };
  if (signer) {
    const sigStag = _lireSignature('en-sig-stag');
    const sigRP = _lireSignature('en-sig-rp');
    if (!sigStag || !sigRP) return toast("Les deux signatures (stagiaire et RP) sont requises pour verrouiller l'entretien", false);
    payload.signature_stagiaire = sigStag;
    payload.signature_rp = sigRP;
    payload.signe_le = new Date().toISOString();
    payload.rp_nom = S.user ? S.user.nom : (S.session.responsable || null);
  }
  const { error } = await sb.from('entretiens_individuels').upsert(payload, { onConflict: 'session_id,stagiaire_id,type' });
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id);
  toast(signer ? 'Entretien signé et verrouillé' : 'Entretien enregistré');
  ongletEntretiens();
  formEntretien(stagiaireId, type);
}

function ongletValidation() {
  const comps = S.formation.competences;
  const modeSansFaute = S.formation.mode_validation === 'msp_complexe_sans_faute';
  const lignes = S.data.stagiaires.map(s => {
    const { bilan, nbPassages, mspComplexeSansFaute } = bilanStagiaire(s.id);
    const cellules = comps.map(c => {
      const b = bilan[c.id];
      // Quand cette compétence précise est en « Avis du jury » (trop de ECA/NA sur elle,
      // indépendamment des autres compétences du même stagiaire), on affiche un sélecteur
      // dédié pour trancher CETTE compétence — plusieurs compétences en avis du jury sur un
      // même stagiaire peuvent être validées séparément, ce n'est pas une décision globale.
      const statutFinal = _statutFinalCompetence(b.statut, s, c.id);
      const cls = classeStatutCompetence(statutFinal);
      const decComp = _decisionJuryComp(s, c.id);
      // Sélecteur volontairement compact (classe .select-jury-comp, largeur bridée en CSS) :
      // avec des libellés complets et une largeur "auto", chaque case s'élargissait au texte
      // le plus long du menu déroulant et le tableau débordait bien plus qu'avant ce sélecteur.
      const selecteurJury = b.statut === 'Avis du jury' ? `
        <br><select class="select-jury-comp" onchange="enregistrerDecisionJuryCompetence(${s.id}, ${c.id}, this.value)" title="Décision du jury pour cette compétence précisément">
          <option value="" ${decComp === '' ? 'selected' : ''}>En attente</option>
          <option value="valide" ${decComp === 'valide' ? 'selected' : ''}>✅ Val.</option>
          <option value="non_valide" ${decComp === 'non_valide' ? 'selected' : ''}>❌ Refus.</option>
        </select>` : '';
      // Détail des notes empilé verticalement (une ligne par catégorie) plutôt qu'un résumé
      // horizontal type « 9A/1E/1N » : chaque ligne est plus courte, donc la colonne reste étroite.
      return `<td class="${cls}" title="acquis:${b.acquis} ECA:${b.eca} NA:${b.na}">${statutFinal}<br>
        <small>${b.aPlus} A+<br>${b.aSimple} A<br>${b.eca} ECA<br>${b.na} NA</small>${selecteurJury}</td>`;
    }).join('');
    const okMsp = nbPassages >= S.formation.nb_msp_min;
    const dec = s.decision_jury || '';
    return `<tr><td><b>${esc(s.prenom)} ${esc(s.nom)}</b><br>
      <small class="${okMsp ? 'statut-valide' : 'statut-na'}">${nbPassages}/${S.formation.nb_msp_min} MSP évaluées</small>
      ${modeSansFaute ? `<br><small class="${mspComplexeSansFaute ? 'statut-valide' : 'statut-na'}">${mspComplexeSansFaute ? '✅ MSP complexe sans faute' : '❌ pas encore de MSP complexe sans faute'}</small>` : ''}<br>
      <button class="btn petit secondaire" style="margin-top:4px" onclick="genererFicheSuivi(${s.id})">📄 Fiche PDF</button>
      <button class="btn petit secondaire" style="margin-top:4px" onclick="genererLivretCertification(${s.id})">📘 Livret</button></td>${cellules}
      <td><select onchange="enregistrerDecisionJury(${s.id}, this.value)">
        <option value="" ${dec === '' ? 'selected' : ''}>À décider</option>
        <option value="valide" ${dec === 'valide' ? 'selected' : ''}>✅ Validé</option>
        <option value="non_valide" ${dec === 'non_valide' ? 'selected' : ''}>❌ Non validé</option>
      </select></td></tr>`;
  }).join('');

  $('session-contenu').innerHTML = `
    <div class="carte">
      <h2>Validation des compétences</h2>
      <div class="info">${modeSansFaute
        ? `Règle spécifique à cette formation : validation conditionnée à au moins une MSP « complexe » notée intégralement en A/A+ (aucune ECA/NA/NE), toutes compétences confondues. ${S.formation.nb_msp_min} MSP évaluées minimum par stagiaire.`
        : `Règle RIOFE : compétence grisée = « acquise » (A ou A+) 2 fois minimum · ${S.formation.nb_msp_min} MSP évaluées minimum par stagiaire. Détail par case : nb Acquis / ECA / NA.`}
        Quand une case passe en « Avis du jury » (trop de ECA/NA sur cette compétence précisément), un sélecteur apparaît directement dans la case pour trancher CETTE compétence — sur plusieurs avis du jury, certaines compétences peuvent être validées et d'autres non, indépendamment les unes des autres.
        La colonne « Décision jury » à droite reste la décision finale globale de la commission de certification pour l'ensemble du stage.</div>
      <div class="table-scroll"><table class="table-validation">
        <tr><th>Stagiaire</th>${comps.map(c => `<th title="${esc(c.libelle)}">${esc(c.code)}</th>`).join('')}<th>Décision jury</th></tr>
        ${lignes}
      </table></div>
    </div>` + _carteEtatPVStage();
  if (!S.session.pv_genere_le) _initSignatures(['pv-gfor-sig']);
}

async function enregistrerDecisionJury(stagiaireId, valeur) {
  const { error } = await sb.from('stagiaires').update({ decision_jury: valeur || null }).eq('id', stagiaireId);
  if (error) return toast(error.message, false);
  const s = S.data.stagiaires.find(x => x.id === stagiaireId);
  if (s) s.decision_jury = valeur || null;
  toast('Décision enregistrée');
}

// Décision du jury pour UNE compétence précise (statut « Avis du jury »), indépendante de la
// décision finale globale du stage ci-dessus — sur plusieurs avis du jury, chaque compétence
// se tranche séparément.
async function enregistrerDecisionJuryCompetence(stagiaireId, competenceId, valeur) {
  const s = S.data.stagiaires.find(x => x.id === stagiaireId);
  if (!s) return;
  const decisions = { ...(s.decisions_jury_competences || {}) };
  if (valeur) decisions[competenceId] = valeur; else delete decisions[competenceId];
  const { error } = await sb.from('stagiaires').update({ decisions_jury_competences: decisions }).eq('id', stagiaireId);
  if (error) return toast(error.message, false);
  s.decisions_jury_competences = decisions;
  toast('Décision jury enregistrée pour cette compétence');
  ongletValidation();
}

// ---------- Onglet Comparatif auto-éval / éval formateur ----------
// Deux vues au choix : « Tableau » (détail texte, compétence + critères, passage par passage)
// et « Courbes » (une courbe par compétence, sur le modèle du livret de certification PDF,
// mais en une seule colonne pleine largeur — plus lisible sur téléphone qu'une grille 2 colonnes).
let _cmpVueActuelle = 'tableau';

function ongletComparatif() {
  $('session-contenu').innerHTML = `
    <div class="carte">
      <h2>Comparatif auto-évaluation / évaluation formateur</h2>
      <label>Stagiaire</label>
      <select id="cmp-stag" onchange="_cmpRafraichir()">
        <option value="">— choisir —</option>
        ${S.data.stagiaires.map(s => `<option value="${s.id}">${esc(s.prenom)} ${esc(s.nom)}</option>`).join('')}
      </select>
      <div class="onglets" style="margin-top:10px">
        <button id="cmp-tab-tableau" class="actif" onclick="_cmpChangerVue('tableau')">📋 Tableau</button>
        <button id="cmp-tab-courbe" onclick="_cmpChangerVue('courbe')">📈 Courbes</button>
      </div>
      <div id="cmp-zone"></div>
    </div>`;
  _cmpVueActuelle = 'tableau';
}

function _cmpChangerVue(mode) {
  _cmpVueActuelle = mode;
  $('cmp-tab-tableau').classList.toggle('actif', mode === 'tableau');
  $('cmp-tab-courbe').classList.toggle('actif', mode === 'courbe');
  _cmpRafraichir();
}

function _cmpRafraichir() {
  const stagiaireId = Number($('cmp-stag').value) || null;
  if (_cmpVueActuelle === 'courbe') afficherComparatifCourbe(stagiaireId, 'cmp-zone');
  else afficherComparatif(stagiaireId, 'cmp-zone');
}

// Comparatif façon grille RIOFE (p.25) : chaque compétence avec sa note formateur (A+/A/ECA/NA)
// et, juste en dessous, ses critères d'auto-évaluation rattachés (0 à 10), comme sur la fiche papier.
function afficherComparatif(stagiaireId, zoneId) {
  if (!stagiaireId) { $(zoneId).innerHTML = ''; return; }
  const passages = S.data.equipiers
    .filter(e => e.stagiaire_id === stagiaireId)
    .map(e => S.data.passages.find(p => p.id === e.passage_id))
    .filter(Boolean).sort((a, b) => a.numero - b.numero);

  const blocs = passages.map(p => {
    const ev = S.data.evaluations.find(x => x.passage_id === p.id && x.stagiaire_id === stagiaireId);
    const auto = S.data.autoevaluations.find(x => x.passage_id === p.id && x.stagiaire_id === stagiaireId);
    const theme = S.formation.themes.find(t => t.id === p.theme_id);
    if (!ev && !auto) return '';

    const lignesComp = S.formation.competences.map(c => {
      const n = ev ? ev.notes[c.id] : null;
      const criteresComp = S.formation.criteres.filter(cr => cr.competence_id === c.id);
      const sousLignes = criteresComp.map(cr => {
        const v = auto ? auto.notes[cr.id] : null;
        if (!n && !v) return '';
        return `<tr><td style="padding-left:22px;color:#666">${esc(cr.libelle)}</td><td>${v ? '<b>' + v + '</b>/10' : '<span class="info">—</span>'}</td></tr>`;
      }).join('');
      if ((!n || n === 'NE') && !sousLignes) return '';
      return `<tr><td><span class="code">${esc(c.code)}</span> ${esc(c.libelle.slice(0, 70))}…</td>
        <td>${n && n !== 'NE' ? `<span class="niv niv-${NIV_CLASSE[n]}">${n}</span>` : '<span class="info">non évalué</span>'}</td></tr>${sousLignes}`;
    }).join('');

    return `<h3>Passage n°${p.numero} · ${esc(p.jour)} · ${esc(theme ? theme.libelle : '')}</h3>
      <div class="info">
        ${ev ? 'Formateur : ' + esc(ev.formateur || '') + ' · ressenti ' + (ev.ressenti_formateur ?? '—') + '/5' : 'Pas encore d’évaluation formateur'}
        ${auto && auto.ressenti ? ' · Ressenti stagiaire : ' + esc(auto.ressenti) : ''}
      </div>
      <table><tr><th>Compétence / critère</th><th>Note formateur / auto-éval</th></tr>
        ${lignesComp || '<tr><td colspan="2" class="info">Aucune donnée</td></tr>'}
      </table>
      ${ev && ev.commentaire ? `<p class="info">« ${esc(ev.commentaire)} »</p>` : ''}`;
  }).join('');
  $(zoneId).innerHTML = blocs || '<p class="info">Aucune évaluation pour ce stagiaire.</p>';
}

// Vue graphique du comparatif : une courbe par compétence (une couleur par critère
// d'auto-évaluation + une courbe formateur, toujours orange), sur le même principe que le
// tableau récapitulatif du livret de certification PDF — mais en une seule colonne pleine
// largeur (pas de grille 2 colonnes) pour rester lisible sur téléphone, et en SVG responsive
// (viewBox, pas de largeur fixe en pixels) plutôt qu'en jsPDF puisqu'on est à l'écran.
// Réutilise ORANGE_FORMATEUR / COULEURS_STAGIAIRE / _noteFormateurVersChiffre définis dans
// pdf.js pour garder le même code couleur partout dans l'appli (web et PDF).
function afficherComparatifCourbe(stagiaireId, zoneId) {
  if (!stagiaireId) { $(zoneId).innerHTML = ''; return; }
  const mesPassages = S.data.equipiers
    .filter(e => e.stagiaire_id === stagiaireId && e.evalue)
    .map(e => S.data.passages.find(p => p.id === e.passage_id))
    .filter(Boolean).sort((a, b) => a.numero - b.numero);
  const mesEvals = pid => S.data.evaluations.find(x => x.passage_id === pid && x.stagiaire_id === stagiaireId);
  const mesAutos = pid => S.data.autoevaluations.find(x => x.passage_id === pid && x.stagiaire_id === stagiaireId);
  const numerosMSP = mesPassages.map(p => p.numero);

  if (numerosMSP.length < 2) {
    $(zoneId).innerHTML = '<p class="info">Pas assez de mises en situation évaluées pour ce stagiaire pour tracer une courbe (2 minimum, ' + numerosMSP.length + ' actuellement).</p>';
    return;
  }

  const competencesAvecCriteres = S.formation.competences.filter(c =>
    S.formation.criteres.some(cr => cr.competence_id === c.id));

  const cartes = competencesAvecCriteres.map(c => {
    const critList = S.formation.criteres.filter(cr => cr.competence_id === c.id).sort((a, b) => a.ordre - b.ordre);
    const seriesStagiaire = critList.map((cr, ci) => ({
      code: c.code + '.' + (ci + 1),
      libelle: cr.libelle, // libellé complet du critère, affiché dans la légende (le code seul ne dit rien sans revenir au référentiel)
      couleur: COULEURS_STAGIAIRE[ci % COULEURS_STAGIAIRE.length],
      valeurs: mesPassages.map(p => { const a = mesAutos(p.id); return a ? a.notes[cr.id] : null; }),
    }));
    const serieFormateur = {
      code: 'Formateur',
      libelle: '',
      couleur: ORANGE_FORMATEUR,
      valeurs: mesPassages.map(p => { const ev = mesEvals(p.id); return ev ? _noteFormateurVersChiffre(ev.notes[c.id]) : null; }),
    };
    const toutes = [...seriesStagiaire, serieFormateur];
    return `<div class="carte-courbe">
      <h4>${esc(c.code)} — ${esc(c.libelle)}</h4>
      ${_svgLegendeCourbe(toutes)}
      ${_svgCourbeMultipleWeb(toutes, numerosMSP, 10, mesPassages.map(p => p.id), stagiaireId)}
    </div>`;
  }).join('');

  $(zoneId).innerHTML = `
    <div class="info" style="margin-bottom:8px">Échelle 0 à 10 (A+ = 10, A = 7, ECA = 5, NA = 0) · n° de MSP en abscisse (cliquable) · courbe formateur toujours en orange.</div>
    <div id="cmp-detail-passage"></div>
    ${cartes || '<p class="info">Aucune compétence avec critères détaillés pour cette formation.</p>'}`;
}

// Cliquer sur un n° de MSP en abscisse d'une courbe affiche ici l'essentiel pour comprendre un
// pic bas ou haut : remarque du formateur, APP proposées, mot du stagiaire et mot du formateur
// pour ce passage précis — sans avoir à rebasculer sur l'onglet Tableau ou Évaluations.
function afficherDetailPassageComparatif(stagiaireId, passageId) {
  const zone = $('cmp-detail-passage');
  if (!zone) return;
  const p = S.data.passages.find(x => x.id === passageId);
  const ev = S.data.evaluations.find(x => x.passage_id === passageId && x.stagiaire_id === stagiaireId);
  const auto = S.data.autoevaluations.find(x => x.passage_id === passageId && x.stagiaire_id === stagiaireId);
  const theme = p ? S.formation.themes.find(t => t.id === p.theme_id) : null;
  zone.innerHTML = `
    <div class="carte" style="background:#f7f7f9;margin-bottom:12px">
      <h4>Détail — MSP n°${p ? p.numero : '?'} · ${esc(p ? p.jour : '')} · ${esc(theme ? theme.libelle : '')}</h4>
      <label>Remarque formateur</label>
      <p>${ev && ev.commentaire ? esc(ev.commentaire) : '<span class="info">— non renseignée —</span>'}</p>
      <label>APP proposées</label>
      <p>${[ev?.app1, ev?.app2, ev?.app3].filter(Boolean).map(esc).join(' · ') || '<span class="info">— aucune —</span>'}</p>
      <label>Mot du stagiaire (ressenti)</label>
      <p>${auto && auto.ressenti ? esc(auto.ressenti) : '<span class="info">— non renseigné —</span>'}</p>
      <label>Mot du formateur</label>
      <p>${ev && ev.ressenti_mot ? esc(ev.ressenti_mot) : '<span class="info">— non renseigné —</span>'}</p>
    </div>`;
  zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Une ligne par série (code en gras + libellé complet du critère) plutôt qu'une légende en
// ligne avec juste le code — sans le libellé, impossible de savoir à quoi correspond « C1.1 »
// sans revenir chercher dans le référentiel.
function _svgLegendeCourbe(series) {
  return `<div class="legende-courbe">${series.map(s =>
    `<div class="item-legende-courbe" style="color:rgb(${s.couleur.join(',')})"><span class="pastille-courbe" style="background:rgb(${s.couleur.join(',')})"></span><b>${esc(s.code)}</b>${s.libelle ? ' — ' + esc(s.libelle) : ''}</div>`
  ).join('')}</div>`;
}

// SVG en viewBox (pas de taille fixe en px) : s'adapte à la largeur du conteneur, du téléphone
// à l'écran large, sans recalcul JS ni redessin au resize.
function _svgCourbeMultipleWeb(series, numerosMSP, max, passagesIds, stagiaireId) {
  const W = 320, H = 130, PAD_L = 20, PAD_R = 6, PAD_T = 8, PAD_B = 16;
  const largeur = W - PAD_L - PAD_R, hauteur = H - PAD_T - PAD_B;
  const n = numerosMSP.length;
  const px = i => PAD_L + (i / (n - 1)) * largeur;
  const py = v => PAD_T + hauteur - (Math.max(0, Math.min(max, v)) / max) * hauteur;

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="svg-courbe" preserveAspectRatio="xMidYMid meet">`;
  svg += `<rect x="${PAD_L}" y="${PAD_T}" width="${largeur}" height="${hauteur}" fill="none" stroke="#ccc"/>`;
  svg += `<text x="${PAD_L - 3}" y="${PAD_T + 6}" font-size="8" fill="#999" text-anchor="end">${max}</text>`;
  svg += `<text x="${PAD_L - 3}" y="${PAD_T + hauteur}" font-size="8" fill="#999" text-anchor="end">0</text>`;

  series.forEach(s => {
    // Une valeur manquante coupe la ligne à cet endroit plutôt que d'interpoler ou de fausser
    // la lecture — même logique que dans le PDF (_pdfCourbeMultiple).
    let segs = [], cur = [];
    s.valeurs.forEach((v, i) => {
      if (v == null) { if (cur.length > 1) segs.push(cur); cur = []; return; }
      cur.push([px(i), py(v)]);
    });
    if (cur.length > 1) segs.push(cur);
    const couleur = 'rgb(' + s.couleur.join(',') + ')';
    segs.forEach(seg => {
      svg += `<polyline points="${seg.map(p => p.join(',')).join(' ')}" fill="none" stroke="${couleur}" stroke-width="1.8"/>`;
    });
    s.valeurs.forEach((v, i) => {
      if (v == null) return;
      svg += `<circle cx="${px(i)}" cy="${py(v)}" r="2.4" fill="${couleur}"/>`;
    });
  });

  // N° de MSP cliquable (quand on connaît le stagiaire + l'id du passage) : ouvre le détail de
  // la mise en situation pour comprendre un pic haut ou bas de la courbe (remarque formateur,
  // APP proposées, mots stagiaire/formateur) — voir afficherDetailPassageComparatif.
  numerosMSP.forEach((num, i) => {
    const clic = (passagesIds && passagesIds[i] != null && stagiaireId)
      ? ` style="cursor:pointer;font-weight:bold" onclick="afficherDetailPassageComparatif(${stagiaireId}, ${passagesIds[i]})"`
      : '';
    svg += `<text x="${px(i)}" y="${H - 3}" font-size="8" fill="#999" text-anchor="middle"${clic}>${esc(String(num))}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

// ---------- Onglet Bilan journalier (formateur/RP/GFor) ----------
// Un bilan par stagiaire et par jour : 3 champs remplis par le stagiaire (lecture seule ici) +
// une remarque formateur (éditable). Vue tabulaire pour repérer d'un coup d'œil qui a rempli
// son bilan, plus un détail par stagiaire/jour pour lire et compléter.
function ongletBilanJournalier() {
  const jours = joursFormation();
  const lignes = S.data.stagiaires.map(s => {
    const cellules = jours.map(j => {
      const b = (S.data.bilansJournaliers || []).find(x => x.stagiaire_id === s.id && x.jour === j);
      const rempli = b && (b.jai_appris || b.jai_besoin || b.je_propose);
      return `<td style="text-align:center;cursor:pointer" onclick="afficherBilanJournalierDetail(${s.id}, '${j}')">
        ${rempli ? '✅' : '<span class="info">—</span>'}${b && b.remarque_formateur ? ' 💬' : ''}
      </td>`;
    }).join('');
    return `<tr><td><b>${esc(s.prenom)} ${esc(s.nom)}</b></td>${cellules}</tr>`;
  }).join('');

  $('session-contenu').innerHTML = `
    <div class="carte">
      <h2>Bilan journalier</h2>
      <div class="info">✅ = bilan rempli par le stagiaire pour ce jour · 💬 = remarque formateur déjà ajoutée. Clique sur une case pour lire le détail et ajouter/modifier la remarque formateur.</div>
      <div class="table-scroll"><table>
        <tr><th>Stagiaire</th>${jours.map(j => `<th>${j}</th>`).join('')}</tr>
        ${lignes}
      </table></div>
      <div id="bilan-detail" style="margin-top:14px"></div>
    </div>`;
}

function afficherBilanJournalierDetail(stagiaireId, jour) {
  const s = S.data.stagiaires.find(x => x.id === stagiaireId);
  const b = (S.data.bilansJournaliers || []).find(x => x.stagiaire_id === stagiaireId && x.jour === jour);
  $('bilan-detail').innerHTML = `
    <div class="carte" style="background:#f7f7f9">
      <h3>${esc(s.prenom)} ${esc(s.nom)} — ${esc(jour)}</h3>
      <label>J'ai appris et compris</label>
      <p>${b && b.jai_appris ? esc(b.jai_appris) : '<span class="info">— non renseigné —</span>'}</p>
      <label>J'ai besoin (d'approfondir, de compléter, de rechercher…)</label>
      <p>${b && b.jai_besoin ? esc(b.jai_besoin) : '<span class="info">— non renseigné —</span>'}</p>
      <label>Je propose (j'envisage de faire évoluer dans mes pratiques, dans mon organisation)</label>
      <p>${b && b.je_propose ? esc(b.je_propose) : '<span class="info">— non renseigné —</span>'}</p>
      <label>Remarque formateur</label>
      <textarea id="bilan-detail-remarque">${esc(b && b.remarque_formateur || '')}</textarea>
      <button class="btn" onclick="enregistrerRemarqueFormateurBilan(${stagiaireId}, '${jour}')">Enregistrer la remarque</button>
    </div>`;
}

async function enregistrerRemarqueFormateurBilan(stagiaireId, jour) {
  const remarque = $('bilan-detail-remarque').value.trim() || null;
  const { error } = await sb.from('bilans_journaliers').upsert({
    session_id: S.session.id, stagiaire_id: stagiaireId, jour, remarque_formateur: remarque,
  }, { onConflict: 'stagiaire_id,jour' });
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id);
  toast('Remarque enregistrée');
  ongletBilanJournalier();
  afficherBilanJournalierDetail(stagiaireId, jour);
}

// ============================================================
// CÔTÉ STAGIAIRE
// ============================================================
// Note : ongletPlanning, formBlocPlanning, enregistrerBlocPlanning, supprimerBlocPlanning,
// deposerBlocPlanning et blocStagiaireChronogramme (chronogramme/planning, livrable 8) vivent
// dans planning.js, pas ici — voir ce fichier pour ne pas mélanger cette partie récente avec le
// reste du métier.

async function ecranAccueilStagiaire() {
  await chargerDonneesSession(S.session.id);
  const stagiaireId = S.stagiaire.id;
  const mesPassages = S.data.equipiers
    .filter(e => e.stagiaire_id === stagiaireId)
    .map(e => S.data.passages.find(p => p.id === e.passage_id))
    .filter(Boolean).sort((a, b) => a.numero - b.numero);

  // Les auto-évaluations pas encore faites remontent en tête de liste (plus facile à repérer ce
  // qu'il reste à faire) ; à l'intérieur de chaque groupe (à faire / déjà faites), tri par numéro.
  const blocs = [...mesPassages]
    .sort((a, b) => {
      const aFaite = S.data.autoevaluations.some(x => x.passage_id === a.id && x.stagiaire_id === stagiaireId);
      const bFaite = S.data.autoevaluations.some(x => x.passage_id === b.id && x.stagiaire_id === stagiaireId);
      if (aFaite !== bFaite) return aFaite ? 1 : -1;
      return a.numero - b.numero;
    })
    .map(p => {
      const theme = S.formation.themes.find(t => t.id === p.theme_id);
      const auto = S.data.autoevaluations.find(a => a.passage_id === p.id && a.stagiaire_id === stagiaireId);
      return `<button class="btn-liste" onclick="formAutoEval(${p.id})">
        Passage n°${p.numero} · ${esc(p.jour)} · ${esc(theme ? theme.libelle : '')}
        ${auto ? '<span class="niv niv-A">auto-éval faite ✓</span>' : '<span class="niv niv-NE">à faire</span>'}
      </button>`;
    }).join('');

  $('stagiaire-contenu').innerHTML = `
    ${blocStagiaireChronogramme()}
    <div class="carte">
      <h2>Mes passages</h2>
      ${blocs || '<p class="info">Aucun passage programmé pour toi pour le moment.</p>'}
    </div>
    <div class="carte">
      <h2>Mon comparatif</h2>
      <p class="info">Ton auto-évaluation face au regard du formateur, passage par passage.</p>
      <div id="stag-cmp"></div>
      <button class="btn secondaire" onclick="afficherComparatif(${stagiaireId}, 'stag-cmp')">Afficher</button>
    </div>
    <div class="carte">
      <h2>Mots de mes formateurs</h2>
      <p class="info">Le petit mot laissé par le formateur à l'issue de chacune de tes mises en situation.</p>
      <table><tr><th>Passage</th><th>Mot du formateur</th></tr>
        ${mesPassages.map(p => {
          const ev = S.data.evaluations.find(x => x.passage_id === p.id && x.stagiaire_id === stagiaireId);
          return `<tr><td>MSP n°${p.numero}</td><td>${ev && ev.ressenti_mot ? esc(ev.ressenti_mot) : '—'}</td></tr>`;
        }).join('') || '<tr><td colspan="2" class="info">Aucun passage pour le moment.</td></tr>'}
      </table>
    </div>
    <div class="carte">
      <h2>Bilan de fin de journée</h2>
      <label>Jour</label>
      <select id="bilan-jour" onchange="chargerBilanJourUI(this.value)">
        ${joursFormation().map(j => `<option value="${j}">${j}</option>`).join('')}
      </select>
      <label>J'ai appris et compris</label>
      <textarea id="bilan-appris"></textarea>
      <label>J'ai besoin (d'approfondir, de compléter, de rechercher…)</label>
      <textarea id="bilan-besoin"></textarea>
      <label>Je propose (j'envisage de faire évoluer dans mes pratiques, dans mon organisation)</label>
      <textarea id="bilan-propose"></textarea>
      <button class="btn" onclick="enregistrerBilanJournalierStagiaire()">Enregistrer mon bilan</button>
      <p class="info">Remarque du formateur pour ce jour : <span id="bilan-remarque-formateur">—</span></p>
    </div>
    ${_blocAvisFinStage(stagiaireId, null)}`;
  show('ecran-stagiaire');
  chargerBilanJourUI(joursFormation()[0]);
}

// ============================================================
// AVIS DE FIN DE STAGE — un stagiaire OU un formateur/RP dépose un avis (note + commentaire libre)
// une fois le stage terminé. Réutilisé côté stagiaire (ecranAccueilStagiaire) et côté
// formateur/RP/GFor (ongletAvisFinStage) — un seul des deux id (stagiaireId/formateurId) renseigné.
// ============================================================
function _blocAvisFinStage(stagiaireId, formateurId) {
  const avis = (S.data.avisFinStage || []).find(a =>
    stagiaireId ? a.stagiaire_id === stagiaireId : a.formateur_id === formateurId);
  return `<div class="carte">
    <h2>Avis de fin de stage</h2>
    <div class="info">Ton avis global sur le déroulement du stage — consulté par le RP dans son compte rendu de fin de stage.</div>
    <label>Note globale</label>
    <select id="avis-note">
      <option value="">— Pas de note —</option>
      ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${avis && avis.note === n ? 'selected' : ''}>${'★'.repeat(n)}${'☆'.repeat(5 - n)} (${n}/5)</option>`).join('')}
    </select>
    <label>Commentaire</label>
    <textarea id="avis-commentaire">${avis && avis.commentaire ? esc(avis.commentaire) : ''}</textarea>
    <button class="btn" onclick="enregistrerAvisFinStage(${stagiaireId ?? 'null'}, ${formateurId ?? 'null'})">Enregistrer mon avis</button>
    ${avis ? `<p class="info">Dernier enregistrement : ${esc((avis.updated_at || avis.created_at || '').slice(0, 10))}</p>` : ''}
  </div>`;
}

async function enregistrerAvisFinStage(stagiaireId, formateurId) {
  const noteRaw = $('avis-note').value;
  const payload = {
    session_id: S.session.id,
    stagiaire_id: stagiaireId || null,
    formateur_id: formateurId || null,
    note: noteRaw ? Number(noteRaw) : null,
    commentaire: $('avis-commentaire').value.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const onConflict = stagiaireId ? 'session_id,stagiaire_id' : 'session_id,formateur_id';
  const { error } = await sb.from('avis_fin_stage').upsert(payload, { onConflict });
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id);
  toast('Avis enregistré');
  if (stagiaireId) ecranAccueilStagiaire(); else ongletAvisFinStage();
}

// Onglet « Mon avis de fin de stage » (formateur/RP/GFor) : retrouve la fiche session_formateurs
// de la personne connectée via son nom (même logique que le filtrage RP/formateur par session,
// voir S.user.nom ailleurs dans le fichier) et lui permet de déposer son propre avis.
function ongletAvisFinStage() {
  const moi = S.user ? S.data.formateurs.find(f => f.nom === S.user.nom) : null;
  if (!moi) {
    $('session-contenu').innerHTML = `<div class="carte"><p class="info">Tu n'es pas inscrit comme membre de l'équipe pédagogique de cette session — impossible de déposer un avis. Si c'est une erreur, demande au RP de t'inscrire dans l'onglet Formateurs.</p></div>`;
    return;
  }
  $('session-contenu').innerHTML = _blocAvisFinStage(null, moi.id);
}

// Onglet « Compte rendu de fin de stage » (réservé RP/GFor) : consultation de tous les avis
// stagiaires/formateurs déposés, et rédaction de la conclusion du RP sur le déroulement du stage.
function ongletCompteRenduFinStage() {
  if (!(S.vision === 'rp' || S.vision === 'gfor')) {
    $('session-contenu').innerHTML = '<div class="carte"><p class="info">Réservé au responsable pédagogique et au GFor.</p></div>';
    return;
  }
  const etoiles = n => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—';
  const lignesStag = S.data.stagiaires.map(s => {
    const a = (S.data.avisFinStage || []).find(x => x.stagiaire_id === s.id);
    return `<tr><td>${esc(s.prenom)} ${esc(s.nom)}</td><td>${etoiles(a && a.note)}</td><td>${a && a.commentaire ? esc(a.commentaire) : '<span class="info">Pas d\'avis déposé</span>'}</td></tr>`;
  }).join('');
  const lignesForm = S.data.formateurs.map(f => {
    const a = (S.data.avisFinStage || []).find(x => x.formateur_id === f.id);
    return `<tr><td>${esc(f.nom)}</td><td>${etoiles(a && a.note)}</td><td>${a && a.commentaire ? esc(a.commentaire) : '<span class="info">Pas d\'avis déposé</span>'}</td></tr>`;
  }).join('');

  $('session-contenu').innerHTML = `
    <div class="carte">
      <h2>Compte rendu de fin de stage</h2>
      <div class="info">Avis des stagiaires et de l'équipe pédagogique sur le déroulement du stage, à consulter avant de rédiger ta conclusion.</div>
      <h3>Avis des stagiaires</h3>
      <div class="table-scroll"><table><tr><th>Stagiaire</th><th>Note</th><th>Commentaire</th></tr>${lignesStag}</table></div>
      <h3 style="margin-top:16px">Avis de l'équipe pédagogique</h3>
      <div class="table-scroll"><table><tr><th>Nom</th><th>Note</th><th>Commentaire</th></tr>${lignesForm}</table></div>
      <h3 style="margin-top:16px">Conclusion du RP</h3>
      <textarea id="cr-conclusion" style="min-height:120px">${S.session.conclusion_rp ? esc(S.session.conclusion_rp) : ''}</textarea>
      <button class="btn" onclick="enregistrerConclusionRP()">Enregistrer la conclusion</button>
      ${S.session.conclusion_rp_le ? `<p class="info">Dernier enregistrement : ${esc(S.session.conclusion_rp_le.slice(0, 10))}</p>` : ''}
    </div>`;
}

async function enregistrerConclusionRP() {
  const payload = { conclusion_rp: $('cr-conclusion').value.trim() || null, conclusion_rp_le: new Date().toISOString() };
  const { error } = await sb.from('sessions').update(payload).eq('id', S.session.id);
  if (error) return toast(error.message, false);
  Object.assign(S.session, payload);
  toast('Conclusion enregistrée');
  ongletCompteRenduFinStage();
}

// Recharge les 3 champs du bilan du stagiaire (+ la remarque formateur en lecture seule) pour
// le jour sélectionné — un bilan par jour, indépendant des autres jours de la même session.
function chargerBilanJourUI(jour) {
  const b = (S.data.bilansJournaliers || []).find(x => x.stagiaire_id === S.stagiaire.id && x.jour === jour);
  $('bilan-appris').value = b?.jai_appris || '';
  $('bilan-besoin').value = b?.jai_besoin || '';
  $('bilan-propose').value = b?.je_propose || '';
  $('bilan-remarque-formateur').textContent = b?.remarque_formateur || '—';
}

async function enregistrerBilanJournalierStagiaire() {
  const jour = $('bilan-jour').value;
  const { error } = await sb.from('bilans_journaliers').upsert({
    session_id: S.session.id, stagiaire_id: S.stagiaire.id, jour,
    jai_appris: $('bilan-appris').value.trim() || null,
    jai_besoin: $('bilan-besoin').value.trim() || null,
    je_propose: $('bilan-propose').value.trim() || null,
  }, { onConflict: 'stagiaire_id,jour' });
  if (error) return toast(error.message, false);
  await chargerDonneesSession(S.session.id);
  toast('Bilan enregistré');
  chargerBilanJourUI(jour);
}

let _autoCourante = null;

function formAutoEval(passageId) {
  const p = S.data.passages.find(x => x.id === passageId);
  const existante = S.data.autoevaluations.find(a => a.passage_id === passageId && a.stagiaire_id === S.stagiaire.id);
  _autoCourante = { passageId, notes: existante ? { ...existante.notes } : {} };

  $('stagiaire-contenu').innerHTML = `
    <div class="carte">
      <span class="lien-retour" onclick="ecranAccueilStagiaire()">← Retour</span>
      <h2>Auto-évaluation — passage n°${p.numero}</h2>
      <div class="info">Niveau de maîtrise : 0 = aucune · 10 = totale. Ne renseigne que ce qui concerne ta mise en situation.</div>
      ${S.formation.criteres.map(cr => {
        const v = _autoCourante.notes[cr.id] || 0;
        return `<div class="bloc-crit">
          <div>${esc(cr.libelle)} — <span class="valeur" id="val-${cr.id}">${v || '—'}</span></div>
          <input type="range" min="0" max="10" value="${v}"
            oninput="majCurseur(${cr.id}, this.value)">
        </div>`;
      }).join('')}
      <label>Mon ressenti (un mot ou une phrase)</label>
      <input id="au-ressenti" value="${esc(existante?.ressenti || '')}" placeholder="ex : confiant, désemparé…">
      <button class="btn" onclick="enregistrerAutoEval()">Enregistrer mon auto-évaluation</button>
    </div>`;
  show('ecran-stagiaire');
}

function majCurseur(critId, valeur) {
  const v = Number(valeur);
  if (v === 0) delete _autoCourante.notes[critId];
  else _autoCourante.notes[critId] = v;
  $('val-' + critId).textContent = v || '—';
}

async function enregistrerAutoEval() {
  if (!Object.keys(_autoCourante.notes).length) return toast('Renseigner au moins un critère', false);
  const { error } = await sb.from('autoevaluations').upsert({
    passage_id: _autoCourante.passageId, stagiaire_id: S.stagiaire.id,
    notes: _autoCourante.notes, ressenti: $('au-ressenti').value.trim() || null,
  }, { onConflict: 'passage_id,stagiaire_id' });
  if (error) return toast(error.message, false);
  toast('Auto-évaluation enregistrée');
  ecranAccueilStagiaire();
}

// ============================================================
// PARAMÈTRES FORMATIONS (GFor) — réglage global, indépendant des sessions :
// création de formation, seuils A/ECA/NA par défaut, barème RP/formateurs
// vis-à-vis du nombre de stagiaires (RIOFE), nombre de jours, compétences.
// ============================================================
let _baremeEnCours = [];

async function ecranParametresFormations() {
  majMenu('param-form');
  show('ecran-staff-accueil');
  const { data: formationsToutes, error } = await sb.from('formations').select('*').order('libelle');
  if (error) return toast(error.message, false);
  window._formations = formationsToutes || [];

  // Un seul écran pour toutes les formations (initiale + FMPA continue) : le type se choisit à la
  // création (formulaire), et les actions disponibles par ligne s'adaptent en conséquence —
  // référentiel complet (compétences/planning imposé) pour une initiale, séquences FMPA pour une
  // continue. Évite d'avoir deux écrans séparés qui se recoupent et prêtent à confusion.
  const lignes = window._formations.map(f => {
    const estFMPA = f.type_formation === 'continue';
    return `<tr>
      <td><span class="badge" style="background:${esc(f.couleur)};color:#fff">${esc(f.domaine)}</span>
        <span class="badge" style="background:${estFMPA ? '#ef6c00' : '#37474f'};color:#fff">${estFMPA ? 'FC' : 'FI'}</span></td>
      <td><b>${esc(f.libelle)}</b> <span class="info">(${esc(f.code)})</span>${f.actif ? '' : ' <span class="info">— inactive</span>'}</td>
      <td>${estFMPA ? '<span class="info">—</span>' : f.nb_jours}</td>
      <td>${estFMPA ? '<span class="info">1 / 6 stag.</span>' : f.nb_stagiaires_max}</td>
      <td>${estFMPA ? '<span class="info">—</span>' : `${f.nb_msp_min} (+${f.nb_msp_rattrapage} rattrap.)`}</td>
      <td>${estFMPA ? '<span class="info">—</span>' : (f.mode_validation === 'msp_complexe_sans_faute' ? '<span class="badge" style="background:#6a1b9a;color:#fff">MSP complexe sans faute</span>' : `NA ≥ ${f.seuil_na_jury_defaut ?? 2} / ECA ≥ ${f.seuil_eca_jury_defaut ?? 4}`)}</td>
      <td style="white-space:nowrap">
        <button class="btn petit secondaire" onclick="ecranFormulaireFormation(${f.id})">✏️</button>
        ${estFMPA
          ? `<button class="btn petit secondaire" onclick="ecranSequencesFormation(${f.id})">🗓️ Séquences FMPA</button>`
          : `<button class="btn petit secondaire" onclick="ecranCompetencesFormation(${f.id})">📋 Compétences</button>
             <button class="btn petit secondaire" onclick="ecranBlocsPlanningModeles(${f.id})">🗓️ Planning imposé</button>`}
      </td>
    </tr>`;
  }).join('');

  $('staff-dashboard').innerHTML = `<div class="carte">
    <h2>Paramètres formations</h2>
    <div class="info">Réglages généraux, valables pour toutes les sessions à venir de la formation (le RP/GFor peut encore affiner NA/ECA session par session dans l'onglet « Paramètres » de chaque session). Pour une formation continue (FMPA), les colonnes MSP/jury ne s'appliquent pas — configure plutôt ses séquences annuelles via « 🗓️ Séquences FMPA ».</div>
    <div class="table-scroll"><table>
      <tr><th>Domaine / Type</th><th>Formation</th><th>Jours</th><th>Stag. / ratio</th><th>MSP requises</th><th>Avis du jury si</th><th></th></tr>
      ${lignes || `<tr><td colspan="7"><span class="info">Aucune formation</span></td></tr>`}
    </table></div>
    <button class="btn" onclick="ecranFormulaireFormation()">➕ Nouvelle formation</button>
    <div class="info" style="margin-top:6px">Choisis le type (initiale / continue) dans le formulaire — le reste de l'écran s'adapte automatiquement.</div>
  </div>`;
}

function _rendreBaremeEnCours() {
  $('fm-bareme-liste').innerHTML = _baremeEnCours.map((t, i) => `<div class="ligne" style="align-items:center">
      <span>de <b>${t.min}</b> à <b>${t.max}</b> stagiaires → <b>${t.formateurs}</b> formateur(s)</span>
      <a onclick="_baremeEnCours.splice(${i},1);_rendreBaremeEnCours()" style="cursor:pointer;color:var(--warn);font-weight:bold"> ✕</a>
    </div>`).join('') || '<p class="info">Aucune tranche définie — le calcul du besoin en formateurs sera désactivé.</p>';
}

function ajouterTrancheBareme() {
  const min = Number($('fm-bar-min').value), max = Number($('fm-bar-max').value), formateurs = Number($('fm-bar-form').value);
  if (!min || !max || max < min || !formateurs) return toast('Tranche invalide (min/max/formateurs)', false);
  _baremeEnCours.push({ min, max, formateurs });
  _baremeEnCours.sort((a, b) => a.min - b.min);
  $('fm-bar-min').value = ''; $('fm-bar-max').value = ''; $('fm-bar-form').value = '';
  _rendreBaremeEnCours();
}

function ecranFormulaireFormation(id) {
  const f = id ? (window._formations || []).find(x => x.id === id) : null;
  _baremeEnCours = f ? JSON.parse(JSON.stringify(f.bareme_formateurs || [])) : [];
  $('staff-dashboard').innerHTML = `<div class="carte">
    <span class="lien-retour" onclick="ecranParametresFormations()">← Retour aux paramètres formations</span>
    <h2>${f ? 'Modifier — ' + esc(f.libelle) : 'Nouvelle formation'}</h2>
    <div class="ligne">
      <div><label>Code (ex : SUAP)</label><input id="fm-code" value="${esc(f?.code || '')}"></div>
      <div><label>Libellé</label><input id="fm-libelle" value="${esc(f?.libelle || '')}"></div>
    </div>
    <div class="ligne">
      <div><label>Domaine (affichage)</label><select id="fm-domaine">${DOMAINES_COMP.map(d => `<option ${d === f?.domaine ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div><label>Couleur (badge)</label><input id="fm-couleur" type="color" value="${esc(f?.couleur || '#607d8b')}"></div>
    </div>
    <div class="ligne">
      <div><label>Nombre de jours de formation</label><input id="fm-jours" type="number" min="1" value="${f?.nb_jours ?? 5}"></div>
      <div><label>Nombre de stagiaires (valeur indicative par défaut)</label><input id="fm-stagmax" type="number" min="1" value="${f?.nb_stagiaires_max ?? 12}">
        <div class="info">Ce n'est pas un plafond réglementaire fixe : le nombre réel de stagiaires par session dépend de l'équipe pédagogique. Cette valeur ne sert que d'estimation par défaut (jauge du tableau de bord) tant que les stagiaires ne sont pas encore inscrits. Le besoin réel en formateurs est calculé via le barème d'encadrement ci-dessous, quel que soit l'effectif réel.</div></div>
    </div>
    <div class="ligne">
      <div><label>Nombre de MSP requises</label><input id="fm-mspmin" type="number" min="1" value="${f?.nb_msp_min ?? 4}"></div>
      <div><label>Dont MSP de rattrapage</label><input id="fm-msprattrap" type="number" min="0" value="${f?.nb_msp_rattrapage ?? 1}"></div>
    </div>
    <div class="ligne">
      <div><label>Nombre de RP requis</label><input id="fm-nbrp" type="number" min="1" value="${f?.nb_rp_requis ?? 1}"></div>
      <div><label>Formation active</label><select id="fm-actif"><option value="true" ${f?.actif !== false ? 'selected' : ''}>Oui</option><option value="false" ${f?.actif === false ? 'selected' : ''}>Non</option></select></div>
    </div>
    <div class="ligne">
      <div><label>Type de formation</label><select id="fm-type-formation">
        <option value="continue" ${(!f || f.type_formation !== 'initiale') ? 'selected' : ''}>Formation continue</option>
        <option value="initiale" ${f?.type_formation === 'initiale' ? 'selected' : ''}>Formation initiale</option>
      </select>
      <div class="info">Détermine le libellé imprimé en en-tête du PV de stage (« PROCÈS VERBAL PAE FPSE Formation Continue » ou « ...Formation Initiale »).</div></div>
    </div>

    <h3>Avis du jury — seuils par défaut</h3>
    <div class="info">Nombre de ECA ou de NA sur une même compétence à partir duquel la validation passe en « Avis du jury ». Valeur reprise à la création de chaque nouvelle session de cette formation (réglable ensuite session par session). Sans effet si le mode de validation ci-dessous est réglé sur « MSP complexe sans faute ».</div>
    <div class="ligne">
      <div><label>Nombre de NA</label><input id="fm-seuil-na" type="number" min="1" value="${f?.seuil_na_jury_defaut ?? 2}"></div>
      <div><label>Nombre de ECA</label><input id="fm-seuil-eca" type="number" min="1" value="${f?.seuil_eca_jury_defaut ?? 4}"></div>
    </div>

    <h3>Types de MSP et mode de validation</h3>
    <div class="info">Fonctionnalité optionnelle, activable formation par formation (ex : CA1E1E — Sergent). Une fois activée, chaque MSP programmée peut être étiquetée « mineure » ou « complexe ».</div>
    <label><input type="checkbox" id="fm-types-msp" style="width:auto" ${f?.utilise_types_msp ? 'checked' : ''} onchange="$('fm-mode-validation-ligne').style.display = this.checked ? '' : 'none'"> Utiliser les types de MSP (mineure / complexe) pour cette formation</label>
    <div class="ligne" id="fm-mode-validation-ligne" style="display:${f?.utilise_types_msp ? '' : 'none'}">
      <div><label>Mode de validation</label>
        <select id="fm-mode-validation">
          <option value="standard" ${(!f || f.mode_validation === 'standard') ? 'selected' : ''}>Standard (règles RIOFE habituelles — acquis 2 fois / seuils NA-ECA)</option>
          <option value="msp_complexe_sans_faute" ${f?.mode_validation === 'msp_complexe_sans_faute' ? 'selected' : ''}>MSP complexe sans faute (remplace la règle standard — au moins une MSP complexe notée intégralement A/A+)</option>
        </select>
      </div>
    </div>

    <h3>Intervention ISP (infirmier sapeur-pompier)</h3>
    <label><input type="checkbox" id="fm-necessite-isp" style="width:auto" ${f?.necessite_isp ? 'checked' : ''}> Cette formation nécessite l'intervention d'un ISP</label>
    <div class="info">Le jour de présence réel de l'ISP dépend de sa disponibilité : il se règle session par session, directement dans l'onglet « Formateurs » de la session (inscrire la personne qualifiée ISP puis préciser ses jours de présence) — pas ici. Ce jour est alors mis en évidence en vert dans le chronogramme.</div>

    <h3>Barème d'encadrement (RIOFE) — RP/formateurs vis-à-vis du nombre de stagiaires</h3>
    <div id="fm-bareme-liste" style="margin-bottom:8px"></div>
    <div class="ligne">
      <div><label>De (stagiaires)</label><input id="fm-bar-min" type="number" min="1"></div>
      <div><label>À (stagiaires)</label><input id="fm-bar-max" type="number" min="1"></div>
      <div><label>Formateurs requis</label><input id="fm-bar-form" type="number" min="1"></div>
      <div style="align-self:flex-end"><button class="btn petit" onclick="ajouterTrancheBareme()">➕ Ajouter</button></div>
    </div>

    <button class="btn" style="margin-top:16px" onclick="enregistrerFormation(${f ? f.id : 'null'})">Enregistrer la formation</button>
  </div>`;
  _rendreBaremeEnCours();
}

async function enregistrerFormation(id) {
  const code = $('fm-code').value.trim().toUpperCase();
  const libelle = $('fm-libelle').value.trim();
  if (!code || !libelle) return toast('Code et libellé requis', false);
  const payload = {
    code, libelle,
    domaine: $('fm-domaine').value,
    couleur: $('fm-couleur').value,
    nb_jours: Number($('fm-jours').value) || 5,
    nb_stagiaires_max: Number($('fm-stagmax').value) || 12,
    nb_msp_min: Number($('fm-mspmin').value) || 4,
    nb_msp_rattrapage: Number($('fm-msprattrap').value) || 0,
    nb_rp_requis: Number($('fm-nbrp').value) || 1,
    actif: $('fm-actif').value === 'true',
    seuil_na_jury_defaut: Number($('fm-seuil-na').value) || 2,
    seuil_eca_jury_defaut: Number($('fm-seuil-eca').value) || 4,
    bareme_formateurs: _baremeEnCours,
    utilise_types_msp: $('fm-types-msp').checked,
    mode_validation: $('fm-types-msp').checked ? $('fm-mode-validation').value : 'standard',
    necessite_isp: $('fm-necessite-isp').checked,
    type_formation: $('fm-type-formation').value,
  };
  const req = id ? sb.from('formations').update(payload).eq('id', id) : sb.from('formations').insert(payload);
  const { error } = await req;
  if (error) return toast(error.message, false);
  toast(id ? 'Formation mise à jour' : 'Formation créée');
  ecranParametresFormations();
}

// ---------- Compétences d'une formation (référentiel RIOFE) ----------
async function ecranCompetencesFormation(formationId) {
  const f = (window._formations || []).find(x => x.id === formationId);
  const { data: comp, error } = await sb.from('competences').select('*').eq('formation_id', formationId).order('ordre');
  if (error) return toast(error.message, false);
  window._competences = comp || [];

  const lignes = (comp || []).map(c => `<tr>
      <td><input value="${esc(c.ordre)}" type="number" style="width:56px" id="cp-ordre-${c.id}"></td>
      <td><input value="${esc(c.code)}" style="width:70px" id="cp-code-${c.id}"></td>
      <td><input value="${esc(c.libelle)}" id="cp-lib-${c.id}"></td>
      <td style="text-align:center"><input type="checkbox" id="cp-grisee-${c.id}" ${c.grisee ? 'checked' : ''} style="width:auto"></td>
      <td style="white-space:nowrap">
        <button class="btn petit secondaire" onclick="enregistrerCompetence(${c.id})">💾</button>
        <button class="btn petit secondaire" onclick="supprCompetence(${c.id})">✕</button>
      </td>
    </tr>`).join('');

  $('staff-dashboard').innerHTML = `<div class="carte">
    <span class="lien-retour" onclick="ecranParametresFormations()">← Retour aux paramètres formations</span>
    <h2>Compétences — ${esc(f ? f.libelle : '')}</h2>
    <div class="info">Compétence « grisée » (RIOFE) : doit être acquise 2 fois pour être validée. Sinon, un seul acquis/ECA suffit.</div>
    <div class="table-scroll"><table>
      <tr><th>Ordre</th><th>Code</th><th>Libellé</th><th>Grisée</th><th></th></tr>
      ${lignes}
    </table></div>
    <h3>Ajouter une compétence</h3>
    <div class="ligne">
      <div><label>Ordre</label><input id="cp-new-ordre" type="number" value="${(comp || []).length + 1}"></div>
      <div><label>Code</label><input id="cp-new-code" placeholder="ex : C8"></div>
      <div><label>Libellé</label><input id="cp-new-lib"></div>
      <div><label>Grisée</label><input type="checkbox" id="cp-new-grisee" checked style="width:auto"></div>
      <div style="align-self:flex-end"><button class="btn petit" onclick="ajouterCompetence(${formationId})">➕ Ajouter</button></div>
    </div>
  </div>`;
}

async function enregistrerCompetence(id) {
  const { error } = await sb.from('competences').update({
    ordre: Number($('cp-ordre-' + id).value) || 1,
    code: $('cp-code-' + id).value.trim(),
    libelle: $('cp-lib-' + id).value.trim(),
    grisee: $('cp-grisee-' + id).checked,
  }).eq('id', id);
  if (error) return toast(error.message, false);
  toast('Compétence mise à jour');
}

async function ajouterCompetence(formationId) {
  const code = $('cp-new-code').value.trim(), libelle = $('cp-new-lib').value.trim();
  if (!code || !libelle) return toast('Code et libellé requis', false);
  const { error } = await sb.from('competences').insert({
    formation_id: formationId, code, libelle,
    ordre: Number($('cp-new-ordre').value) || 1,
    grisee: $('cp-new-grisee').checked,
  });
  if (error) return toast(error.message, false);
  toast('Compétence ajoutée');
  ecranCompetencesFormation(formationId);
}

async function supprCompetence(id) {
  if (!confirm('Supprimer cette compétence ? Les évaluations déjà enregistrées sur cette compétence resteront en base mais ne seront plus rattachées à un référentiel affiché.')) return;
  const { error } = await sb.from('competences').delete().eq('id', id);
  if (error) return toast(error.message, false);
  const formationId = (window._competences || []).find(c => c.id === id)?.formation_id;
  toast('Compétence supprimée');
  if (formationId) ecranCompetencesFormation(formationId);
  else ecranParametresFormations();
}

// ============================================================
// EFFECTIFS PAR CIS (GFor) — roster de référence, indépendant des sessions.
// Sert de population de référence au tableau de bord « Suivi FMPA » : sans cette liste, l'appli
// ne connaît que les personnes déjà passées par un stage (stagiaires) ou déjà qualifiées
// (aptitudes), donc impossible de savoir qui n'a JAMAIS fait sa FMPA.
// ============================================================
let _filtreEffectifsCIS = '';

async function ecranEffectifsCIS() {
  majMenu('effectifs');
  show('ecran-staff-accueil');
  const { data, error } = await sb.from('agents').select('*').order('cis').order('nom');
  if (error) return toast(error.message, false);
  window._agents = data || [];
  _rendreEffectifsCIS();
}

function _rendreEffectifsCIS() {
  const agents = (window._agents || []).filter(a =>
    !_filtreEffectifsCIS || a.cis === _filtreEffectifsCIS);
  const parCIS = {};
  for (const a of (window._agents || [])) (parCIS[a.cis || '— sans CIS —'] = parCIS[a.cis || '— sans CIS —'] || []).push(a);

  const lignes = agents.map(a => `<tr>
      <td>${esc(a.matricule || '—')}</td>
      <td>${esc(a.nom)}</td><td>${esc(a.prenom)}</td>
      <td>${esc(a.cis || '—')}</td>
      <td>${esc(a.statut || '—')}</td>
      <td>${a.actif ? '<span class="statut-valide">Actif</span>' : '<span class="info">Inactif</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn petit secondaire" onclick="toggleActifAgent(${a.id}, ${!a.actif})">${a.actif ? '⏸️' : '▶️'}</button>
        <button class="btn petit secondaire" onclick="supprAgent(${a.id})">✕</button>
      </td>
    </tr>`).join('');

  $('staff-dashboard').innerHTML = `<div class="carte">
    <h2>Effectifs par CIS (${(window._agents || []).length})</h2>
    <div class="info">Roster de référence de tous les agents rattachés à chaque centre de secours, indépendant des stages/sessions. Sert de base au tableau de bord « Suivi FMPA » pour savoir qui a fait sa formation continue et qui ne l'a pas encore faite.</div>
    <div class="ligne">
      <div><label>Filtrer par CIS</label><select onchange="_filtreEffectifsCIS = this.value; _rendreEffectifsCIS()">
        <option value="">Tous les CIS</option>
        ${Object.keys(parCIS).sort().map(c => `<option value="${esc(c)}" ${_filtreEffectifsCIS === c ? 'selected' : ''}>${esc(c)} (${parCIS[c].length})</option>`).join('')}
      </select></div>
    </div>
    <div class="table-scroll"><table>
      <tr><th>Matricule</th><th>Nom</th><th>Prénom</th><th>CIS</th><th>Statut</th><th>État</th><th></th></tr>
      ${lignes || `<tr><td colspan="7"><span class="info">Aucun agent enregistré pour l'instant — utilise l'import Excel ci-dessous.</span></td></tr>`}
    </table></div>

    <h3>Ajouter un agent</h3>
    <div class="ligne">
      <div><label>Nom</label><input id="ag-nom"></div>
      <div><label>Prénom</label><input id="ag-prenom"></div>
    </div>
    <div class="ligne">
      <div><label>Matricule</label><input id="ag-mat"></div>
      <div><label>CIS de rattachement</label>${selectCIS('ag-cis')}</div>
      <div><label>Statut</label><select id="ag-statut"><option value="">—</option>${STATUTS.map(s => `<option value="${s}">${s}</option>`).join('')}</select></div>
    </div>
    <button class="btn" onclick="ajouterAgent()">Ajouter</button>

    <h3>Import Excel</h3>
    <p class="info">Colonnes attendues : Matricule, Nom, Prénom, CIS, Statut. Utile pour charger d'un coup l'effectif complet d'un ou plusieurs centres (export d'un logiciel RH type GEEF).</p>
    <button class="btn secondaire" onclick="telechargerModeleAgents()">📄 Télécharger le modèle</button>
    <label style="margin-top:10px">Fichier à importer (.xlsx)</label>
    <input type="file" accept=".xlsx,.xls,.csv" onchange="importerAgents(this)">
  </div>`;
}

async function ajouterAgent() {
  const nom = $('ag-nom').value.trim(), prenom = $('ag-prenom').value.trim();
  if (!nom || !prenom) return toast('Nom et prénom requis', false);
  const payload = {
    nom, prenom,
    matricule: $('ag-mat').value.trim() || null,
    cis: $('ag-cis').value || null,
    statut: $('ag-statut').value || null,
  };
  const { error } = await sb.from('agents').insert(payload);
  if (error) return toast(error.message, false);
  toast('Agent ajouté');
  ecranEffectifsCIS();
}

async function toggleActifAgent(id, actif) {
  const { error } = await sb.from('agents').update({ actif }).eq('id', id);
  if (error) return toast(error.message, false);
  const a = (window._agents || []).find(x => x.id === id);
  if (a) a.actif = actif;
  _rendreEffectifsCIS();
}

async function supprAgent(id) {
  if (!confirm('Supprimer cet agent du roster ?')) return;
  const { error } = await sb.from('agents').delete().eq('id', id);
  if (error) return toast(error.message, false);
  toast('Agent supprimé');
  ecranEffectifsCIS();
}

function telechargerModeleAgents() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Matricule', 'Nom', 'Prénom', 'CIS', 'Statut'],
    ['V0911111', 'BERNARD', 'Esteban', 'CIS BANNALEC', 'SPV'],
    ['V0922222', 'JORAND', 'Romane', 'CIS QUIMPERLE', 'SPP'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Effectifs');
  XLSX.writeFile(wb, 'modele_effectifs_cis.xlsx');
}

function importerAgents(input) {
  const fichier = input.files[0];
  if (!fichier) return;
  const lecteur = new FileReader();
  lecteur.onload = async e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const lignes = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const existants = window._agents || [];
      const rows = [];
      for (const l of lignes) {
        const o = { actif: true };
        for (const k of Object.keys(l)) {
          const c = norm(k);
          if (c.startsWith('nom')) o.nom = String(l[k]).trim();
          else if (c.startsWith('pren')) o.prenom = String(l[k]).trim();
          else if (c.startsWith('matri')) o.matricule = String(l[k]).trim();
          else if (c.startsWith('cis')) o.cis = String(l[k]).trim();
          else if (c.startsWith('stat')) {
            const v = String(l[k]).trim().toUpperCase();
            o.statut = STATUTS.includes(v) ? v : null;
          }
        }
        if (o.nom && o.prenom && !existants.some(a =>
          (o.matricule && a.matricule === o.matricule) || norm(a.nom + a.prenom) === norm(o.nom + o.prenom))) {
          rows.push(o);
        }
      }
      if (!rows.length) return toast('Aucune ligne exploitable ou agents déjà tous présents', false);
      const { error } = await sb.from('agents').insert(rows);
      if (error) return toast(error.message, false);
      toast(rows.length + ' agent(s) importé(s)');
      ecranEffectifsCIS();
    } catch (err) { toast('Fichier illisible : ' + err.message, false); }
  };
  lecteur.readAsArrayBuffer(fichier);
}

// ============================================================
// SÉQUENCES FMPA (GFor) — définition annuelle, pour UNE formation continue donnée, du nombre de
// séquences et du volume horaire de chacune (le programme change chaque année, publié en général
// au 2e semestre pour l'année suivante). Accessible depuis Paramètres formations (bouton
// « 🗓️ Séquences FMPA » sur une ligne de formation continue). Les formateurs piochent ensuite
// dans ces séquences pour créer leurs sessions FMPA (voir ecranNouvelleSession / _majBlocFMPA).
// ============================================================
let _sequencesEnCours = [];

async function ecranSequencesFormation(formationId) {
  show('ecran-staff-accueil');
  _sequencesEnCours = [];
  const f = (window._formations || []).find(x => x.id === formationId);
  const { data: prog, error } = await sb.from('programmes_fmpa')
    .select('*, sequences_fmpa(*)').eq('formation_id', formationId).order('annee', { ascending: false });
  if (error) return toast(error.message, false);
  const programmes = prog || [];

  const lignesProg = programmes.map(p => {
    const seqs = [...(p.sequences_fmpa || [])].sort((a, b) => a.ordre - b.ordre);
    const totalH = seqs.reduce((n, s) => n + Number(s.volume_horaire || 0), 0);
    return `<div class="carte" style="margin-bottom:10px">
      <b>${p.annee}</b>
      <span class="badge" style="background:#607d8b;color:#fff;margin-left:6px">${seqs.length} séquence(s) · ${totalH} h</span>
      <button class="btn petit secondaire" style="float:right" onclick="supprimerProgrammeFMPA(${p.id}, ${formationId})">✕ Supprimer</button>
      <div class="table-scroll" style="margin-top:8px"><table>
        <tr><th>#</th><th>Séquence</th><th>Volume horaire</th></tr>
        ${seqs.map(s => `<tr><td>${s.ordre}</td><td>${esc(s.libelle)}</td><td>${s.volume_horaire} h</td></tr>`).join('') || '<tr><td colspan="3"><span class="info">Aucune séquence</span></td></tr>'}
      </table></div>
    </div>`;
  }).join('');

  $('staff-dashboard').innerHTML = `<div class="carte">
    <span class="lien-retour" onclick="ecranParametresFormations()">← Retour aux paramètres formations</span>
    <h2>Séquences FMPA — ${esc(f ? f.libelle : '')}</h2>
    <div class="info">Le programme change chaque année (généralement publié au 2<sup>e</sup> semestre pour l'année suivante) : nombre de séquences et volume horaire de chacune librement réglables. Les formateurs créent ensuite leurs sessions FMPA en piochant dans les séquences du programme de l'année.</div>
    ${lignesProg || '<p class="info">Aucun programme créé pour l’instant.</p>'}
  </div>
  <div class="carte">
    <h3>Créer un programme</h3>
    <div class="ligne">
      <div><label>Année</label><input type="number" id="pf-annee" value="${new Date().getFullYear() + 1}" style="width:120px"></div>
    </div>
    <label>Séquences</label>
    <div class="ligne">
      <div><label>Libellé</label><input id="pf-seq-libelle" placeholder="ex : Bilan et prise en charge"></div>
      <div><label>Volume horaire</label><input id="pf-seq-heures" type="number" step="0.5" value="2" style="width:100px"></div>
      <div style="align-self:flex-end"><button class="btn petit" onclick="ajouterSequenceEnCours()">➕ Ajouter</button></div>
    </div>
    <div id="pf-seq-liste" style="margin:8px 0"></div>
    <button class="btn" onclick="creerProgrammeFMPA(${formationId})">Créer le programme</button>
  </div>`;
}

function _rendreSequencesEnCours() {
  $('pf-seq-liste').innerHTML = _sequencesEnCours.map((s, i) =>
    `<span class="badge" style="background:#00695c;color:#fff;margin:2px">
      ${i + 1}. ${esc(s.libelle)} — ${s.volume_horaire} h
      <a onclick="_sequencesEnCours.splice(${i},1);_rendreSequencesEnCours()" style="cursor:pointer;color:#fff"> ✕</a></span>`).join('');
}

function ajouterSequenceEnCours() {
  const libelle = $('pf-seq-libelle').value.trim();
  const heures = Number($('pf-seq-heures').value) || 0;
  if (!libelle) return toast('Renseigner le libellé de la séquence', false);
  if (heures <= 0) return toast('Renseigner un volume horaire valide', false);
  _sequencesEnCours.push({ libelle, volume_horaire: heures });
  $('pf-seq-libelle').value = '';
  _rendreSequencesEnCours();
}

async function creerProgrammeFMPA(formationId) {
  const annee = Number($('pf-annee').value);
  if (!annee) return toast('Renseigner une année', false);
  if (!_sequencesEnCours.length) return toast('Ajouter au moins une séquence', false);
  const { data: prog, error } = await sb.from('programmes_fmpa').insert({ formation_id: formationId, annee }).select().single();
  if (error) return toast(error.message.includes('unique') || error.code === '23505' ? 'Un programme existe déjà pour cette formation et cette année' : error.message, false);
  const { error: e2 } = await sb.from('sequences_fmpa').insert(
    _sequencesEnCours.map((s, i) => ({ programme_id: prog.id, libelle: s.libelle, volume_horaire: s.volume_horaire, ordre: i + 1 })));
  if (e2) return toast(e2.message, false);
  toast('Programme FMPA créé avec ' + _sequencesEnCours.length + ' séquence(s)');
  ecranSequencesFormation(formationId);
}

async function supprimerProgrammeFMPA(id, formationId) {
  if (!confirm('Supprimer ce programme FMPA et toutes ses séquences ? Les sessions déjà créées dessus perdront ce rattachement.')) return;
  const { error } = await sb.from('programmes_fmpa').delete().eq('id', id);
  if (error) return toast(error.message, false);
  toast('Programme supprimé');
  ecranSequencesFormation(formationId);
}

// ============================================================
// SUIVI FMPA PAR CIS (RP/GFor/Chef de centre) — tableau de bord annuel.
// Un CIS est « commencé » dès qu'une session de formation continue (formations.type_formation =
// 'continue') a été organisée cette année-là (sessions.lieu = CIS). Un agent du roster est compté
// « fait » s'il apparaît comme stagiaire (via matricule, ou à défaut nom+prénom) d'une session de
// formation continue de l'année sélectionnée, quel que soit le CIS où cette session a eu lieu.
// ============================================================
async function ecranSuiviFMPA() {
  majMenu('fmpa');
  show('ecran-staff-accueil');
  window._fmpaAnnee = window._fmpaAnnee || new Date().getFullYear();
  await _rendreSuiviFMPA();
}

function _idSafeCIS(c) {
  return String(c).replace(/[^a-zA-Z0-9]/g, '_');
}

async function _rendreSuiviFMPA() {
  const annee = window._fmpaAnnee;
  const debut = annee + '-01-01', fin = annee + '-12-31';
  const cisChefCentre = S.vision === 'chef_centre' ? (S.user && S.user.cis) : null;

  const [ag, formCont, sess] = await Promise.all([
    sb.from('agents').select('*').eq('actif', true),
    sb.from('formations').select('*').eq('actif', true).eq('type_formation', 'continue').order('libelle'),
    sb.from('sessions').select('id, lieu, date_debut, formation_id, programme_fmpa_id, formations!inner(type_formation)')
      .eq('formations.type_formation', 'continue').gte('date_debut', debut).lte('date_debut', fin),
  ]);
  if (ag.error) return toast(ag.error.message, false);
  if (formCont.error) return toast(formCont.error.message, false);
  if (sess.error) return toast(sess.error.message, false);
  const agents = ag.data || [];
  const formationsContinues = formCont.data || [];
  const sessionsFMPA = sess.data || [];
  const sessionIds = sessionsFMPA.map(s => s.id);

  if (window._fmpaFormationId == null) window._fmpaFormationId = (formationsContinues[0] && formationsContinues[0].id) || null;
  const formationChoisie = formationsContinues.find(f => f.id === window._fmpaFormationId) || null;

  let stagiaires = [];
  if (sessionIds.length) {
    const { data, error } = await sb.from('stagiaires').select('id, session_id, nom, prenom, matricule').in('session_id', sessionIds);
    if (error) return toast(error.message, false);
    stagiaires = data || [];
  }

  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  // Programme FMPA de l'année pour la formation choisie (s'il existe) : permet un suivi cumulatif
  // séquence par séquence, un agent pouvant avoir couvert les séquences requises sur plusieurs
  // sessions différentes (formateurs différents, dates différentes).
  let programme = null;
  if (formationChoisie) {
    const { data: progData, error: progErr } = await sb.from('programmes_fmpa')
      .select('*, sequences_fmpa(*)').eq('formation_id', formationChoisie.id).eq('annee', annee).maybeSingle();
    if (progErr) return toast(progErr.message, false);
    programme = progData;
  }
  const sequencesProgramme = programme ? [...(programme.sequences_fmpa || [])].sort((a, b) => a.ordre - b.ordre) : [];

  if (programme && sequencesProgramme.length) {
    const idsSessionsFormation = sessionsFMPA.filter(s => s.formation_id === formationChoisie.id).map(s => s.id);
    let seqParSession = {};
    if (idsSessionsFormation.length) {
      const { data: liens, error: e3 } = await sb.from('session_sequences_fmpa')
        .select('session_id, sequence_fmpa_id').in('session_id', idsSessionsFormation);
      if (e3) return toast(e3.message, false);
      for (const l of (liens || [])) (seqParSession[l.session_id] = seqParSession[l.session_id] || new Set()).add(l.sequence_fmpa_id);
    }
    const stagiairesFormation = stagiaires.filter(s => idsSessionsFormation.includes(s.session_id));
    const seqParMatricule = {}, seqParNom = {};
    for (const s of stagiairesFormation) {
      const seqs = seqParSession[s.session_id];
      if (!seqs) continue;
      if (s.matricule) {
        const k = norm(s.matricule);
        seqParMatricule[k] = seqParMatricule[k] || new Set();
        seqs.forEach(id => seqParMatricule[k].add(id));
      }
      const k2 = norm(s.nom + s.prenom);
      seqParNom[k2] = seqParNom[k2] || new Set();
      seqs.forEach(id => seqParNom[k2].add(id));
    }
    const idsRequis = sequencesProgramme.map(s => s.id);
    for (const a of agents) {
      const set = (a.matricule && seqParMatricule[norm(a.matricule)]) || seqParNom[norm(a.nom + a.prenom)] || new Set();
      a._seqFaites = idsRequis.filter(id => set.has(id)).length;
      a._seqTotal = idsRequis.length;
      a._fait = a._seqFaites >= a._seqTotal;
    }
  } else {
    // Pas de programme défini pour cette formation/année : suivi simple historique (présence sur
    // au moins une session de formation continue cette année-là, tous domaines confondus).
    const matriculesFaits = new Set(stagiaires.filter(s => s.matricule).map(s => norm(s.matricule)));
    const nomsFaits = new Set(stagiaires.map(s => norm(s.nom + s.prenom)));
    for (const a of agents) {
      a._fait = (a.matricule && matriculesFaits.has(norm(a.matricule))) || nomsFaits.has(norm(a.nom + a.prenom));
      a._seqFaites = null; a._seqTotal = null;
    }
  }

  const sessionsAffichees = formationChoisie ? sessionsFMPA.filter(s => s.formation_id === formationChoisie.id) : sessionsFMPA;
  const parCIS = {};
  for (const a of agents) (parCIS[a.cis || '— sans CIS —'] = parCIS[a.cis || '— sans CIS —'] || { agents: [], sessions: [] }).agents.push(a);
  for (const s of sessionsAffichees) { const c = s.lieu || '— sans lieu —'; (parCIS[c] = parCIS[c] || { agents: [], sessions: [] }).sessions.push(s); }

  let cisAffiches = Object.keys(parCIS).sort();
  if (cisChefCentre) cisAffiches = cisAffiches.filter(c => c === cisChefCentre);

  // Table de correspondance idSafe → nom réel du CIS : certains CIS contiennent une apostrophe
  // (« CIS DE L'AVEN », « CIS PONT-L'ABBE ») qui casserait un onclick="...('nom')" même échappé en
  // HTML (l'entité &#39; est redécodée par le navigateur avant l'exécution du JS). On passe donc
  // toujours l'identifiant sûr dans le HTML et on ne retrouve le nom réel qu'au moment du clic.
  window._fmpaCISParId = window._fmpaCISParId || {};
  const lignes = cisAffiches.map(c => {
    const g = parCIS[c];
    const total = g.agents.length;
    const fait = g.agents.filter(a => a._fait).length;
    const pct = total ? Math.round(fait / total * 100) : 0;
    const commencee = g.sessions.length > 0;
    const idSafe = _idSafeCIS(c);
    window._fmpaCISParId[idSafe] = c;
    return `<tr>
        <td><b>${esc(c)}</b></td>
        <td>${commencee ? '<span class="statut-valide">✔ Commencée</span>' : '<span class="statut-na">— Pas commencée</span>'}<br><span class="info">${g.sessions.length} session(s) en ${annee}</span></td>
        <td>${total ? `<b>${fait}/${total}</b> (${pct}%)` : '<span class="info">Aucun effectif renseigné pour ce CIS</span>'}
          ${total ? `<div class="jauge"><div style="width:${pct}%;background:${pct === 100 ? 'var(--ok)' : 'var(--warn)'}"></div></div>` : ''}</td>
        <td style="white-space:nowrap">
          ${total ? `<button class="btn petit secondaire" onclick="_toggleDetailFMPA('${idSafe}')">👁️ Détail</button>` : ''}
          <button class="btn petit secondaire" ${commencee ? '' : 'disabled'} onclick="_telechargerPVFMPAParId('${idSafe}', ${annee})">📄 PV du CIS</button>
        </td>
      </tr>
      <tr id="fmpa-detail-${idSafe}" style="display:none"><td colspan="4">${_detailAgentsFMPA(g.agents)}</td></tr>`;
  }).join('');

  $('staff-dashboard').innerHTML = `<div class="carte">
    <h2>Suivi FMPA par centre de secours</h2>
    <div class="ligne">
      <div><label>Formation</label><select id="fmpa-formation" onchange="window._fmpaFormationId = Number(this.value) || null; _rendreSuiviFMPA()">
        ${formationsContinues.length ? formationsContinues.map(f => `<option value="${f.id}" ${f.id === window._fmpaFormationId ? 'selected' : ''}>${esc(f.libelle)}</option>`).join('') : '<option value="">Aucune formation continue</option>'}
      </select></div>
      <div><label>Année</label><input type="number" id="fmpa-annee" value="${annee}" style="width:100px" onchange="window._fmpaAnnee = Number(this.value) || ${new Date().getFullYear()}; _rendreSuiviFMPA()"></div>
      ${cisChefCentre ? '' : `<div style="align-self:flex-end"><button class="btn secondaire" onclick="exporterPVFMPAMasse(${annee})">🗂️ Export de masse (tous les CIS, ${annee})</button></div>`}
    </div>
    <div class="info">${programme && sequencesProgramme.length
      ? `Suivi cumulatif du programme FMPA ${annee} de « ${esc(formationChoisie.libelle)} » (${sequencesProgramme.length} séquence(s) : ${esc(sequencesProgramme.map(s => s.libelle).join(', '))}). Un agent est compté « à jour » s'il a été présent, cumulativement sur une ou plusieurs sessions (formateurs différents possibles), sur toutes les séquences du programme.`
      : `Aucun programme FMPA défini pour ${formationChoisie ? esc(formationChoisie.libelle) : 'cette formation'} en ${annee} — suivi simple (présence sur au moins une session de formation continue cette année-là, tous domaines confondus). Crée le programme depuis Paramètres formations > 🗓️ Séquences FMPA pour un suivi séquence par séquence. L'effectif de référence vient de l'écran « Effectifs CIS ».`}</div>
    <div class="table-scroll"><table>
      <tr><th>CIS</th><th>FMPA</th><th>Effectif à jour</th><th></th></tr>
      ${lignes || `<tr><td colspan="4"><span class="info">Aucun CIS à afficher — renseigne d'abord l'effectif dans « Effectifs CIS ».</span></td></tr>`}
    </table></div>
  </div>`;
}

function _detailAgentsFMPA(agents) {
  const tri = [...agents].sort((a, b) => (a._fait === b._fait ? 0 : a._fait ? 1 : -1) || (a.nom || '').localeCompare(b.nom || ''));
  const avecSeq = agents.some(a => a._seqTotal);
  return `<div class="table-scroll"><table>
    <tr><th>Nom</th><th>Prénom</th><th>Matricule</th><th>FMPA</th></tr>
    ${tri.map(a => `<tr>
      <td>${esc(a.nom)}</td><td>${esc(a.prenom)}</td><td>${esc(a.matricule || '—')}</td>
      <td>${a._fait ? '<span class="statut-valide">✔ Fait</span>' : '<span class="statut-na">✗ Pas fait</span>'}${avecSeq && a._seqTotal ? ` <span class="info">(${a._seqFaites}/${a._seqTotal} séquence(s))</span>` : ''}</td>
    </tr>`).join('')}
  </table></div>`;
}

function _toggleDetailFMPA(idSafe) {
  const tr = $('fmpa-detail-' + idSafe);
  if (tr) tr.style.display = tr.style.display === 'none' ? '' : 'none';
}

// Passe par la table de correspondance idSafe → nom réel du CIS (voir _rendreSuiviFMPA) avant
// d'appeler telechargerPVFMPACIS (définie dans pdf.js), pour éviter tout souci d'échappement avec
// les CIS contenant une apostrophe.
function _telechargerPVFMPAParId(idSafe, annee) {
  const cis = (window._fmpaCISParId || {})[idSafe];
  if (!cis) return toast('CIS introuvable', false);
  telechargerPVFMPACIS(cis, annee);
}
