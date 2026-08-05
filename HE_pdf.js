/* =====================================================================
   HE_pdf.js — documents générés

   1. Titre d'habilitation (modèle Annexe E de la NF C18-510)
   2. Avis défavorable motivé
   3. Procès-verbal de session

   Note technique : la police par défaut de jsPDF ne rend pas les glyphes
   ☐ / ☑. Les cases à cocher sont donc dessinées (rectangle + croix).
   ===================================================================== */

const { jsPDF } = window.jspdf;

// Numéro de version du générateur de PDF, affiché en tout petit en bas de
// chaque page du titre/avis — sert uniquement à vérifier visuellement,
// après un déploiement, que le navigateur a bien chargé le dernier
// HE_pdf.js (et non une version mise en cache). À incrémenter à chaque
// modification notable de ce fichier ; aucun effet fonctionnel.
const PDF_VERSION = 'v8-2026-08-05';

function piedDeVersion(doc, largeur, hauteurPage, marge) {
  doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(180, 180, 180);
  doc.text(PDF_VERSION, largeur - marge, hauteurPage - 4, { align: 'right' });
}

// Charte graphique Univers BFS (commune à toutes les applis) : jaune #f3ab12,
// rouge #b2181a, gris #464645, noir #080808. Police Montserrat côté web ;
// jsPDF ne l'embarque pas nativement (police non fournie/licenciée pour PDF),
// Helvetica reste donc la police du document — seule la palette de couleurs
// est reprise ici.
const BFS = {
  jaune: [243, 171, 18],
  rouge: [178, 24, 26],
  gris: [70, 70, 69],
  noir: [8, 8, 8],
  grisClair: [244, 244, 243],
};

function caseACocher(doc, x, y, cochee, taille = 3.2) {
  doc.setLineWidth(0.25);
  doc.rect(x, y, taille, taille);
  if (cochee) {
    doc.setLineWidth(0.5);
    doc.line(x + 0.6, y + 0.6, x + taille - 0.6, y + taille - 0.6);
    doc.line(x + taille - 0.6, y + 0.6, x + 0.6, y + taille - 0.6);
    doc.setLineWidth(0.25);
  }
}

/* ------------------- 1. Avis d'habilitation + titre (une page) -----
 * Modèle fourni par Jeremy (ressource/model avis d'habilitation + titre.pdf,
 * 2026-08) : un seul document A4 portrait, imprimé recto verso, avec :
 *   - en haut, l'AVIS D'HABILITATION : bloc formateur (note/appréciation,
 *     habilitation recommandée, restrictions, observations, signature),
 *     bloc organisme, puis le tableau Personnel × Symbole × Champ
 *     d'application (Annexe C de la NF C18-510) ;
 *   - en bas de la (dernière) page, séparée par une ligne de coupe, la
 *     carte compacte TITRE (titulaire/employeur/avis légal/validité) —
 *     positionnée en bas exprès pour être découpée aux ciseaux après
 *     impression, sans toucher au reste du document qui sert de dossier
 *     employeur. */
