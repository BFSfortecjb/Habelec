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
const PDF_VERSION = 'v16-2026-08-28';

// 2026-08-28 (demande de Jeremy) : sauvegarde automatique, best-effort, des
// PDF stagiaires sur Google Drive (compte de service configuré dans l'onglet
// Organisme) — jamais bloquant, une erreur ici ne doit jamais empêcher la
// génération ni le téléchargement du PDF lui-même.
async function sauvegarderDocumentDrive(sessionId, nomFichier, doc, nomSession) {
  if (!sessionId) return;
  try {
    const contenuBase64 = doc.output('datauristring').split(',')[1];
    const { data, error } = await sb.functions.invoke('habelec-sauvegarder-drive', {
      body: {
        session_id: sessionId, nom_fichier: nomFichier, mime_type: 'application/pdf',
        contenu_base64: contenuBase64, nom_session: nomSession,
      },
    });
    if (error || data?.ok === false) console.warn('Sauvegarde Drive ignorée :', error || data?.erreur);
  } catch (e) {
    console.warn('Sauvegarde Drive ignorée :', e);
  }
}

// 2026-08-27 (demande de Jeremy) : affiché au-dessus du trait de découpe,
// donc dans la partie DOSSIER (conservée par l'employeur), jamais sur la
// carte TITRE remise au titulaire — ce repère technique n'a rien à faire
// entre les mains du salarié.
// Format réel d'une image encodée en dataURL (2026-08-27) : le cachet de
// l'organisme est une image UPLOADÉE par l'utilisateur (photo/scan), pas un
// tracé de canvas — jamais forcément un PNG. jsPDF exige le bon format sous
// peine d'exception "Incomplete or corrupt PNG file" si on lui ment.
function formatImageDataUrl(dataUrl) {
  const m = /^data:image\/(\w+);base64,/.exec(dataUrl || '');
  if (!m) return null;
  const type = m[1].toLowerCase();
  if (type === 'jpg') return 'JPEG';
  return type.toUpperCase();
}

// Image "à risque" (signature ou cachet enregistrés par l'utilisateur, pas un
// asset fixe de l'appli) : un format non supporté par jsPDF (webp, fichier pas
// vraiment une image malgré l'extension...) ou des données corrompues ne
// doivent JAMAIS empêcher la génération du reste du titre — on ignore juste
// cette image-là, avec un avertissement en console (2026-08-27).
// x, y, largeurMax, hauteurMax délimitent une BOÎTE — l'image est réduite pour
// y tenir en conservant ses proportions réelles (jamais étirée/déformée),
// alignée en bas à gauche de la boîte (2026-08-27, correction demande de
// Jeremy : un cachet+signature scanné dans une image large et basse
// ressortait minuscule et déformé quand on forçait une largeur/hauteur fixes
// sans rapport avec ses proportions d'origine).
function ajouterImageSure(doc, dataUrl, format, x, y, largeurMax, hauteurMax) {
  if (!dataUrl) return;
  const f = format || formatImageDataUrl(dataUrl);
  if (!f) { console.warn('Image ignorée (format non reconnu) :', dataUrl.slice(0, 30)); return; }
  try {
    let largeur = largeurMax, hauteur = hauteurMax;
    const props = doc.getImageProperties(dataUrl);
    if (props?.width && props?.height) {
      const ratio = props.width / props.height;
      if (largeurMax / hauteurMax > ratio) {
        largeur = hauteurMax * ratio;
      } else {
        hauteur = largeurMax / ratio;
      }
    }
    doc.addImage(dataUrl, f, x, y + (hauteurMax - hauteur), largeur, hauteur);
  } catch (e) {
    console.warn('Image ignorée (fichier corrompu ou non supporté) :', e);
  }
}

function piedDeVersion(doc, largeur, marge, yCarte) {
  doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(180, 180, 180);
  doc.text(PDF_VERSION, largeur - marge, yCarte - 1.5, { align: 'right' });
}

// Charte graphique Univers BFS (commune à toutes les applis) : jaune #f3ab12,
// rouge #b2181a, gris #464645, noir #080808. Police Montserrat côté web ;
// jsPDF ne l'embarque pas nativement (police non fournie/licenciée pour PDF),
// Helvetica reste donc la police du document — seule la palette de couleurs
// est reprise ici.
const BFS = {
  jaune: [243, 171, 18],
  rouge: [178, 24, 26],
  vert: [27, 124, 60],
  gris: [70, 70, 69],
  noir: [8, 8, 8],
  grisClair: [244, 244, 243],
};

