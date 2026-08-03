/* =====================================================================
   HE_pdf.js — documents générés

   1. Titre d'habilitation (modèle Annexe E de la NF C18-510)
   2. Avis défavorable motivé
   3. Procès-verbal de session

   Note technique : la police par défaut de jsPDF ne rend pas les glyphes
   ☐ / ☑. Les cases à cocher sont donc dessinées (rectangle + croix).
   ===================================================================== */

const { jsPDF } = window.jspdf;

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

/* ------------------- 1. Titre d'habilitation ----------------------- */
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
  const org = S.organisme || {};
  const c = titre.contenu || {};
  const lignes = c.lignes || {};

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const L = 297, marge = 12;
  let y = marge;

  // En-tête
  doc.setFont('helvetica', 'bold').setFontSize(16);
  doc.text('TITRE D\'HABILITATION ÉLECTRIQUE', L / 2, y + 6, { align: 'center' });
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text('Conforme à la norme NF C18-510', L / 2, y + 11, { align: 'center' });
  doc.setFontSize(10).setFont('helvetica', 'bold');
  doc.text(org.raison_sociale || '', marge, y + 6);
  doc.setFont('helvetica', 'normal').setFontSize(8);
  doc.text('N° ' + titre.numero, L - marge, y + 6, { align: 'right' });
  y += 16;

  // Identité
  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [235, 238, 242], textColor: 20, fontStyle: 'bold' },
    head: [['Nom', 'Prénom', 'Fonction', 'Affectation']],
    body: [[st.nom || '', st.prenom || '', st.fonction || '', st.affectation || '']],
  });
  y = doc.lastAutoTable.finalY + 4;

  // Symboles par ligne de rôle (Annexe E)
  const corps = S.referentiel.lignesTitre.map(lt => [
    lt.section, lt.libelle, (lignes[lt.code] || []).join(', ') || '—',
  ]);
  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [235, 238, 242], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 68 }, 1: { cellWidth: 55 }, 2: { fontStyle: 'bold' } },
    head: [['Nature des opérations', 'Personnel', 'Symboles d\'habilitation']],
    body: corps,
  });
  y = doc.lastAutoTable.finalY + 4;

  // Champ d'application
  doc.setFont('helvetica', 'bold').setFontSize(10);
  doc.text('Champ d\'application', marge, y + 4);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  y += 8;
  doc.text('Domaines de tension :', marge, y + 3);
  let x = marge + 42;
  ['TBT', 'BT', 'HTA', 'HTB'].forEach(d => {
    caseACocher(doc, x, y, (titre.domaines || []).includes(d));
    doc.text(d, x + 4.6, y + 3);
    x += 22;
  });
  y += 8;
  doc.text('Ouvrages ou installations concernés : ' + (titre.ouvrages || '…'), marge, y + 3);
  y += 6;
  doc.text('Indications supplémentaires : ' + (titre.indications || '…'), marge, y + 3);
  y += 6;
  doc.setFontSize(7.5).setTextColor(90);
  doc.text('TBT ≤ 50 V alternatif / 120 V continu · BT ≤ 1 000 V alternatif / 1 500 V continu · '
    + 'HTA ≤ 50 kV alternatif / 75 kV continu · HTB au-delà.', marge, y + 3);
  doc.setTextColor(0).setFontSize(9);
  y += 9;

  // Dates
  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    body: [[
      'Délivré le : ' + dateFr(titre.delivre_le),
      'À recycler avant le : ' + dateFr(titre.recycler_avant),
      'Validité : ' + (org.validite_annees || 3) + ' ans',
    ]],
  });
  y = doc.lastAutoTable.finalY + 6;

  // Signatures
  const largeurSig = (L - 2 * marge - 10) / 2;
  doc.setFont('helvetica', 'bold').setFontSize(9);
  doc.text('Signature du salarié', marge + 2, y + 4);
  doc.text('Signature de l\'employeur', marge + largeurSig + 12, y + 4);
  doc.setFont('helvetica', 'normal').setFontSize(8);
  if (org.signataire_nom) {
    doc.text(org.signataire_nom + (org.signataire_fonction ? ' — ' + org.signataire_fonction : ''),
      marge + largeurSig + 12, y + 8);
  }
  doc.rect(marge, y + 10, largeurSig, 26);
  doc.rect(marge + largeurSig + 10, y + 10, largeurSig, 26);
  if (st.signature_data) doc.addImage(st.signature_data, 'PNG', marge + 4, y + 12, 50, 16);
  if (org.signature_data) doc.addImage(org.signature_data, 'PNG', marge + largeurSig + 14, y + 12, 50, 16);
  y += 39;

  doc.setFontSize(7).setTextColor(90);
  doc.text('Le présent titre d\'habilitation est établi et signé par l\'employeur puis remis à '
    + 'l\'intéressé qui doit également le signer. Ce titre est strictement personnel et ne peut '
    + 'être utilisé par un tiers.', marge, y, { maxWidth: L - 2 * marge });

  doc.save(`titre_habilitation_${st.nom}_${st.prenom}.pdf`.replace(/\s+/g, '_'));
  toast('Titre d\'habilitation généré');
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