async function genererTitrePdf(stagiaireId) {
  let titre;
  try {
    const id = await rpc('generer_titre', { p_stagiaire_id: stagiaireId });
    const { data } = await sb.from('titres_habilitation').select('*').eq('id', id).single();
    titre = data;
  } catch (e) {
    // Pas de titre validé : on propose l'avis défavorable motivé
    if (String(e.message).includes('Aucun titre validé')) {
      return genererAvisDefavorable(stagiaireId);
    }
    return erreurSupabase('Génération du titre', e);
  }

  const { data: st } = await sb.from('stagiaires').select('*').eq('id', stagiaireId).single();
  const [{ data: session }, { data: ep }] = await Promise.all([
    sb.from('sessions_formation').select('*').eq('id', st.session_id).single(),
    sb.from('epreuves_theoriques').select('*').eq('stagiaire_id', stagiaireId).maybeSingle(),
  ]);
  const org = S.organisme || {};
  const c = titre.contenu || {};
  const lignes = c.lignes || {};
  const habilitationRecommandee = Object.values(lignes).flat().join(', ') || '—';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const largeur = 210, hauteurPage = 297, marge = 12, largeurUtile = largeur - 2 * marge;
  let y = marge;
  // Le document imprimé recto verso, une fois découpé à hauteur yCarte,
  // donne DEUX morceaux : le grand morceau du haut (dossier employeur —
  // avis en recto, rien en verso) et la bande du bas qui EST le titre à
  // remettre au titulaire (carte compacte en recto / grand tableau Annexe C
  // en verso). yCarte doit donc être calé sur le plus haut des deux
  // contenus de la bande du bas — le tableau Personnel × Symbole (~100 mm),
  // pas la petite carte (~50 mm) — sinon le tableau déborde en bas de page
  // 2. Voir PDF_VERSION v8 (2026-08-05) : avant cette version le tableau
  // était (à tort) sur la page 1 avec l'avis, et la carte seule sur la
  // page 2 — la bande découpée n'avait donc son verso correct que côté
  // carte, jamais côté tableau.
  const hauteurCarte = 122;
  const yCarte = hauteurPage - hauteurCarte;

  /* ================= AVIS D'HABILITATION ================= */
  doc.setTextColor(...BFS.noir).setFont('helvetica', 'bold').setFontSize(15);
  doc.text('AVIS D\'HABILITATION ÉLECTRIQUE', largeur / 2, y, { align: 'center' });
  y += 3;
  doc.setDrawColor(...BFS.jaune).setLineWidth(0.8).line(largeur / 2 - 22, y, largeur / 2 + 22, y);
  doc.setLineWidth(0.2);
  y += 5;

  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.text('NOM : ' + (st.nom || ''), marge, y);
  doc.text('Prénom : ' + (st.prenom || ''), marge + 70, y);
  y += 6;
  doc.text('Dates de la formation : ' + [dateFr(session?.date_debut), dateFr(session?.date_fin)]
    .filter(Boolean).join(' au '), marge, y);
  y += 7;

  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  doc.text('Résultats de l\'évaluation et avis d\'habilitation du formateur :', marge, y);
  y += 3;

  const resultatTheorique = ep && ep.score_total
    ? `${ep.score_brut}/${ep.score_total} (${Math.round((ep.taux || 0) * 100)} %)` : '—';
  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2, valign: 'top' },
    headStyles: { fillColor: BFS.jaune, textColor: BFS.noir, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 28 }, 2: { cellWidth: 40 }, 3: { cellWidth: 30 } },
    head: [['Formateur', 'Résultat théorique', 'Habilitation recommandée', 'Restrictions', 'Observations']],
    body: [
      [S.profil ? `${S.profil.nom || ''} ${S.profil.prenom || ''}`.trim() : '—',
        resultatTheorique, habilitationRecommandee, '', ''],
      [{ content: '', colSpan: 5, styles: { minCellHeight: 4 } }],
    ],
  });
  y = doc.lastAutoTable.finalY + 2;

  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    columnStyles: { 0: { cellWidth: largeurUtile * 0.55 }, 1: { cellWidth: largeurUtile * 0.45 } },
    body: [[`Date de l'avis : ${dateFr(new Date().toISOString())}`, 'Signature formateur :']],
  });
  y = doc.lastAutoTable.finalY + 5;

  doc.setFont('helvetica', 'normal').setFontSize(7.3).setTextColor(...BFS.gris);
  doc.text(
    'L\'avis d\'habilitation délivré par le formateur ne vaut ni certification, ni habilitation. Il '
    + 'constitue un élément sur lequel l\'employeur pourra fonder sa décision d\'habiliter le salarié, '
    + 'en complément de la connaissance par l\'employeur des compétences du salarié, de son '
    + 'environnement de travail et de ses activités, de son aptitude médicale.',
    marge, y, { maxWidth: largeurUtile, lineHeightFactor: 1.3 });
  y += 11;
  doc.setFont('helvetica', 'bold').setTextColor(...BFS.noir);
  doc.text('L\'habilitation est accordée par l\'employeur.', marge, y);
  y += 5;

  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    body: [
      [`ORGANISME DE FORMATION : ${org.raison_sociale || ''}`],
      [`RESPONSABLE : ${[org.signataire_nom, org.signataire_fonction].filter(Boolean).join(' — ')}`],
      [{ content: `Date : ……………………………          Signature et cachet de l'organisme :`, styles: { minCellHeight: 10 } }],
    ],
  });
  y = doc.lastAutoTable.finalY + 4;

  piedDeVersion(doc, largeur, hauteurPage, marge);

  // Repère de découpe sur la page 1 (recto) : la bande sous ce trait n'est
  // PAS un simple espace vide, c'est le recto du titre à remettre au
  // titulaire (la carte compacte ci-dessous). Le garde-fou évite juste que
  // le trait ne vienne se superposer au dossier employeur si celui-ci était
  // exceptionnellement long.
  if (y < yCarte - 3) {
    doc.setDrawColor(...BFS.gris).setLineDashPattern([2, 1.5], 0);
    doc.line(marge, yCarte, largeur - marge, yCarte);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(7).setTextColor(...BFS.gris).setFont('helvetica', 'italic');
    doc.text('✂ découper ici (même hauteur qu\'au verso)', largeur / 2, yCarte - 1.5, { align: 'center' });
  }

  /* ================= TITRE — RECTO (carte, bas de page 1) ================= */
  // La carte est le RECTO du titre remis au titulaire ; son VERSO (le grand
  // tableau Annexe C) est en bas de la page 2, à la MÊME hauteur yCarte —
  // c'est ce qui permet de découper une seule bande, imprimée recto verso,
  // qui porte la carte d'un côté et le tableau détaillé de l'autre.
  const yc = yCarte + 6;
  const colTitulaire = marge;
  const colEmployeur = marge + largeurUtile * 0.34;
  const colAvis = marge + largeurUtile * 0.66;
  const largeurColAvis = largeurUtile * 0.34;

  doc.setTextColor(...BFS.noir).setFont('helvetica', 'bold').setFontSize(11);
  doc.text('TITRE D\'HABILITATION ÉLECTRIQUE', largeur / 2, yc, { align: 'center' });
  doc.setDrawColor(...BFS.jaune).setLineWidth(0.6)
    .line(largeur / 2 - 16, yc + 1.4, largeur / 2 + 16, yc + 1.4);
  doc.setLineWidth(0.2);
  doc.setFontSize(7.5).setFont('helvetica', 'normal').setTextColor(...BFS.gris);
  doc.text('NF C18-510 — ' + (org.raison_sociale || ''), largeur / 2, yc + 5.5, { align: 'center' });
  doc.setTextColor(...BFS.noir);

  doc.setFont('helvetica', 'bold').setFontSize(8.5);
  doc.text('LE TITULAIRE', colTitulaire, yc + 11);
  doc.setFont('helvetica', 'normal').setFontSize(7.8);
  doc.text('Nom : ' + (st.nom || ''), colTitulaire, yc + 16);
  doc.text('Prénom : ' + (st.prenom || ''), colTitulaire, yc + 20);
  doc.text('Signature :', colTitulaire, yc + 24);
  if (st.signature_data) doc.addImage(st.signature_data, 'PNG', colTitulaire + 18, yc + 21, 28, 9);

  doc.setFont('helvetica', 'bold').setFontSize(8.5);
  doc.text('L\'EMPLOYEUR', colEmployeur, yc + 11);
  doc.setFont('helvetica', 'normal').setFontSize(7.8);
  doc.text('Société : ' + (org.raison_sociale || ''), colEmployeur, yc + 16);
  doc.text('Nom : ' + (org.signataire_nom || ''), colEmployeur, yc + 20);
  doc.text('Signature :', colEmployeur, yc + 24);
  if (org.signature_data) doc.addImage(org.signature_data, 'PNG', colEmployeur + 18, yc + 21, 28, 9);

  doc.setFont('helvetica', 'bold').setFontSize(8.5);
  doc.text('AVIS', colAvis, yc + 11);
  doc.setFont('helvetica', 'normal').setFontSize(6.2);
  doc.text(
    'Ce titre est établi et signé par l\'employeur puis remis à l\'intéressé qui doit également le '
    + 'signer. Strictement personnel, il ne peut être remis à un tiers.',
    colAvis, yc + 15, { maxWidth: largeurColAvis, lineHeightFactor: 1.2 });

  doc.setFontSize(7.5).setFont('helvetica', 'bold');
  doc.text('Délivré le ' + dateFr(titre.delivre_le), colTitulaire, yc + 34);
  doc.setFont('helvetica', 'normal');
  doc.text('Validité : ' + (org.validite_annees || 3) + ' ans — à recycler avant le '
    + dateFr(titre.recycler_avant), colTitulaire, yc + 38);

  piedDeVersion(doc, largeur, hauteurPage, marge);

  /* ================= TITRE — VERSO (page 2) : Annexe C ================= */
  // Toujours sur sa propre page, à la MÊME hauteur yCarte que le recto —
  // c'est le tableau Personnel × Symbole × Champ d'application, imprimé au
  // dos de la carte ci-dessus une fois la bande découpée.
  doc.addPage();

  doc.setDrawColor(...BFS.gris).setLineDashPattern([2, 1.5], 0);
  doc.line(marge, yCarte, largeur - marge, yCarte);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(7).setTextColor(...BFS.gris).setFont('helvetica', 'italic');
  doc.text('✂ découper ici — verso du titre (à remettre au titulaire)', largeur / 2, yCarte - 1.5, { align: 'center' });

  const domaines = (titre.domaines || []).join(', ') || '—';
  const installations = titre.ouvrages || '—';
  const indications = titre.indications || '—';
  const ligneAvis = lt => {
    const symboles = (lignes[lt.code] || []).join(', ');
    return [lt.libelle, symboles || '—',
      symboles ? domaines : '—', symboles ? installations : '—', symboles ? indications : '—'];
  };
  const nonElec = S.referentiel.lignesTitre.filter(lt => lt.section.includes('non électrique'));
  const elec = S.referentiel.lignesTitre.filter(lt => !lt.section.includes('non électrique'));
  const ligneSection = texte => [{
    content: texte, colSpan: 5,
    styles: { fillColor: BFS.grisClair, fontStyle: 'bold', halign: 'center', textColor: BFS.noir },
  }];

  doc.autoTable({
    startY: yCarte + 8, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5, valign: 'middle' },
    headStyles: { fillColor: BFS.jaune, textColor: BFS.noir, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 34 }, 1: { cellWidth: 30, fontStyle: 'bold' },
      2: { cellWidth: 26 }, 3: { cellWidth: 48 }, 4: { cellWidth: largeurUtile - 34 - 30 - 26 - 48 },
    },
    head: [['Personnel', 'Symbole d\'habilitation\net attribut', 'Domaine\nde tension',
      'Installations concernées', 'Indications supplémentaires']],
    body: [
      ligneSection('Opérations d\'ordre non électrique'),
      ...nonElec.map(ligneAvis),
      ligneSection('Opérations d\'ordre électrique'),
      ...elec.map(ligneAvis),
    ],
  });
  let yTableau = doc.lastAutoTable.finalY + 3;

  doc.setFontSize(6.3).setTextColor(...BFS.gris).setFont('helvetica', 'normal');
  doc.text('La rubrique « indications supplémentaires » doit être obligatoirement renseignée le cas '
    + 'échéant. Cette habilitation n\'autorise pas à elle seule son titulaire à effectuer de son '
    + 'propre chef les opérations pour lesquelles il est habilité.', marge, yTableau, { maxWidth: largeurUtile });

  piedDeVersion(doc, largeur, hauteurPage, marge);

  doc.save(`titre_habilitation_${st.nom}_${st.prenom}.pdf`.replace(/\s+/g, '_'));
  toast('Titre et avis d\'habilitation générés');
}