// Logo Univers BFS (extrait du modèle Word BFS fourni par Jeremy, 222×119 px,
// ratio ~1,866) — encodé en base64 pour ne dépendre d'aucun fichier externe
// ni requête réseau lors de la génération du PDF.
const LOGO_BFS = 'data:image/png;base64,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';

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
async function genererTitrePdf(stagiaireId, { sauvegarder = true } = {}) {
  // Garde-fou (2026-08-28, demande de Jeremy) : impossible de générer le titre
  // tant qu'un titre en échec (avis defavorable) n'a pas de préconisation —
  // normalement déjà demandée en fermant la copie corrigée (voirCopie), ce
  // filet couvre aussi les corrections faites avant l'ajout de cette règle.
  const { data: echecsSansPreconisation } = await sb.from('resultats_symbole')
    .select('symbole_code').eq('stagiaire_id', stagiaireId).eq('avis', 'defavorable').is('preconisation', null);
  if (echecsSansPreconisation?.length) {
    toast('Préconisation obligatoire pour au moins un titre en échec — à saisir avant de générer le titre', 'erreur', 6000);
    return saisirPreconisations(stagiaireId);
  }

  let titre;
  try {
    const id = await rpc('generer_titre', { p_stagiaire_id: stagiaireId });
    const { data } = await sb.from('titres_habilitation').select('*').eq('id', id).single();
    titre = data;
  } catch (e) {
    return erreurSupabase('Génération du titre', e);
  }
  // 2026-08-28 (demande de Jeremy) : plus de document de repli sommaire en
  // cas d'échec — habelec.generer_titre() crée désormais toujours une ligne
  // titres_habilitation, même sans aucun symbole favorable (symboles = []).
  // Ce même document stylé est alors produit pour justifier l'échec auprès
  // du client, avec "Habilitation recommandée : aucune" et les cases du
  // titre barrées en diagonal — voir plus bas (const echec).
  const echec = !titre.symboles || titre.symboles.length === 0;

  const { data: stRaw } = await sb.from('stagiaires')
    .select('*, stagiaire_symboles(symbole_code)').eq('id', stagiaireId).single();
  const st = stRaw;
  // Symboles réellement visés par CE stagiaire (2026-08-27, demande de Jeremy) :
  // sert à afficher, dans le détail par titre visé, uniquement le(s) titre(s)
  // effectivement visé(s) — pas l'intitulé complet du gabarit, qui peut nommer
  // deux titres partageant la même épreuve (ex: "HE Mesurage / HE Vérification"
  // pour D.3.1.11) alors qu'un seul des deux a été visé. Éviter l'incohérence
  // avec le tableau Annexe C du titre lui-même, qui ne liste que le symbole réel.
  const symbolesStagiaire = (st.stagiaire_symboles || []).map(x => x.symbole_code);
  const [{ data: session }, { data: epreuves }, { data: resultatsSymbole }] = await Promise.all([
    sb.from('sessions_formation').select('*').eq('id', st.session_id).single(),
    // 2026-09-03 (QCM de rattrapage) : jusqu'à 2 lignes par stagiaire —
    // 'initiale' (tous les titres visés) et, si généré, 'rattrapage' (les
    // titres ratés au premier passage seulement). Voir plus bas : le détail
    // par titre pioche dans le rattrapage quand il existe et couvre ce
    // titre, sinon dans l'initiale.
    sb.from('epreuves_theoriques').select('*').eq('stagiaire_id', stagiaireId),
    // Préconisations du formateur (2026-08-28, demande de Jeremy) : saisies à la main,
    // affichées dans "Détail par titre visé" sur les lignes en échec — voir plus bas.
    sb.from('resultats_symbole').select('symbole_code, preconisation').eq('stagiaire_id', stagiaireId),
  ]);
  const ep = (epreuves || []).find(e => (e.type_epreuve || 'initiale') === 'initiale') || null;
  const epRattrapage = (epreuves || []).find(e => e.type_epreuve === 'rattrapage') || null;
  const preconisationParSymbole = Object.fromEntries(
    (resultatsSymbole || []).filter(r => r.preconisation).map(r => [r.symbole_code, r.preconisation]));
  const org = S.organisme || {};
  const c = titre.contenu || {};
  const lignes = c.lignes || {};
  // 2026-08-28 (demande de Jeremy) : en cas d'échec (aucun symbole
  // favorable), "aucune" plutôt que "—" — formulation explicite qui
  // justifie l'absence d'habilitation auprès du client.
  const habilitationRecommandee = echec ? 'aucune' : (Object.values(lignes).flat().join(', ') || '—');

  // Détail par titre visé (2026-08-12) : % de réussite théorique et score aux
  // questions fondamentales, sur le même périmètre que theorie_gabarit_ok()
  // (tronc commun + thèmes propres au gabarit) — sert à justifier sur le
  // document la réussite ou l'échec de l'évaluation théorique, plus le
  // résultat de l'épreuve pratique du même titre. Demande de Jeremy.
  const gabaritsVises = ep?.gabarits || [];
  // Le rattrapage ne fait autorité pour un titre que s'il a effectivement
  // été corrigé — tant qu'il est en cours, l'avis continue de refléter le
  // premier passage pour ce titre.
  const epreuvePourGabarit = g => (epRattrapage
    && epRattrapage.statut === 'corrigee'
    && (epRattrapage.gabarits || []).includes(g)) ? epRattrapage : ep;
  const [detailsTheorie, { data: pratiques }] = await Promise.all([
    Promise.all(gabaritsVises.map(g => {
      const epG = epreuvePourGabarit(g);
      return epG ? rpc('theorie_gabarit_detail', { p_epreuve_id: epG.id, p_gabarit_code: g }).catch(() => null) : null;
    })),
    gabaritsVises.length
      ? sb.from('epreuves_pratiques').select('gabarit_code, reussie')
          .eq('stagiaire_id', stagiaireId).in('gabarit_code', gabaritsVises)
      : Promise.resolve({ data: [] }),
  ]);
  const detailParGabarit = Object.fromEntries(gabaritsVises.map((g, i) => [g, detailsTheorie[i]]));
  const pratiqueParGabarit = Object.fromEntries((pratiques || []).map(p => [p.gabarit_code, p.reussie]));

  // 2026-09-03 (demande de Jeremy) : le nombre de fondamentales exigé par
  // titre n'est plus une somme normative (source de "7/4" incohérents) mais
  // le plafond réellement appliqué à CET examen — 1 fondamentale "tronc
  // commun" (DANGERS/ZONES/GENERALITES) + 1 par titre visé, voir
  // generer_qcm() et theorie_gabarit_detail(). d.fond_total (renvoyé par la
  // fonction SQL) est donc directement le bon chiffre à afficher, plus
  // besoin de le recalculer ici depuis le référentiel.

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const largeur = 210, hauteurPage = 297, marge = 12, largeurUtile = largeur - 2 * marge;
  let y = marge;
  // Le document imprimé recto verso, une fois découpé à hauteur yCarte, donne
  // DEUX morceaux : le grand morceau du haut (dossier employeur — avis en
  // recto, rien en verso) et la bande du bas de 10 cm sur toute la largeur de
  // la page, qui EST le titre à remettre au titulaire — le grand tableau
  // Annexe C en recto (bas de page 1) et la carte compacte en verso (page 2).
  // Même hauteur des deux côtés par construction (une seule constante
  // yCarte réutilisée). Voir PDF_VERSION v9 (2026-08-05) : le tableau est en
  // police réduite pour tenir dans les 10 cm demandés, et les deux faces de
  // la bande ont été inversées par rapport à la v8 (carte et tableau
  // échangés) à la demande de Jeremy.
  const hauteurCarte = 100;
  const yCarte = hauteurPage - hauteurCarte;

  /* ================= AVIS D'HABILITATION ================= */
  // Logo en haut à droite : la zone haut-gauche est déjà prise par le titre
  // centré et, juste en dessous, NOM/Prénom démarrent à la marge — un logo
  // à gauche les chevauchait.
  doc.addImage(LOGO_BFS, 'PNG', largeur - marge - 20, marge - 3, 20, 20 * 119 / 222);
  doc.setTextColor(...BFS.noir).setFont('helvetica', 'bold').setFontSize(15);
  doc.text('AVIS D\'HABILITATION ÉLECTRIQUE', largeur / 2, y, { align: 'center' });
  y += 3;
  doc.setDrawColor(...BFS.jaune).setLineWidth(0.8).line(largeur / 2 - 22, y, largeur / 2 + 22, y);
  doc.setLineWidth(0.2);
  y += 5;

  // Bandeau ÉCHEC (2026-08-28, demande de Jeremy) : rend le résultat visible
  // au premier coup d'œil sur ce document par ailleurs identique à un titre
  // validé — justifie l'absence d'habilitation auprès du client.
  if (echec) {
    doc.setFillColor(...BFS.rouge).rect(marge, y - 3.5, largeurUtile, 7, 'F');
    doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(9.5);
    doc.text('ÉCHEC — AUCUNE HABILITATION DÉLIVRÉE À L\'ISSUE DE CETTE ÉVALUATION', largeur / 2, y + 1, { align: 'center' });
    doc.setTextColor(...BFS.noir);
    y += 7;
  }

  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.text('NOM : ' + (st.nom || ''), marge, y);
  doc.text('Prénom : ' + (st.prenom || ''), marge + 70, y);
  y += 6;
  // Entreprise (employeur) du stagiaire (2026-08-28, demande de Jeremy) —
  // distincte de l'organisme de formation affiché plus bas dans le bloc
  // "ORGANISME DE FORMATION : BFS...". Repli sur l'entreprise de la session
  // si le stagiaire n'a pas la sienne propre (formation intra-entreprise).
  doc.text('Entreprise : ' + (st.entreprise || session?.entreprise || '—'), marge, y);
  y += 6;
  doc.text('Dates de la formation : ' + [dateFr(session?.date_debut), dateFr(session?.date_fin)]
    .filter(Boolean).join(' au '), marge, y);
  y += 5;

  // Numéro de vérification d'authenticité (2026-08-26) : imprimé sur l'avis
  // ET sur le titre (recto tableau + verso carte, plus bas) — permet à un
  // employeur de vérifier ce document via l'export de v_titres_verification.
  doc.setFont('helvetica', 'bold').setFontSize(9);
  doc.text('N° de vérification : ' + (titre.numero || '—'), marge, y);
  y += 6;

  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  doc.text('Résultats de l\'évaluation et avis d\'habilitation du formateur :', marge, y);
  y += 3;

  // Évaluation externe (2026-08-27, demande de Jeremy) : un stagiaire évalué
  // par un formateur/organisme extérieur à BFS (ev.formateur non vide) n'a
  // pas d'épreuve théorique Habelec (ep est null) — on affiche alors le
  // résultat saisi manuellement (note/total/taux) et le nom du formateur
  // externe à la place, avec une observation explicite sur l'origine du
  // résultat. La table "Détail par titre visé" plus bas reste simplement
  // absente pour ces stagiaires (gabaritsVises est vide sans ep), sans
  // aucune modification nécessaire de cette partie du code.
  const ev = st.evaluation_externe || null;
  const resultatTheorique = ev
    ? `${ev.note ?? '—'}/${ev.total ?? '—'}${ev.taux != null ? ` (${ev.taux} %)` : ''}`
    : (ep && ep.score_total
      ? `${ep.score_brut}/${ep.score_total} (${Math.round((ep.taux || 0) * 100)} %)` : '—');
  const nomFormateurAffiche = ev
    ? `${ev.formateur || '—'} (formateur externe)`
    : (S.profil ? `${S.profil.nom || ''} ${S.profil.prenom || ''}`.trim() : '—');
  const observationsAffichees = ev
    ? `Évaluation théorique réalisée par un organisme/formateur extérieur à BFS.`
      + ` ${ev.theorique_validee === false ? 'Non validée.' : 'Validée.'}`
      + (ev.saisi_le ? ` Saisie le ${dateFr(ev.saisi_le)}.` : '')
    : '';
  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2, valign: 'top' },
    headStyles: { fillColor: BFS.jaune, textColor: BFS.noir, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 28 }, 2: { cellWidth: 40 }, 3: { cellWidth: 30 } },
    head: [['Formateur', 'Résultat théorique', 'Habilitation recommandée', 'Restrictions', 'Observations']],
    body: [
      [nomFormateurAffiche, resultatTheorique, habilitationRecommandee, '', observationsAffichees],
      [{ content: '', colSpan: 5, styles: { minCellHeight: 4 } }],
    ],
  });
  y = doc.lastAutoTable.finalY + 2;

  // Détail par titre visé : justifie la réussite ou l'échec de l'évaluation
  // théorique (% et fondamentales) et résume la pratique, titre par titre —
  // le tableau ci-dessus n'affiche qu'un score global agrégé.
  if (gabaritsVises.length) {
    doc.autoTable({
      startY: y, margin: { left: marge, right: marge }, theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.6, valign: 'middle' },
      headStyles: { fillColor: BFS.grisClair, textColor: BFS.noir, fontStyle: 'bold' },
      // Colonnes resserrées (2026-08-28, demande de Jeremy) pour faire de la
      // place à la colonne Préconisation, sans réduire "Titre visé" (les
      // libellés peuvent être longs). L'alignement de chaque en-tête est fixé
      // explicitement (via head ci-dessous) pour rester cohérent avec celui
      // des valeurs de sa colonne, plutôt que de compter sur un héritage
      // implicite de columnStyles qui ne s'appliquait pas toujours à l'en-tête.
      columnStyles: {
        0: { cellWidth: largeurUtile * 0.20 },
        1: { cellWidth: largeurUtile * 0.16, halign: 'center' },
        2: { cellWidth: largeurUtile * 0.16, halign: 'center' },
        3: { cellWidth: largeurUtile * 0.15, halign: 'center' },
        4: { cellWidth: largeurUtile * 0.33 },
      },
      head: [[
        { content: 'Titre visé', styles: { halign: 'left' } },
        { content: 'Résultat théorique', styles: { halign: 'center' } },
        { content: 'Questions fondamentales', styles: { halign: 'center' } },
        { content: 'Épreuve pratique', styles: { halign: 'center' } },
        { content: 'Préconisation', styles: { halign: 'left' } },
      ]],
      body: gabaritsVises.map(g => {
        const d = detailParGabarit[g];
        const pratOk = pratiqueParGabarit[g];
        const refFond = d?.fond_total || 0;
        // Score chiffré (ex: 2/2) plutôt qu'un texte "toutes justes / insuffisant"
        // (demande de Jeremy, 2026-08-27) — requis et score viennent tous les
        // deux de theorie_gabarit_detail() (voir remarque plus haut).
        const cellule = (texte, couleur) => couleur
          ? { content: texte, styles: { textColor: couleur, fontStyle: 'bold' } }
          : texte;

        const fond = !d ? '—'
          : refFond === 0 ? 'aucune exigée'
          : cellule(`${d.fond_justes}/${refFond}`, d.fond_ok ? BFS.vert : BFS.rouge);

        const theorie = d
          ? cellule(`${d.justes}/${d.total} (${d.taux} %)`, d.ok ? BFS.vert : BFS.rouge)
          : '—';

        const pratique = pratOk === true ? cellule('validée', BFS.vert)
          : pratOk === false ? cellule('non validée', BFS.rouge)
          : 'en attente';

        const symbolesVises = symbolesStagiaire
          .filter(sym => (S.referentiel.gabaritsParSymbole[sym] || []).includes(g));
        const libelleTitre = symbolesVises.length
          ? symbolesVises.map(libelleSymbole).join(' / ')
          : libelleGabarit(g); // repli si l'info symbole n'est pas disponible

        // Couleur de la ligne entière (2026-08-27, demande de Jeremy) : vert si
        // titre entièrement validé (théorie + fondamentales + pratique), rouge
        // dès qu'un critère est raté, neutre tant que la pratique est en attente.
        const echoue = (d && !d.ok) || pratOk === false;
        const valide = d && d.ok && pratOk === true;
        const intitule = echoue ? cellule(libelleTitre, BFS.rouge)
          : valide ? cellule(libelleTitre, BFS.vert)
          : libelleTitre;

        // Préconisation du formateur (2026-08-28, demande de Jeremy) : saisie
        // à la main (voir "✏️" sur l'écran Session), affichée uniquement sur
        // les titres en échec — un titre non encore en échec (pratique en
        // attente) n'a par définition rien à préconiser pour l'instant.
        const preconisation = echoue
          ? (symbolesVises.map(sym => preconisationParSymbole[sym]).filter(Boolean).join(' ; ') || '—')
          : '';

        return [intitule, theorie, fond, pratique, preconisation];
      }),
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2, minCellHeight: 11 },
    columnStyles: { 0: { cellWidth: largeurUtile * 0.55 }, 1: { cellWidth: largeurUtile * 0.45 } },
    body: [[`Date de l'avis : ${dateFr(new Date().toISOString())}`, 'Signature formateur :']],
  });
  // Signature du formateur, pré-enregistrée une fois depuis "Mon compte"
  // (2026-08-27, demande de Jeremy) : apposée automatiquement, plus besoin
  // de signer à la main à chaque avis.
  ajouterImageSure(doc, S.profil?.signature_data, null,
    marge + largeurUtile * 0.55 + 28, doc.lastAutoTable.finalY - 9, 26, 8);
  y = doc.lastAutoTable.finalY + 5;

  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...BFS.gris);
  doc.text(
    'L\'avis d\'habilitation délivré par le formateur ne vaut ni certification, ni habilitation. Il '
    + 'constitue un élément sur lequel l\'employeur pourra fonder sa décision d\'habiliter le salarié, '
    + 'en complément de la connaissance par l\'employeur des compétences du salarié, de son '
    + 'environnement de travail et de ses activités, de son aptitude médicale.',
    marge, y, { maxWidth: largeurUtile, lineHeightFactor: 1.3 });
  y += 13;
  doc.setFont('helvetica', 'bold').setTextColor(...BFS.noir);
  doc.text('L\'habilitation est accordée par l\'employeur.', marge, y);
  y += 5;

  // Bloc organisme en 2 colonnes (2026-08-28, demande de Jeremy) : gagne de
  // la hauteur par rapport à l'ancien empilement à 3 lignes pleine largeur —
  // nécessaire depuis l'ajout de la colonne Préconisation ci-dessus, qui peut
  // pousser le tableau "Détail par titre visé" plus loin quand il y a
  // plusieurs titres. Colonne de gauche : organisme + responsable, l'un sous
  // l'autre ; colonne de droite : date + signature/cachet, sur toute la
  // hauteur des deux lignes de gauche (rowSpan).
  const largeurColOrg = largeurUtile * 0.55, largeurColSignature = largeurUtile * 0.45;
  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    columnStyles: { 0: { cellWidth: largeurColOrg }, 1: { cellWidth: largeurColSignature } },
    body: [
      [`ORGANISME DE FORMATION : ${org.raison_sociale || ''}`,
        { content: `Date : ${dateFr(new Date().toISOString())}\nSignature et cachet de l'organisme :`,
          rowSpan: 2, styles: { minCellHeight: 30, valign: 'top' } }],
      [`RESPONSABLE : ${[org.signataire_nom, org.signataire_fonction].filter(Boolean).join(' — ')}`],
    ],
  });
  // Signature + cachet du représentant de l'organisme, pré-enregistrés une
  // fois depuis l'onglet Organisme (2026-08-27, demande de Jeremy) : apposés
  // automatiquement sur chaque avis. L'employeur, lui, continue de signer à
  // la main sur le titre (voir plus bas, volet "L'EMPLOYEUR"). Positions
  // recalculées (2026-08-28) pour la colonne de droite, plus étroite que la
  // pleine largeur d'avant.
  const xColSignature = marge + largeurColOrg;
  ajouterImageSure(doc, org.signature_data, null,
    xColSignature + largeurColSignature - 28, doc.lastAutoTable.finalY - 11, 26, 9);
  ajouterImageSure(doc, org.cachet_data, null,
    xColSignature + 2, doc.lastAutoTable.finalY - 21, 42, 19);
  y = doc.lastAutoTable.finalY + 4;

  // Marges réduites pour la carte titre (recto + verso, la bande découpée
  // uniquement) — demande de Jeremy 2026-08-27 après un test d'impression :
  // le dossier employeur au-dessus garde ses marges normales (marge), mais
  // le titre remis au titulaire doit exploiter un maximum de largeur et
  // descendre au plus près du bord bas de la page.
  const margeCarte = 3;
  const largeurUtileCarte = largeur - 2 * margeCarte;

  // Repère de découpe sur la page 1 (recto) : la bande sous ce trait n'est
  // PAS un simple espace vide, c'est le recto du titre à remettre au
  // titulaire (le tableau Annexe C ci-dessous). Le garde-fou évite juste que
  // le trait ne vienne se superposer au dossier employeur si celui-ci était
  // exceptionnellement long.
  if (y < yCarte - 3) {
    doc.setFontSize(7).setTextColor(...BFS.gris).setFont('helvetica', 'bold');
    doc.text('Après découper, plier en 3', largeur / 2, yCarte - 4.5, { align: 'center' });
    doc.setDrawColor(...BFS.gris).setLineDashPattern([2, 1.5], 0);
    doc.line(margeCarte, yCarte, largeur - margeCarte, yCarte);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(7).setTextColor(...BFS.gris).setFont('helvetica', 'italic');
    doc.text('découper ici (même hauteur qu\'au verso)', largeur / 2, yCarte - 1.5, { align: 'center' });
    piedDeVersion(doc, largeur, margeCarte, yCarte);
  }

  /* ================= TITRE — RECTO (tableau Annexe C, bas de page 1) =====
   * Le tableau est le RECTO du titre remis au titulaire ; son VERSO (la
   * carte compacte) est en bas de la page 2, à la MÊME hauteur yCarte —
   * c'est ce qui permet de découper une seule bande, imprimée recto verso,
   * qui porte le tableau détaillé d'un côté et la carte résumée de l'autre.
   * Police réduite (7 pt / cellPadding 1.4) pour tenir dans la bande de
   * 10 cm demandée sans déborder de la page. */
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
    startY: yCarte + 6, margin: { left: margeCarte, right: margeCarte }, theme: 'grid',
    // cellPadding relevé de 1.4 à 2.2 (2026-08-27, demande de Jeremy) : le
    // tableau s'arrêtait bien avant le bas de la bande découpée, alors que la
    // carte verso (page 2) remplit toute la sienne — l'un semblait plus
    // "grand" que l'autre une fois découpés. Pas de cadre ajouté : on étire
    // plutôt le contenu existant pour occuper le même espace.
    styles: { fontSize: 7, cellPadding: 2.2, valign: 'middle' },
    headStyles: { fillColor: BFS.jaune, textColor: BFS.noir, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 34 }, 1: { cellWidth: 30, fontStyle: 'bold' },
      2: { cellWidth: 23 }, 3: { cellWidth: 47 }, 4: { cellWidth: largeurUtileCarte - 34 - 30 - 23 - 47 },
    },
    head: [['Personnel', 'Symbole d\'habilitation\net attribut', 'Domaine\nde tension',
      'Installations concernées', 'Indications supplémentaires']],
    body: [
      ligneSection('Opérations d\'ordre non électrique'),
      ...nonElec.map(ligneAvis),
      ligneSection('Opérations d\'ordre électrique'),
      ...elec.map(ligneAvis),
    ],
    // Cases barrées en diagonal (2026-08-28, demande de Jeremy) : en cas
    // d'échec, chaque ligne « Personnel / Symbole / ... » du tableau Annexe C
    // est barrée d'un trait rouge en diagonal pour marquer visuellement
    // qu'aucune habilitation n'est délivrée sur ce titre — la colonne 4
    // (dernière) sert de déclencheur (une seule fois par ligne) et le trait
    // couvre toute la largeur de la ligne, pas seulement cette cellule ;
    // les lignes de section ("Opérations d'ordre ...", colSpan 5, colonne 0
    // uniquement) ne sont volontairement pas barrées.
    didDrawCell: data => {
      if (!echec || data.section !== 'body' || data.column.index !== 4) return;
      doc.setDrawColor(...BFS.rouge).setLineWidth(0.5);
      const xGauche = margeCarte, xDroite = margeCarte + largeurUtileCarte;
      doc.line(xGauche, data.cell.y, xDroite, data.cell.y + data.cell.height);
      doc.setLineWidth(0.2);
    },
  });
  let yTableau = doc.lastAutoTable.finalY + 2;

  doc.setFontSize(5.6).setTextColor(...BFS.gris).setFont('helvetica', 'normal');
  doc.text('La rubrique « indications supplémentaires » doit être obligatoirement renseignée le cas '
    + 'échéant. Cette habilitation n\'autorise pas à elle seule son titulaire à effectuer de son '
    + 'propre chef les opérations pour lesquelles il est habilité.', margeCarte, yTableau, { maxWidth: largeurUtileCarte });
  yTableau += 6;

  // Rappel des seuils de domaine de tension (alternatif / continu) — repris
  // tel quel du modèle Excel « Titre_habilitation_autovf.xlsx » fourni par
  // Jeremy (onglet Titre, lignes 14-15).
  doc.setFont('helvetica', 'bold').setFontSize(6).setTextColor(...BFS.noir);
  doc.text('Domaine de tension :', margeCarte, yTableau);
  doc.setFont('helvetica', 'normal').setFontSize(5.8).setTextColor(...BFS.gris);
  doc.text('Alternatif : TBT <= 50 V // 50 V < BT <= 1 000 V // 1 000 V < HTA <= 50 000 V // HTB > 50 000 V',
    margeCarte + 30, yTableau);
  doc.text('Continu : TBT <= 120 V // 120 V < BT <= 1 500 V // 1 500 V < HTA <= 75 000 V // HTB > 75 000 V',
    margeCarte + 30, yTableau + 3.5);

  doc.setFont('helvetica', 'bold').setFontSize(6).setTextColor(...BFS.noir);
  doc.text('N° de vérification : ' + (titre.numero || '—'), largeur - margeCarte, yTableau + 3.5, { align: 'right' });

  /* ================= TITRE — VERSO (carte 3 volets, page 2) ===========
   * Bande destinée à être découpée puis pliée en 3 (comme un dépliant),
   * demande de Jeremy 2026-08-06. Ordre gauche → droite :
   *   volet 1 : titulaire + employeur (identité, signatures)
   *   volet 2 : texte réglementaire « AVIS » (repris du modèle fourni)
   *   volet 3 : logo BFS, encadré « TITRE D'HABILITATION ÉLECTRIQUE
   *             NF C18-510 », puis la marque et le téléphone du site où la
   *             formation a eu lieu (Bretagne Formation Sécurité / Briec ou
   *             Bocage Formation Sécurité / Sèvremont — champ
   *             sessions_formation.lieu, saisi à la création de la session). */
  doc.addPage();

  // 2026-08-27 (demande de Jeremy) : plus de trait/texte "découper ici" en
  // page 2 — seul celui de la page 1 fait foi (même hauteur des deux côtés).
  piedDeVersion(doc, largeur, margeCarte, yCarte);

  const SITES = {
    'Briec': { marque: 'Bretagne Formation Sécurité', tel: '02 98 82 29 67' },
    'Sèvremont': { marque: 'Bocage Formation Sécurité', tel: '02 51 57 75 65' },
  };
  const site = SITES[session?.lieu] || { marque: org.raison_sociale || '', tel: org.telephone || '' };

  const largeurVolet = largeurUtileCarte / 3;
  const xV1 = margeCarte;
  const xV2 = margeCarte + largeurVolet;
  const xV3 = margeCarte + 2 * largeurVolet;
  const zHaut = yCarte + 3;
  const zBas = hauteurPage - margeCarte;

  // 2026-08-27 (demande de Jeremy) : plus de cadre extérieur ni de traits de
  // pliage pointillés (mal alignés avec le pliage réel à cause des marges
  // réduites) — l'instruction "Après découper, plier en 3" (page 1) suffit.

  /* ---- Volet 1 : titulaire + employeur ---- */
  const xc1 = xV1 + largeurVolet / 2;
  doc.setTextColor(...BFS.noir).setFont('helvetica', 'bold').setFontSize(8);
  doc.text('LE TITULAIRE', xc1, zHaut + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(7.5);
  doc.text('Nom : ' + (st.nom || ''), xV1 + 3, zHaut + 12);
  doc.text('Prénom : ' + (st.prenom || ''), xV1 + 3, zHaut + 16);
  doc.text('Signature :', xV1 + 3, zHaut + 20);
  ajouterImageSure(doc, st.signature_data, null, xV1 + 3, zHaut + 22, 28, 9);

  doc.setFont('helvetica', 'bold').setFontSize(8);
  doc.text('L\'EMPLOYEUR', xc1, zHaut + 40, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(7.5);
  // Société de l'EMPLOYEUR du stagiaire (2026-08-28, correctif demande de
  // Jeremy) — org est l'organisme de FORMATION (BFS), jamais l'employeur :
  // on affichait par erreur org.raison_sociale ici. La bonne valeur vient du
  // stagiaire (saisie par le formateur à la création, ou par le stagiaire
  // lui-même à la connexion au QCM), avec repli sur l'entreprise de la
  // session (utile en formation intra-entreprise).
  doc.text('Société : ' + (st.entreprise || session?.entreprise || ''), xV1 + 3, zHaut + 46);
  doc.text('Nom :', xV1 + 3, zHaut + 50);
  doc.text('Signature :', xV1 + 3, zHaut + 54);
  // 2026-08-27 (demande de Jeremy) : l'employeur signe à la main sur le
  // titre imprimé, pas de signature pré-enregistrée ici (elle n'a pas de
  // compte dans l'appli — à ne pas confondre avec la signature de
  // l'organisme de formation, apposée automatiquement plus haut sur l'avis).

  // 2026-08-28 (demande de Jeremy) : en cas d'échec, pas de date de
  // délivrance ni de validité à afficher — aucune habilitation n'est
  // accordée, donc rien à faire courir dans le temps.
  if (echec) {
    doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...BFS.rouge);
    doc.text('Aucune habilitation délivrée.', xV1 + 3, zBas - 4, { maxWidth: largeurVolet - 6 });
    doc.setTextColor(...BFS.noir);
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(7);
    doc.text('Délivré le ' + dateFr(titre.delivre_le), xV1 + 3, zBas - 6);
    doc.setFont('helvetica', 'normal');
    doc.text('Validité : ' + (org.validite_annees || 3) + ' ans — à recycler avant le '
      + dateFr(titre.recycler_avant), xV1 + 3, zBas - 2.5, { maxWidth: largeurVolet - 6 });
  }

  /* ---- Volet 2 : texte réglementaire AVIS ---- */
  const xc2 = xV2 + largeurVolet / 2;
  doc.setTextColor(...BFS.noir).setFont('helvetica', 'bold').setFontSize(9);
  doc.text('AVIS', xc2, zHaut + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(6);
  doc.text(
    'Le présent titre d\'habilitation est établi et signé par l\'employeur puis remis à l\'intéressé '
    + 'qui doit également le signer.\n'
    + 'Ce titre est strictement personnel et ne peut être utilisé par un tiers.\n'
    + 'Le titulaire doit être porteur de ce titre pendant les heures de travail ou le conserver à sa '
    + 'portée et être en mesure de le présenter sur demande motivée.\n'
    + 'Ce titre doit comporter les indications précises correspondant aux 3 caractères et à l\'attribut '
    + 'composant le symbole de chaque habilitation et celles relatives aux activités que le personnel '
    + 'sera autorisé à pratiquer.\n'
    + 'La rubrique « indications supplémentaires » doit obligatoirement être remplie.',
    xV2 + 3, zHaut + 12, { maxWidth: largeurVolet - 6, lineHeightFactor: 1.25 });

  /* ---- Volet 3 : logo, encadré titre, marque et téléphone du site ---- */
  const xc3 = xV3 + largeurVolet / 2;
  const largeurLogo = 26;
  doc.addImage(LOGO_BFS, 'PNG', xc3 - largeurLogo / 2, zHaut + 4, largeurLogo, largeurLogo * 119 / 222);
  const yEncadre = zHaut + 4 + largeurLogo * 119 / 222 + 5;
  doc.setDrawColor(...BFS.jaune).setLineWidth(0.5).rect(xV3 + 4, yEncadre, largeurVolet - 8, 16);
  doc.setTextColor(...BFS.noir).setFont('helvetica', 'bold').setFontSize(8.5);
  doc.text('TITRE D\'HABILITATION\nÉLECTRIQUE', xc3, yEncadre + 6, { align: 'center', lineHeightFactor: 1.15 });
  doc.setFont('helvetica', 'normal').setFontSize(7.5);
  doc.text('NF C18-510', xc3, yEncadre + 13.5, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(...BFS.gris);
  doc.text('N° ' + (titre.numero || '—'), xc3, yEncadre + 18.5, { align: 'center' });
  doc.setTextColor(...BFS.noir);
  // 2026-08-28 (demande de Jeremy) : encadré "TITRE D'HABILITATION
  // ÉLECTRIQUE" barré en diagonal en cas d'échec, cohérent avec les lignes
  // barrées du tableau Annexe C côté recto.
  if (echec) {
    doc.setDrawColor(...BFS.rouge).setLineWidth(0.6);
    doc.line(xV3 + 4, yEncadre, xV3 + 4 + (largeurVolet - 8), yEncadre + 16);
    doc.setLineWidth(0.2);
  }

  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...BFS.noir);
  doc.text(site.marque, xc3, yEncadre + 24, { align: 'center', maxWidth: largeurVolet - 6 });
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...BFS.gris);
  doc.text(site.tel, xc3, yEncadre + 29, { align: 'center' });

  // Nom de fichier commençant par le NOM du stagiaire (2026-08-28, demande de
  // Jeremy) : les pièces jointes de l'envoi secrétariat doivent se classer
  // par ordre alphabétique du stagiaire dans la boîte mail.
  const nomFichier = `${st.nom}_${st.prenom}_avis_habilitation.pdf`.replace(/\s+/g, '_');
  if (sauvegarder) {
    doc.save(nomFichier);
    toast('Titre et avis d\'habilitation générés');
    sauvegarderDocumentDrive(st.session_id, nomFichier, doc, session?.intitule);
  }
  return { doc, nomFichier, stagiaire: st };
}

