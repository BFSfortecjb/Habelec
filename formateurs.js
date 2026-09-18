// © 2026 Admin Formation — Jérémy Bizeul — SARL Prévisecours. Tous droits réservés.
// formateurs.js — écran Formateurs : liste et fiche des comptes internes
// (nom, coordonnées, taux horaire, interne/externe), création de nouveaux
// comptes de connexion via l'Edge Function "creer-compte-formateur" (une clé
// service_role est nécessaire pour créer un compte, elle ne peut donc pas
// être appelée directement depuis le navigateur), et — sur la fiche d'un
// formateur existant — ses sessions et ses statistiques (heures dispensées,
// stagiaires formés, au total et par formation/famille de formation).

// Palette catégorielle (charte data-viz — ordre fixe, jamais cyclé), reprise
// telle quelle du tableau de bord Intervenants pour rester cohérent.
const FO_COULEURS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const FO_COULEUR_AUTRES = '#9aa5ab';

async function ecranFormateurs(vue) {
  vue.innerHTML = `
    <div class="carte" style="display:flex;justify-content:space-between;align-items:center;">
      <h2 style="margin:0;">Formateurs</h2>
      <button class="bouton" onclick="ouvrirFicheFormateur(null)">+ Nouveau formateur</button>
    </div>
    <div class="carte">
      <div id="formateurs-liste">Chargement…</div>
    </div>
    <div id="formateur-fiche"></div>`;

  const { data, error } = await supa.from('profils').select('*').order('nom');
  if (error) { DEBUG.erreur('ecranFormateurs', error); $('#formateurs-liste').textContent = 'Erreur de chargement.'; return; }
  rendreListeFormateurs(data || []);
}