/* ------------------- 2. Avis défavorable ---------------------------- */
async function genererAvisDefavorable(stagiaireId) {
  const { data: st } = await sb.from('stagiaires').select('*').eq('id', stagiaireId).single();
  const { data: res } = await sb.from('resultats_symbole')
    .select('*').eq('stagiaire_id', stagiaireId).order('symbole_code');
  const { data: ep } = await sb.from('epreuves_theoriques')
    .select('*').eq('stagiaire_id', stagiaireId).maybeSingle();

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marge = 15;
  doc.setFont('helvetica', 'bold').setFontSize(15);
  doc.text('AVIS APRÈS FORMATION', 105, 22, { align: 'center' });
  doc.setFontSize(11).setFont('helvetica', 'normal');
  doc.text((S.organisme?.raison_sociale || ''), marge, 32);
  doc.setFont('helvetica', 'bold');
  doc.text(`${st.nom} ${st.prenom}`, marge, 44);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(`${st.fonction || ''} — ${st.affectation || ''}`, marge, 50);

  doc.autoTable({
    startY: 58, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [235, 238, 242], textColor: 20 },
    head: [['Titre visé', 'Théorie', 'Pratique', 'Avis', 'Motif']],
    body: (res || []).map(r => [
      libelleSymbole(r.symbole_code),
      r.theorie_ok ? 'Validée' : 'Non validée',
      r.pratique_ok ? 'Validée' : 'Non validée',
      r.avis === 'favorable' ? 'FAVORABLE' : 'DÉFAVORABLE',
      r.motif || '—',
    ]),
  });

  let y = doc.lastAutoTable.finalY + 8;
  if (ep) {
    doc.setFontSize(9);
    doc.text(`Épreuve théorique : ${ep.score_brut}/${ep.score_total} `
      + `(${Math.round((ep.taux || 0) * 100)} %) — questions fondamentales : `
      + `${ep.fondamentales_ok ? 'toutes justes' : 'au moins une ratée'}.`, marge, y);
    y += 6;
  }
  doc.setFontSize(8).setTextColor(90);
  doc.text('Évaluation réalisée conformément à l\'Annexe D.3 de la NF C18-510. '
    + 'Critère théorique : 100 % des questions fondamentales et 70 % de bonnes réponses. '
    + 'Critère pratique : aucune erreur grave (D) et une seule erreur majeure (C) au maximum '
    + 'par mise en situation.', marge, y, { maxWidth: 180 });

  doc.save(`avis_${st.nom}_${st.prenom}.pdf`.replace(/\s+/g, '_'));
  toast('Avis généré (aucun titre validé)', 'erreur');
}