/* ------------------- 2. (ancien avis défavorable, retiré) -----------
 * 2026-08-28 (demande de Jeremy) : genererAvisDefavorable produisait un
 * document de repli très sommaire, insuffisant pour justifier l'échec
 * auprès du client. Supprimé — le cas d'échec passe désormais par
 * genererTitrePdf ci-dessus (const echec), qui produit le même document
 * stylé qu'un titre validé, avec "Habilitation recommandée : aucune" et
 * les cases du titre barrées en diagonal. */

/* ------------------- 3. Procès-verbal de session -------------------- */
/* ------------------- 2 bis. Preuve d'examen (2026-08-28) ------------------
 * Document annexé à l'avis dans l'envoi secrétariat (demande de Jeremy) :
 * mêmes couleurs BFS que l'avis, un score théorique + le détail des
 * savoir-faire évalués en pratique (grille A/B/C/D, verbatim depuis
 * criteres_savoir_faire) PAR TITRE VISÉ, plus les préconisations du
 * formateur en cas d'échec. Construit avec autotable comme le reste du
 * fichier — pagination automatique, pas de gestion manuelle du débordement.
 * Cas particulier "formateur externe" (st.evaluation_externe) : pas de
 * détail par savoir-faire disponible (aucune évaluation Habelec), affiche
 * seulement le résultat théorique global saisi et le statut pratique par
 * titre coché "validé en pratique".
 * ========================================================================= */