function rendreListeFormateurs(liste) {
  const zone = $('#formateurs-liste');
  if (!liste.length) { zone.innerHTML = '<p style="color:#55636c;">Aucun formateur.</p>'; return; }
  zone.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tbody>${liste.map(p => `
      <tr style="border-top:1px solid #eee;cursor:pointer;${p.actif ? '' : 'opacity:.5;'}" onclick="ouvrirFicheFormateur('${p.id}')">
        <td style="padding:6px 8px;">${esc(p.prenom)} ${esc(p.nom)}</td>
        <td style="padding:6px 8px;color:#55636c;">${esc(p.email || '')}</td>
        <td style="padding:6px 8px;color:#55636c;">${{ admin: 'Admin', gestionnaire: 'Gestionnaire', formateur: 'Formateur', super_admin: 'Super admin' }[p.role] || p.role}</td>
        <td style="padding:6px 8px;color:#55636c;">${p.formateur_externe ? 'Externe' : 'Interne'}</td>
        <td style="padding:6px 8px;color:#55636c;">${p.taux_horaire != null ? p.taux_horaire + ' €/h' : ''}</td>
        <td style="padding:6px 8px;">${p.actif ? '' : '<span style="color:#b3261e;">inactif</span>'}</td>
      </tr>`).join('')}
    </tbody></table>`;
}

async function ouvrirFicheFormateur(id) {
  const zone = $('#formateur-fiche');
  zone.innerHTML = '<div class="carte">Chargement…</div>';
  zone.scrollIntoView({ behavior: 'smooth' });

  let formateur = null;
  if (id) {
    const { data } = await supa.from('profils').select('*').eq('id', id).single();
    formateur = data;
  }

  zone.innerHTML = `
    <div class="carte" style="max-width:560px;">
      <h3 style="margin-top:0;">${formateur ? 'Modifier' : 'Nouveau'} formateur</h3>
      ${!formateur ? `<p style="font-size:12px;color:#55636c;margin-top:-6px;">Crée un nouveau compte de connexion. Un mot de passe provisoire est généré — le formateur devra utiliser "Mot de passe oublié" à sa première connexion pour en choisir un.</p>` : ''}
      <div style="display:flex;gap:10px;">
        <div style="flex:1;"><label for="fo-prenom">Prénom</label><input id="fo-prenom" value="${formateur ? esc(formateur.prenom) : ''}"></div>
        <div style="flex:1;"><label for="fo-nom">Nom</label><input id="fo-nom" value="${formateur ? esc(formateur.nom) : ''}"></div>
      </div>
      <label for="fo-email">Email</label>
      <input id="fo-email" type="email" value="${formateur ? esc(formateur.email) : ''}" ${formateur ? 'disabled' : ''}>
      ${formateur ? '<p style="font-size:11px;color:#55636c;margin:2px 0 0;">L\'email de connexion ne peut pas être modifié ici (voir Supabase → Authentication).</p>' : ''}
      <label for="fo-telephone">Téléphone</label>
      <input id="fo-telephone" value="${formateur ? esc(formateur.telephone) : ''}">
      <div style="display:flex;gap:10px;">
        <div style="flex:1;">
          <label for="fo-role">Rôle</label>
          <select id="fo-role">
            <option value="formateur" ${!formateur || formateur.role === 'formateur' ? 'selected' : ''}>Formateur</option>
            <option value="gestionnaire" ${formateur?.role === 'gestionnaire' ? 'selected' : ''}>Gestionnaire</option>
            <option value="admin" ${formateur?.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
        <div style="flex:1;"><label for="fo-taux">Taux horaire (€/h)</label><input id="fo-taux" type="number" step="0.01" value="${formateur?.taux_horaire ?? ''}"></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:10px;">
        <input type="checkbox" id="fo-externe" style="width:auto;" ${formateur?.formateur_externe ? 'checked' : ''}>
        <span>Formateur externe (sous-traitant, hors effectif de l'organisme — cadre E du BPF)</span>
      </label>
      ${formateur ? `
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <input type="checkbox" id="fo-actif" style="width:auto;" ${formateur.actif ? 'checked' : ''}>
        <span>Compte actif</span>
      </label>` : ''}
      <div style="margin-top:14px;">
        <button class="bouton" id="fo-valider">${formateur ? 'Enregistrer' : 'Créer le compte'}</button>
        <button class="bouton" style="background:#eee;color:#333;margin-left:8px;" onclick="$('#formateur-fiche').innerHTML=''">Fermer</button>
      </div>
      <div class="erreur" id="fo-erreur"></div>
      <div id="fo-resultat"></div>
    </div>
    <div id="fo-stats"></div>`;

  if (formateur) chargerStatsFormateur(formateur.id);

  $('#fo-valider').onclick = async () => {
    const payload = {
      nom: $('#fo-nom').value.trim(),
      prenom: $('#fo-prenom').value.trim(),
      telephone: $('#fo-telephone').value.trim() || null,
      role: $('#fo-role').value,
      taux_horaire: $('#fo-taux').value ? Number($('#fo-taux').value) : null,
      formateur_externe: $('#fo-externe').checked,
    };
    if (!payload.nom || !payload.prenom) { $('#fo-erreur').textContent = 'Nom et prénom obligatoires.'; return; }

    const bouton = $('#fo-valider');
    bouton.disabled = true;
    $('#fo-erreur').textContent = '';

    if (formateur) {
      payload.actif = $('#fo-actif').checked;
      const { error } = await supa.from('profils').update(payload).eq('id', formateur.id);
      bouton.disabled = false;
      if (error) { DEBUG.erreur('enregistrerFormateur', error); $('#fo-erreur').textContent = 'Erreur : ' + error.message; return; }
      toast('Formateur enregistré.');
      ecranFormateurs($('#vue'));
      return;
    }

    const email = $('#fo-email').value.trim();
    if (!email) { bouton.disabled = false; $('#fo-erreur').textContent = 'Email obligatoire.'; return; }

    try {
      const { data: { session } } = await supa.auth.getSession();
      const reponse = await fetch(`${SUPABASE_URL}/functions/v1/creer-compte-formateur`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ...payload, email }),
      });
      const resultat = await reponse.json();
      bouton.disabled = false;
      if (!reponse.ok || resultat.error) throw new Error(resultat.error || 'Erreur inconnue.');

      $('#fo-resultat').innerHTML = `
        <div class="carte" style="background:#eef6fb;border-color:#0a5c8a;margin-top:10px;">
          <p style="margin:0;font-size:13px;">Compte créé. Mot de passe provisoire : <strong>${esc(resultat.mot_de_passe_provisoire)}</strong></p>
          <p style="margin:6px 0 0;font-size:12px;color:#55636c;">Transmets-le au formateur, ou dis-lui d'utiliser "Mot de passe oublié" à la connexion pour en choisir un lui-même.</p>
        </div>`;
      toast('Compte formateur créé.');
      ecranFormateurs($('#vue'));
    } catch (e) {
      bouton.disabled = false;
      DEBUG.erreur('creerCompteFormateur', e);
      $('#fo-erreur').textContent = 'Erreur : ' + e.message;
    }
  };
}

// ============================================================================
// SESSIONS ET STATISTIQUES D'UN FORMATEUR — heures dispensées et stagiaires
// formés, au total et par formation / famille de formation (categorie du
// catalogue). Les sessions annulées sont exclues (comme sur les autres
// tableaux de bord).
// ============================================================================

async function chargerStatsFormateur(formateurId) {
  const zone = $('#fo-stats');
  zone.innerHTML = '<div class="carte">Chargement des sessions…</div>';

  const { data, error } = await supa
    .from('sessions_formation')
    .select('id, numero_session, date_debut, lieu, statut, formations_catalogue(denomination, categorie, duree_heures), session_participants(count)')
    .eq('formateur_id', formateurId)
    .neq('statut', 'annulee')
    .order('date_debut', { ascending: false });

  if (error) { DEBUG.erreur('chargerStatsFormateur', error); zone.innerHTML = '<div class="carte">Erreur de chargement des sessions.</div>'; return; }

  const sessions = (data || []).map(s => ({
    ...s,
    nbStagiaires: s.session_participants?.[0]?.count || 0,
    heures: Number(s.formations_catalogue?.duree_heures) || 0,
  }));

  const totalSessions = sessions.length;
  const totalHeures = sessions.reduce((a, s) => a + s.heures, 0);
  const totalStagiaires = sessions.reduce((a, s) => a + s.nbStagiaires, 0);

  const regrouper = cle => {
    const table = {};
    sessions.forEach(s => {
      const label = s.formations_catalogue?.[cle] || (cle === 'categorie' ? 'Non catégorisé' : 'Formation inconnue');
      if (!table[label]) table[label] = { label, sessions: 0, heures: 0, stagiaires: 0 };
      table[label].sessions += 1;
      table[label].heures += s.heures;
      table[label].stagiaires += s.nbStagiaires;
    });
    return Object.values(table).sort((a, b) => b.heures - a.heures);
  };

  const parFormation = regrouper('denomination');
  const parFamille = regrouper('categorie');

  const enBarres = (liste, unite) => {
    const TOP_N = 6;
    const items = liste.slice(0, TOP_N).map((l, i) => ({ label: l.label, valeur: l[unite], couleur: FO_COULEURS[i] }));
    if (liste.length > TOP_N) {
      const reste = liste.slice(TOP_N).reduce((a, l) => a + l[unite], 0);
      items.push({ label: `Autres (${liste.length - TOP_N})`, valeur: reste, couleur: FO_COULEUR_AUTRES });
    }
    return items;
  };

  // --- Nombre de sessions par année, et par année / par famille de
  // formation. Les familles gardent la même couleur que la répartition
  // ci-dessus (mêmes TOP_N + "Autres"), pour rester lisible d'un bloc à
  // l'autre de la fiche.
  const TOP_N_FAMILLES = 6;
  const famillesTop = parFamille.slice(0, TOP_N_FAMILLES).map(f => f.label);
  const familleAutres = parFamille.length > TOP_N_FAMILLES;
  const legendeFamilles = famillesTop.map((label, i) => ({ label, couleur: FO_COULEURS[i] }));
  if (familleAutres) legendeFamilles.push({ label: `Autres (${parFamille.length - TOP_N_FAMILLES})`, couleur: FO_COULEUR_AUTRES });
  const couleurFamille = cat => {
    const i = famillesTop.indexOf(cat);
    return i !== -1 ? FO_COULEURS[i] : FO_COULEUR_AUTRES;
  };

  const annees = [...new Set(sessions.map(s => s.date_debut.slice(0, 4)))].sort();
  const parAnnee = {};
  const parAnneeFamille = {};
  const parAnneeFormation = {};
  annees.forEach(a => { parAnnee[a] = 0; parAnneeFamille[a] = {}; parAnneeFormation[a] = {}; });
  sessions.forEach(s => {
    const annee = s.date_debut.slice(0, 4);
    parAnnee[annee] += 1;
    const catBrute = s.formations_catalogue?.categorie || 'Non catégorisé';
    const cat = famillesTop.includes(catBrute) ? catBrute : 'Autres';
    parAnneeFamille[annee][cat] = (parAnneeFamille[annee][cat] || 0) + 1;
    const formation = s.formations_catalogue?.denomination || 'Formation inconnue';
    parAnneeFormation[annee][formation] = (parAnneeFormation[annee][formation] || 0) + 1;
  });
  const sessionsParAnnee = annees.map(a => ({ label: a, valeur: parAnnee[a], couleur: FO_COULEURS[0] }));

  if (!totalSessions) {
    zone.innerHTML = '<div class="carte"><h3 style="margin-top:0;">Sessions</h3><p style="color:#55636c;font-size:13px;">Aucune session assignée à ce formateur.</p></div>';
    return;
  }

  zone.innerHTML = `
    <div class="carte">
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        ${foStatTuile('Sessions', totalSessions)}
        ${foStatTuile('Heures dispensées', totalHeures)}
        ${foStatTuile('Stagiaires formés', totalStagiaires)}
      </div>
    </div>
    <div class="carte">
      <h3 style="margin-top:0;">Heures dispensées par formation</h3>
      ${foBarresHorizontales(enBarres(parFormation, 'heures'), 'h')}
    </div>
    <div class="carte">
      <h3 style="margin-top:0;">Heures dispensées par famille de formation</h3>
      ${foBarresHorizontales(enBarres(parFamille, 'heures'), 'h')}
    </div>
    <div class="carte">
      <h3 style="margin-top:0;">Stagiaires formés par famille de formation</h3>
      ${foBarresHorizontales(enBarres(parFamille, 'stagiaires'), '')}
    </div>
    <div class="carte">
      <h3 style="margin-top:0;">Nombre de sessions par année</h3>
      ${foBarresVerticales(sessionsParAnnee)}
    </div>
    <div class="carte">
      <h3 style="margin-top:0;">Nombre de sessions par année et par famille de formation</h3>
      ${foBarresVerticalesEmpilees(annees, parAnneeFamille, legendeFamilles)}
    </div>
    <div class="carte">
      <h3 style="margin-top:0;">Nombre de sessions par année et par formation</h3>
      ${foTableauAnneeFormation(annees, parAnneeFormation)}
    </div>
    <div class="carte">
      <h3 style="margin-top:0;">Sessions (${totalSessions})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tbody>${sessions.map(s => `
          <tr style="border-top:1px solid #eee;cursor:pointer;" onclick="ouvrirSession('${s.id}')">
            <td style="padding:6px 8px;color:#55636c;white-space:nowrap;">${s.date_debut ? new Date(s.date_debut).toLocaleDateString('fr-FR') : ''}</td>
            <td style="padding:6px 8px;">${esc(s.formations_catalogue?.denomination || '')}</td>
            <td style="padding:6px 8px;color:#55636c;">${esc(s.formations_catalogue?.categorie || '')}</td>
            <td style="padding:6px 8px;color:#55636c;">${esc(s.lieu || '')}</td>
            <td style="padding:6px 8px;color:#55636c;text-align:right;">${s.heures ? s.heures + ' h' : ''}</td>
            <td style="padding:6px 8px;color:#55636c;text-align:right;">${s.nbStagiaires} stag.</td>
            <td style="padding:6px 8px;color:#55636c;">${{ planifiee: 'Planifiée', en_cours: 'En cours', terminee: 'Terminée' }[s.statut] || s.statut}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// Un bloc par année (année + total en en-tête), une ligne par formation en
// dessous (libellé à gauche, nombre de sessions à droite, triées
// décroissant) — un mur de texte séparé par des virgules devenait illisible
// dès qu'une année comptait beaucoup de formations différentes.
function foTableauAnneeFormation(annees, parAnneeFormation) {
  const anneesAvecDonnees = annees.filter(a => Object.keys(parAnneeFormation[a] || {}).length).sort((a, b) => b.localeCompare(a));
  if (!anneesAvecDonnees.length) return '<p style="color:#55636c;font-size:13px;">Aucune donnée.</p>';
  return `<div style="display:flex;flex-direction:column;gap:18px;">
    ${anneesAvecDonnees.map(annee => {
      const total = Object.values(parAnneeFormation[annee]).reduce((a, b) => a + b, 0);
      const lignes = Object.entries(parAnneeFormation[annee]).sort((a, b) => b[1] - a[1]);
      return `<div>
        <div style="font-size:14px;font-weight:600;color:#1c2b36;margin-bottom:6px;">${esc(annee)} <span style="font-weight:400;color:#55636c;">— ${total} session${total > 1 ? 's' : ''}</span></div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tbody>${lignes.map(([formation, n]) => `
            <tr style="border-top:1px solid #eee;">
              <td style="padding:5px 8px;color:#1c2b36;">${esc(formation)}</td>
              <td style="padding:5px 8px;text-align:right;color:#55636c;font-variant-numeric:tabular-nums;white-space:nowrap;">${n} session${n > 1 ? 's' : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    }).join('')}
  </div>`;
}

function foStatTuile(libelle, valeur) {
  return `<div>
    <div style="font-size:12px;color:#55636c;">${esc(libelle)}</div>
    <div style="font-size:28px;font-weight:600;color:#1c2b36;">${esc(String(valeur))}</div>
  </div>`;
}

// Barres horizontales : label à gauche, barre colorée (<=24px de haut, bout
// arrondi), valeur au bout. Légende omise volontairement (chaque barre porte
// déjà son libellé — l'identité n'a pas besoin de la couleur seule).
function foBarresHorizontales(items, unite) {
  const donnees = items.filter(i => i.valeur > 0);
  if (donnees.length === 0) return '<p style="color:#55636c;font-size:13px;">Aucune donnée.</p>';
  const max = Math.max(...donnees.map(i => i.valeur));
  return `<div style="display:flex;flex-direction:column;gap:10px;">
    ${donnees.map(i => `
      <div style="display:flex;align-items:center;gap:10px;" title="${esc(i.label)} : ${esc(String(i.valeur))}${unite === 'h' ? ' h' : ''}">
        <div style="flex:0 0 200px;font-size:13px;color:#1c2b36;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(i.label)}</div>
        <div style="flex:1;background:#f4f6f8;border-radius:4px;height:20px;overflow:hidden;">
          <div style="height:100%;width:${Math.max((i.valeur / max) * 100, 3)}%;background:${i.couleur};border-radius:4px;"></div>
        </div>
        <div style="flex:0 0 70px;text-align:right;font-size:13px;font-variant-numeric:tabular-nums;color:#55636c;">${esc(String(i.valeur))}${unite === 'h' ? ' h' : ''}</div>
      </div>`).join('')}
  </div>`;
}

// Barres verticales simples (une série, un bâton par année) : bout haut
// arrondi, valeur au-dessus, libellé (année) en-dessous.
function foBarresVerticales(items) {
  const donnees = items.filter(i => i.valeur > 0);
  if (!donnees.length) return '<p style="color:#55636c;font-size:13px;">Aucune donnée.</p>';
  const max = Math.max(1, ...donnees.map(i => i.valeur));
  return `<div style="display:flex;align-items:flex-end;gap:10px;height:180px;padding-top:20px;">
    ${donnees.map(i => `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
        <div style="font-size:11px;color:#55636c;margin-bottom:4px;">${i.valeur}</div>
        <div style="width:100%;max-width:28px;height:${Math.max((i.valeur / max) * 100, 3)}%;background:${i.couleur};border-radius:4px 4px 0 0;" title="${esc(i.label)} : ${i.valeur}"></div>
        <div style="font-size:11px;color:#55636c;margin-top:6px;">${esc(i.label)}</div>
      </div>`).join('')}
  </div>`;
}

// Barres verticales empilées (une série par famille de formation, un bâton
// par année) + légende (mandatoire dès 2 séries). parAnneeFamille[année] =
// { famille: n }.
function foBarresVerticalesEmpilees(annees, parAnneeFamille, legende) {
  const donnees = annees.filter(a => Object.keys(parAnneeFamille[a] || {}).length);
  if (!donnees.length) return '<p style="color:#55636c;font-size:13px;">Aucune donnée.</p>';
  const couleurDe = cat => (legende.find(l => l.label === cat || l.label.startsWith(cat + ' ('))?.couleur) || FO_COULEUR_AUTRES;
  const totauxParAnnee = donnees.map(a => Object.values(parAnneeFamille[a]).reduce((x, y) => x + y, 0));
  const max = Math.max(1, ...totauxParAnnee);

  const colonnes = donnees.map((annee, i) => {
    const repart = parAnneeFamille[annee];
    const entrees = Object.entries(repart).sort((a, b) => {
      const oa = legende.findIndex(l => l.label === a[0] || l.label.startsWith(a[0] + ' ('));
      const ob = legende.findIndex(l => l.label === b[0] || l.label.startsWith(b[0] + ' ('));
      return oa - ob;
    });
    const total = totauxParAnnee[i];
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
      <div style="font-size:11px;color:#55636c;margin-bottom:4px;">${total}</div>
      <div style="width:100%;max-width:28px;height:${Math.max((total / max) * 100, 3)}%;display:flex;flex-direction:column-reverse;border-radius:4px 4px 0 0;overflow:hidden;">
        ${entrees.map(([cat, n]) => `<div style="width:100%;height:${total ? (n / total) * 100 : 0}%;background:${couleurDe(cat)};" title="${esc(cat)} : ${n}"></div>`).join('')}
      </div>
      <div style="font-size:11px;color:#55636c;margin-top:6px;">${esc(annee)}</div>
    </div>`;
  }).join('');

  return `<div style="display:flex;align-items:flex-end;gap:10px;height:180px;padding-top:20px;margin-bottom:14px;">${colonnes}</div>
    <div style="display:flex;flex-wrap:wrap;gap:12px 18px;">
      ${legende.map(l => `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#1c2b36;">
        <span style="width:12px;height:12px;border-radius:3px;background:${l.couleur};display:inline-block;"></span>${esc(l.label)}
      </div>`).join('')}
    </div>`;
}