/* ------------------- 3. Procès-verbal de session -------------------- */
async function genererPvSession() {
  const { data } = await sb.from('v_suivi_session').select('*').eq('session_id', S.session.id);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold').setFontSize(14);
  doc.text('PROCÈS-VERBAL D\'ÉVALUATION', 148, 18, { align: 'center' });
  doc.setFontSize(10).setFont('helvetica', 'normal');
  doc.text(`${S.session.intitule} — ${S.session.entreprise || ''} — ${dateFr(S.session.date_debut)}`,
    148, 25, { align: 'center' });

  doc.autoTable({
    startY: 32, margin: { left: 12, right: 12 }, theme: 'grid',
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [235, 238, 242], textColor: 20 },
    head: [['Nom', 'Prénom', 'Titres visés', 'Théorie', 'Fondamentales', 'Pratique', 'Résultat']],
    body: (data || []).map(s => [
      s.nom, s.prenom, (s.symboles || []).map(libelleSymbole).join(', '),
      s.score_total ? `${s.score_brut}/${s.score_total} (${Math.round(s.taux * 100)} %)` : '—',
      s.fondamentales_ok === null ? '—' : (s.fondamentales_ok ? 'OK' : 'échec'),
      `${s.nb_pratiques_ok}/${s.nb_pratiques}`,
      s.theorie_reussie && s.nb_pratiques && s.nb_pratiques_ok === s.nb_pratiques ? 'ADMIS' : 'NON ADMIS',
    ]),
  });
  doc.save(`pv_${S.session.intitule}.pdf`.replace(/\s+/g, '_'));
}