async function construireDocPreuveExamen(stagiaireId) {
  const { data: st } = await sb.from('stagiaires')
    .select('*, stagiaire_symboles(symbole_code)').eq('id', stagiaireId).single();
  if (!st) throw new Error('Stagiaire introuvable');
  const symbolesStagiaire = (st.stagiaire_symboles || []).map(x => x.symbole_code);

  const [{ data: session }, { data: ep }, { data: resultats }] = await Promise.all([
    sb.from('sessions_formation').select('*').eq('id', st.session_id).single(),
    sb.from('epreuves_theoriques').select('*').eq('stagiaire_id', stagiaireId).maybeSingle(),
    sb.from('resultats_symbole').select('*').eq('stagiaire_id', stagiaireId),
  ]);
  const preconisationParSymbole = Object.fromEntries(
    (resultats || []).filter(r => r.preconisation).map(r => [r.symbole_code, r.preconisation]));
  const pratiqueOkParSymbole = Object.fromEntries((resultats || []).map(r => [r.symbole_code, r.pratique_ok]));

  const ev = st.evaluation_externe || null;
  const gabaritsVises = ep?.gabarits || [];
  let titresData = [];

  if (ev) {
    titresData = symbolesStagiaire.map(sym => ({
      libelle: libelleSymbole(sym),
      theorie: { texte: `${ev.note ?? '—'}/${ev.total ?? '—'}${ev.taux != null ? ` (${ev.taux} %)` : ''}`,
        ok: ev.theorique_validee !== false },
      pratique: null,
      pratiqueVerdict: pratiqueOkParSymbole[sym],
      preconisation: preconisationParSymbole[sym] || null,
    }));
  } else {
    const [detailsTheorie, { data: pratiques }] = await Promise.all([
      Promise.all(gabaritsVises.map(g =>
        rpc('theorie_gabarit_detail', { p_epreuve_id: ep.id, p_gabarit_code: g }).catch(() => null))),
      gabaritsVises.length
        ? sb.from('epreuves_pratiques')
            .select(`gabarit_code, reussie, mises_en_situation(id, numero,
                       evaluations_savoir_faire(note,
                         gabarit_savoir_faire(position, criteres_savoir_faire(code, libelle))))`)
            .eq('stagiaire_id', stagiaireId).in('gabarit_code', gabaritsVises)
        : Promise.resolve({ data: [] }),
    ]);
    const detailParGabarit = Object.fromEntries(gabaritsVises.map((g, i) => [g, detailsTheorie[i]]));
    const pratiqueParGabarit = Object.fromEntries((pratiques || []).map(p => [p.gabarit_code, p]));
    const fondNormeParGabarit = Object.fromEntries(gabaritsVises.map(g => [g,
      (S.referentiel?.quotas || [])
        .filter(q => q.gabarit_code === g)
        .reduce((somme, q) => somme + (q.nb_fondamentales || 0), 0)]));

    titresData = gabaritsVises.map(g => {
      const d = detailParGabarit[g];
      const p = pratiqueParGabarit[g];
      const refFond = fondNormeParGabarit[g] || 0;
      const symbolesVises = symbolesStagiaire
        .filter(sym => (S.referentiel.gabaritsParSymbole[sym] || []).includes(g));
      const libelleTitre = symbolesVises.length
        ? symbolesVises.map(libelleSymbole).join(' / ') : libelleGabarit(g);

      // Mise en situation retenue pour le détail affiché : la plus récente
      // qui comporte au moins une évaluation notée (même principe que
      // l'écran pratique — miseComplete()/miseConforme() dans HE_pratique.js).
      const mises = (p?.mises_en_situation || []).slice().sort((a, b) => b.numero - a.numero);
      const miseRetenue = mises.find(m => (m.evaluations_savoir_faire || []).some(e => e.note)) || null;
      const items = miseRetenue
        ? miseRetenue.evaluations_savoir_faire
            .filter(e => e.note && e.gabarit_savoir_faire?.criteres_savoir_faire)
            .sort((a, b) => a.gabarit_savoir_faire.position - b.gabarit_savoir_faire.position)
            .map(e => ({ libelle: e.gabarit_savoir_faire.criteres_savoir_faire.libelle, note: e.note }))
        : null;

      return {
        libelle: libelleTitre,
        theorie: d ? { texte: `${d.justes}/${d.total} (${d.taux} %)`, ok: d.ok,
          fond: refFond === 0 ? 'aucune exigée' : `${d.fond_justes}/${refFond}`, fondOk: d.fond_ok } : null,
        pratique: items,
        pratiqueVerdict: p?.reussie,
        preconisation: symbolesVises.map(sym => preconisationParSymbole[sym]).find(Boolean) || null,
      };
    });
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const largeur = 210, marge = 15, largeurUtile = largeur - 2 * marge;
  const NOTE_COULEUR = { A: BFS.vert, B: BFS.vert, C: [201, 122, 22], D: BFS.rouge };
  const NOTE_LIBELLE = { A: 'Sans erreur', B: 'Erreur acceptable', C: 'Erreur majeure', D: 'Erreur grave' };
  let y = marge;

  doc.addImage(LOGO_BFS, 'PNG', marge, y - 3, 20, 20 * 119 / 222);
  doc.setTextColor(...BFS.noir).setFont('helvetica', 'bold').setFontSize(15);
  doc.text('PREUVE D\'EXAMEN — HABILITATION ÉLECTRIQUE', largeur / 2, y, { align: 'center' });
  y += 3;
  doc.setDrawColor(...BFS.jaune).setLineWidth(0.8).line(largeur / 2 - 30, y, largeur / 2 + 30, y);
  doc.setLineWidth(0.2);
  y += 5;
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...BFS.gris);
  doc.text('Session : ' + (session?.intitule || ''), largeur / 2, y, { align: 'center' });
  y += 4;
  doc.setFontSize(7.5);
  doc.text('Document annexé à l\'avis d\'habilitation — NF C18-510', largeur / 2, y, { align: 'center' });
  y += 8;

  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold' } },
    body: [
      ['ENTREPRISE', st.entreprise || session?.entreprise || '—'],
      ['CANDIDAT', `${st.nom || ''} ${st.prenom || ''}`.trim()],
      ['FORMATEUR', S.profil ? `${S.profil.nom || ''} ${S.profil.prenom || ''}`.trim() : '—'],
    ],
  });
  y = doc.lastAutoTable.finalY + 4;

  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.8, valign: 'middle' },
    headStyles: { fillColor: BFS.jaune, textColor: BFS.noir, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: largeurUtile * 0.34 },
      1: { cellWidth: largeurUtile * 0.33, halign: 'center' },
      2: { cellWidth: largeurUtile * 0.33, halign: 'center' },
    },
    head: [[
      { content: 'TEST THÉORIQUE', styles: { halign: 'left' } },
      { content: 'Résultat', styles: { halign: 'center' } },
      { content: 'Questions fondamentales', styles: { halign: 'center' } },
    ]],
    body: titresData.map(t => {
      const cellule = (texte, couleur) => couleur
        ? { content: texte, styles: { textColor: couleur, fontStyle: 'bold' } } : texte;
      return [
        t.libelle,
        t.theorie ? cellule(t.theorie.texte, t.theorie.ok ? BFS.vert : BFS.rouge) : '—',
        t.theorie?.fond ? cellule(t.theorie.fond, t.theorie.fondOk ? BFS.vert : BFS.rouge)
          : (t.theorie ? '—' : ''),
      ];
    }),
  });
  y = doc.lastAutoTable.finalY + 4;

  // Détail pratique : une section par titre (ligne pleine largeur, fond gris)
  // suivie de ses items de savoir-faire (2 colonnes) — autotable gère la
  // pagination automatiquement si ça dépasse une page.
  const corpsPratique = [];
  titresData.forEach(t => {
    corpsPratique.push([{
      content: t.libelle
        + (t.pratique === null && t.pratiqueVerdict === undefined ? '' : ''),
      colSpan: 2,
      styles: { fillColor: BFS.grisClair, fontStyle: 'bold', textColor: BFS.noir },
    }]);
    if (t.pratique === null) {
      // Cas formateur externe (pas de détail) ou pratique pas encore réalisée
      const texte = t.pratiqueVerdict === true ? 'Validée'
        : t.pratiqueVerdict === false ? 'Non validée' : 'En attente';
      const couleur = t.pratiqueVerdict === true ? BFS.vert
        : t.pratiqueVerdict === false ? BFS.rouge : BFS.gris;
      corpsPratique.push(['—', { content: texte, styles: { textColor: couleur, fontStyle: 'bold', halign: 'right' } }]);
    } else if (!t.pratique.length) {
      corpsPratique.push([{ content: 'Aucune évaluation enregistrée', colSpan: 2,
        styles: { textColor: BFS.gris, fontStyle: 'italic' } }]);
    } else {
      t.pratique.forEach(item => {
        corpsPratique.push([item.libelle,
          { content: `${item.note} — ${NOTE_LIBELLE[item.note]}`,
            styles: { textColor: NOTE_COULEUR[item.note], fontStyle: 'bold', halign: 'right' } }]);
      });
    }
  });
  doc.autoTable({
    startY: y, margin: { left: marge, right: marge }, theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.8, valign: 'middle' },
    headStyles: { fillColor: BFS.jaune, textColor: BFS.noir, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: largeurUtile * 0.7 }, 1: { cellWidth: largeurUtile * 0.3 } },
    head: [[
      { content: 'TEST PRATIQUE', styles: { halign: 'left' } },
      { content: 'A sans erreur · B mineure · C majeure · D grave', styles: { halign: 'right', fontSize: 6.5 } },
    ]],
    body: corpsPratique,
  });
  y = doc.lastAutoTable.finalY + 4;

  const titresAvecPreconisation = titresData.filter(t => t.preconisation);
  if (titresAvecPreconisation.length) {
    doc.autoTable({
      startY: y, margin: { left: marge, right: marge }, theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.2, valign: 'top' },
      headStyles: { fillColor: BFS.rouge, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: largeurUtile * 0.25, fontStyle: 'bold', textColor: BFS.rouge },
        1: { cellWidth: largeurUtile * 0.75 } },
      head: [['PRÉCONISATION(S) DU FORMATEUR', '']],
      body: titresAvecPreconisation.map(t => [t.libelle, t.preconisation]),
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  // Bandeau final : nombre de titres validés (théorie ET pratique) sur le total.
  const valides = titresData.filter(t => t.theorie?.ok && t.pratiqueVerdict === true).length;
  const total = titresData.length;
  const [couleurBandeau, texteBandeau] = valides === total
    ? [BFS.vert, `${valides}/${total} TITRE(S) VALIDÉ(S)`]
    : valides === 0
      ? [BFS.rouge, 'AUCUN TITRE VALIDÉ']
      : [[201, 122, 22], `${valides}/${total} TITRE(S) VALIDÉ(S) — VOIR PRÉCONISATION(S) CI-DESSUS`];
  doc.setFillColor(...couleurBandeau);
  doc.rect(marge, y, largeurUtile, 12, 'F');
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(11);
  doc.text(texteBandeau, largeur / 2, y + 7.5, { align: 'center' });

  const nomFichier = `${st.nom}_${st.prenom}_preuve_examen.pdf`.replace(/\s+/g, '_');
  return { doc, nomFichier, stagiaire: st, session };
}

async function genererPreuveExamenPdf(stagiaireId, { sauvegarder = true } = {}) {
  const { doc, nomFichier, stagiaire, session } = await construireDocPreuveExamen(stagiaireId);
  if (sauvegarder) {
    doc.save(nomFichier);
    toast('Preuve d\'examen générée');
    sauvegarderDocumentDrive(stagiaire?.session_id, nomFichier, doc, session?.intitule);
  }
  return { doc, nomFichier };
}

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
