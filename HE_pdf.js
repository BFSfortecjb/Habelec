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

/* ------------------- 1. Titre + avis d'habilitation (une page) -----
 * Combine sur une seule page A4 portrait ce qui tenait avant sur deux
 * documents séparés : le bandeau titulaire/employeur/avis (~1/4 à 1/3
 * de la hauteur, en haut) et le tableau d'avis d'habilitation complet
 * (Personnel × Symbole × Champ d'application, Annexe C de la NF C18-510)
 * qui occupe le reste de la page. Économise le papier et simplifie la
 * remise au client (2026-08, demande explicite). */
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

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const largeur = 210, marge = 12, largeurUtile = largeur - 2 * marge;
  let y = marge;

  /* ---- Bandeau du haut (~1/4 à 1/3 de la page) : titulaire / employeur / avis ---- */
  const colTitulaire = marge;
  const colEmployeur = marge + largeurUtile * 0.34;
  const colAvis = marge + largeurUtile * 0.66;
  const largeurColAvis = largeurUtile * 0.34;
  const yBandeau = y;

  doc.setFont('helvetica', 'bold').setFontSize(13);
  doc.text('TITRE D\'HABILITATION ÉLECTRIQUE', largeur / 2, y + 5, { align: 'center' });
  doc.setFontSize(8).setFont('helvetica', 'normal');
  doc.text('NF C18-510 — ' + (org.raison_sociale || ''), largeur / 2, y + 10, { align: 'center' });
  doc.setDrawColor(180).line(marge, y + 13, largeur - marge, y + 13);
  y += 18;
  const yColonnes = y;

  // Titulaire
  doc.setFont('helvetica', 'bold').setFontSize(9);
  doc.text('LE TITULAIRE', colTitulaire, y);
  doc.setFont('helvetica', 'normal').setFontSize(8.5);
  doc.text('Nom : ' + (st.nom || ''), colTitulaire, y + 6);
  doc.text('Prénom : ' + (st.prenom || ''), colTitulaire, y + 11);
  doc.text('Fonction : ' + (st.fonction || ''), colTitulaire, y + 16);
  doc.text('Signature :', colTitulaire, y + 21);
  if (st.signature_data) doc.addImage(st.signature_data, 'PNG', colTitulaire + 20, y + 17, 34, 11);

  // Employeur
  doc.setFont('helvetica', 'bold').setFontSize(9);
  doc.text('L\'EMPLOYEUR', colEmployeur, y);
  doc.setFont('helvetica', 'normal').setFontSize(8.5);
  doc.text('Société : ' + (org.raison_sociale || ''), colEmployeur, y + 6);
  doc.text('Nom : ' + (org.signataire_nom || ''), colEmployeur, y + 11);
  doc.text('Fonction : ' + (org.signataire_fonction || ''), colEmployeur, y + 16);
  doc.text('Signature :', colEmployeur, y + 21);
  if (org.signature_data) doc.addImage(org.signature_data, 'PNG', colEmployeur + 20, y + 17, 34, 11);

  // Avis (texte légal + date/validité)
  doc.setFont('helvetica', 'bold').setFontSize(9);
  doc.text('AVIS', colAvis, y);
  doc.setFont('helvetica', 'normal').setFontSize(6.6);
  doc.text(
    'Ce titre est établi et signé par l\'employeur puis remis à l\'intéressé qui doit également '
    + 'le signer. Strictement personnel, il ne peut être remis à un tiers. Le titulaire doit le '
    + 'conserver à sa portée pendant les heures de travail. Cette habilitation seule n\'autorise pas '
    + 'à effectuer de son propre chef les opérations pour lesquelles elle est délivrée.',
    colAvis, y + 4.5, { maxWidth: largeurColAvis, lineHeightFactor: 1.25 });
  doc.setFontSize(8).setFont('helvetica', 'bold');
  doc.text('Délivré le ' + dateFr(titre.delivre_le), colAvis, y + 25);
  doc.setFont('helvetica', 'normal');
  doc.text('Validité : ' + (org.validite_annees || 3) + ' ans — à recycler avant le '
    + dateFr(titre.recycler_avant), colAvis, y + 29, { maxWidth: largeurColAvis });

  y = yColonnes + 33;
  if (titre.indications || titre.ouvrages) {
    doc.setFontSize(7.5).setFont('helvetica', 'italic');
    doc.text('Autorisations / indications supplémentaires : '
      + (titre.indications || titre.ouvrages || ''), marge, y, { maxWidth: largeurUtile });
    y += 5;
  }
  doc.setDrawColor(0).line(marge, y + 2, largeur - marge, y + 2);
  y += 7;

  /* ---- Tableau d'avis d'habilitation (Annexe C) : Personnel × Symbole × Champ ---- */
  doc.setFont('helvetica', 'bold').setFontSize(10);
  doc.text('AVIS D\'HABILITATION', largeur / 2, y, { align: 'center' });
  y += 4;

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
    styles: { fillColor: [235, 238, 242], fontStyle: 'bold', halign: 'center', textColor: 20 },
  }];

  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5, valign: 'middle' },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold', halign: 'center' },
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
  y = doc.lastAutoTable.finalY + 8;

  doc.setFontSize(7).setTextColor(90);
  doc.text('La rubrique « indications supplémentaires » doit être obligatoirement renseignée le cas '
    + 'échéant. Cette habilitation n\'autorise pas à elle seule son titulaire à effectuer de son '
    + 'propre chef les opérations pour lesquelles il est habilité.', marge, y, { maxWidth: largeurUtile });
  doc.setTextColor(0);

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
