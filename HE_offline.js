/* =====================================================================
   HE_offline.js — mode hors-ligne pour l'évaluation pratique (2026-08)

   Périmètre volontairement limité à l'écran pratique (mises en situation) :
   c'est le seul endroit où un formateur peut se retrouver en salle/atelier
   sans réseau fiable. La passation QCM, la banque de questions, les autres
   écrans formateur restent en ligne uniquement.

   Principe :
   - Chaque lecture réussie de l'écran pratique (rendrePratique, en ligne)
     sauvegarde son résultat dans le stockage local (MEM, préfixé habelec_,
     voir HE_core.js). C'est ce cache qui sert de source si le réseau tombe
     ensuite, ou si l'écran est rouvert alors qu'on est déjà hors-ligne.
   - Toute écriture faite hors-ligne (note, commentaire, observations,
     scénario, ajout de mise en situation, clôture d'épreuve) : (1) met à
     jour le cache local tout de suite pour que l'écran reste réactif, et
     (2) part dans une file d'attente rejouée automatiquement au retour du
     réseau (événement 'online' + relance périodique, au cas où l'événement
     ne se déclenche pas sur un réseau instable plutôt que franchement coupé).
   - Avant de rejouer une écriture, on relit la valeur actuelle en base et on
     la compare à celle connue au moment de la modification hors-ligne. Si
     elle a changé entre-temps (un autre formateur a modifié la même ligne),
     on bloque CETTE écriture précise (pas les autres, indépendantes) et on
     alerte le formateur au lieu d'écraser silencieusement.

   Ne dépend d'aucune nouvelle colonne SQL : la détection de conflit compare
   simplement l'ancienne et la nouvelle valeur du champ concerné.
   ===================================================================== */

const HorsLigne = (() => {
  const CLE_FILE = 'hl_file_attente';
  const CLE_CONFLITS = 'hl_conflits';
  const CLE_SNAPSHOT = stagiaireId => 'hl_snapshot_' + stagiaireId;

  let banniere = null;
  let synchroEnCours = false;

  /* --------------------------- cache de lecture --------------------- */
  function lireSnapshot(stagiaireId) {
    return MEM.lire(CLE_SNAPSHOT(stagiaireId), null);
  }
  function enregistrerSnapshot(stagiaireId, donnees) {
    MEM.ecrire(CLE_SNAPSHOT(stagiaireId), { ...donnees, horodatage: Date.now() });
  }

  /* ---------------------------- file d'attente ------------------------ */
  function fileEnAttente() { return MEM.lire(CLE_FILE, []); }
  function ecrireFile(f) { MEM.ecrire(CLE_FILE, f); majBanniere(); }
  function conflitsEnAttente() { return MEM.lire(CLE_CONFLITS, []); }
  function ecrireConflits(c) { MEM.ecrire(CLE_CONFLITS, c); majBanniere(); }

  function mettreEnFile(item) {
    const file = fileEnAttente();
    file.push({ id: crypto.randomUUID(), horodatage: Date.now(), ...item });
    ecrireFile(file);
  }

  /**
   * Écrit un champ hors-ligne : met à jour le cache (via `appliquer`, qui
   * modifie l'objet snapshot en mémoire — muter directement, pas de copie)
   * et empile l'écriture réelle pour la synchronisation.
   *
   * @param table        table Supabase visée
   * @param pk           id de la ligne
   * @param champs       { colonne: nouvelle valeur }
   * @param valeurAvant  { colonne: valeur connue avant la modif } — sert à
   *                     détecter un conflit au moment de la synchro
   * @param libelle      texte humain pour la liste d'attente / les conflits
   * @param stagiaireId  pour rafraîchir le bon écran après synchro
   */
  function ecrireChamp({ table, pk, champs, valeurAvant, libelle, stagiaireId }) {
    mettreEnFile({ type: 'update', table, pk, champs, valeurAvant, libelle, stagiaireId });
  }

  function inserer({ table, lignes, libelle, stagiaireId }) {
    mettreEnFile({ type: 'insert', table, lignes, libelle, stagiaireId });
  }

  function appellerRpc({ nomRpc, params, libelle, stagiaireId }) {
    mettreEnFile({ type: 'rpc', nomRpc, params, libelle, stagiaireId });
  }

  /* ------------------------------ synchro ------------------------------ */
  async function synchroniser() {
    if (!navigator.onLine || synchroEnCours) return;
    const file = fileEnAttente();
    if (!file.length) return;
    synchroEnCours = true;
    majBanniere();

    const conflits = conflitsEnAttente();
    const idsConflit = new Set(conflits.map(c => c.id));
    const restante = [];
    let traitees = 0;
    const stagiairesTouches = new Set();

    for (const item of file) {
      if (idsConflit.has(item.id)) { restante.push(item); continue; }
      try {
        if (item.type === 'update') {
          const colonnes = Object.keys(item.champs).join(',');
          const { data: actuel, error: erreurLecture } = await sb
            .from(item.table).select(colonnes).eq('id', item.pk).maybeSingle();
          if (erreurLecture) throw erreurLecture;
          const conflit = actuel && Object.keys(item.valeurAvant).some(
            k => (actuel[k] ?? null) !== (item.valeurAvant[k] ?? null));
          if (conflit) {
            conflits.push({ ...item, valeurServeur: actuel });
            idsConflit.add(item.id);
            restante.push(item);
            continue;
          }
          const { error } = await sb.from(item.table).update(item.champs).eq('id', item.pk);
          if (error) throw error;
        } else if (item.type === 'insert') {
          const { error } = await sb.from(item.table).insert(item.lignes);
          // Une ligne déjà présente (rejouée deux fois, ex. synchro interrompue
          // après écriture mais avant mise à jour de la file) n'est pas une
          // vraie erreur — l'id est généré côté client, donc stable.
          if (error && error.code !== '23505') throw error;
        } else if (item.type === 'rpc') {
          await rpc(item.nomRpc, item.params);
        }
        traitees++;
        if (item.stagiaireId) stagiairesTouches.add(item.stagiaireId);
      } catch (e) {
        // Coupure réseau ou erreur serveur en cours de synchro : on arrête là,
        // le reste (y compris cet item) sera retenté au prochain passage.
        restante.push(item, ...file.slice(file.indexOf(item) + 1));
        ecrireFile(restante);
        ecrireConflits(conflits);
        synchroEnCours = false;
        majBanniere();
        if (traitees) toast(`${traitees} modification(s) synchronisée(s) avant l'interruption`, 'ok');
        return;
      }
    }

    ecrireFile(restante);
    ecrireConflits(conflits);
    synchroEnCours = false;

    if (traitees) toast(`${traitees} modification(s) synchronisée(s)`, 'ok');
    if (conflits.length) alerterConflits(conflits);

    // Les écrans concernés affichaient peut-être encore les données de leur
    // cache local (dont la clôture d'épreuve provisoire) : on les invalide
    // pour forcer une relecture propre depuis le serveur au prochain rendu.
    stagiairesTouches.forEach(id => MEM.effacer(CLE_SNAPSHOT(id)));
    if (S.ecran === 'pratique' && S.stagiaire && stagiairesTouches.has(S.stagiaire.id)) {
      rendrePratique($('#contenu'));
    }
    majBanniere();
  }

  /* --------------------------- résolution de conflit -------------------- */
  function alerterConflits(conflits) {
    toast(`${conflits.length} modification(s) hors-ligne en conflit avec le serveur — `
      + 'à résoudre avant de continuer (bandeau en haut de l\'écran)', 'erreur', 10000);
  }

  function voirConflits() {
    const conflits = conflitsEnAttente();
    if (!conflits.length) return;
    ouvrirModale('Conflits hors-ligne à résoudre', `
      <p class="aide">Ces modifications faites hors-ligne ne correspondent plus à l'état actuel du
        serveur — quelqu'un d'autre a modifié la même donnée entre-temps. Choisis, pour chacune,
        la version à garder.</p>
      <ul class="conflits-hl">
        ${conflits.map(c => `
          <li>
            <div><b>${esc(c.libelle || 'Modification')}</b></div>
            <div class="aide">Ta version (hors-ligne) : ${esc(JSON.stringify(c.champs))}</div>
            <div class="aide">Version actuelle du serveur : ${esc(JSON.stringify(c.valeurServeur || {}))}</div>
            <div class="actions-conflit">
              <button onclick="HorsLigne.resoudreConflit('${c.id}', 'local')">Garder ma version</button>
              <button class="lien" onclick="HorsLigne.resoudreConflit('${c.id}', 'serveur')">Garder le serveur</button>
            </div>
          </li>`).join('')}
      </ul>
      <div class="pied-modale"><button onclick="fermerModale()">Fermer</button></div>`);
  }

  async function resoudreConflit(idConflit, choix) {
    const conflits = conflitsEnAttente();
    const c = conflits.find(x => x.id === idConflit);
    if (!c) return;

    // L'écriture d'origine (bloquée dans la file par synchroniser()) doit
    // être retirée dans tous les cas — sans ça, elle serait rejouée telle
    // quelle au prochain passage, avec son ancienne valeurAvant désormais
    // périmée, et recréerait aussitôt un (faux) conflit.
    const file = fileEnAttente().filter(item => item.id !== idConflit);

    if (choix === 'local') {
      // On force l'écriture : on remplace la valeur "avant" connue par la
      // valeur serveur actuelle, pour que la prochaine synchro n'y voie plus
      // de conflit, puis on la remet dans la file normale.
      const { valeurServeur, ...reste } = c;
      file.push({ ...reste, id: crypto.randomUUID(), valeurAvant: valeurServeur || {} });
    }
    // choix === 'serveur' : on abandonne simplement notre écriture locale.
    ecrireFile(file);

    ecrireConflits(conflits.filter(x => x.id !== idConflit));
    fermerModale();
    if (choix === 'local') await synchroniser();
    else toast('Modification hors-ligne abandonnée, version du serveur conservée', 'ok');
  }

  /* ------------------------------ bandeau ------------------------------- */
  function majBanniere() {
    if (!banniere) return;
    const enLigne = navigator.onLine;
    const nFile = fileEnAttente().length;
    const nConflits = conflitsEnAttente().length;

    if (enLigne && !nFile && !nConflits) { banniere.hidden = true; return; }
    banniere.hidden = false;

    if (nConflits) {
      banniere.className = 'bandeau-hors-ligne conflit';
      banniere.innerHTML = `⚠ ${nConflits} conflit(s) hors-ligne à résoudre
        <button class="lien" onclick="HorsLigne.voirConflits()">Voir</button>`;
    } else if (!enLigne) {
      banniere.className = 'bandeau-hors-ligne';
      banniere.textContent = nFile
        ? `📴 Hors connexion — ${nFile} modification(s) en attente de synchronisation`
        : '📴 Hors connexion — les grilles pratiques déjà ouvertes restent utilisables';
    } else if (synchroEnCours) {
      banniere.className = 'bandeau-hors-ligne synchro';
      banniere.textContent = '🔄 Synchronisation en cours…';
    } else {
      banniere.className = 'bandeau-hors-ligne synchro';
      banniere.innerHTML = `🔄 ${nFile} modification(s) en attente
        <button class="lien" onclick="HorsLigne.synchroniser()">Synchroniser maintenant</button>`;
    }
  }

  /* ------------------------------ démarrage ------------------------------ */
  function init() {
    banniere = document.createElement('div');
    banniere.id = 'bandeau-hors-ligne';
    banniere.hidden = true;
    document.body.prepend(banniere);

    window.addEventListener('online', () => { majBanniere(); synchroniser(); });
    window.addEventListener('offline', majBanniere);
    // Filet de sécurité : sur un réseau instable (ni franchement coupé, ni
    // franchement rétabli), les événements online/offline ne se déclenchent
    // pas toujours de façon fiable — on retente périodiquement.
    setInterval(() => { if (navigator.onLine) synchroniser(); }, 30000);

    majBanniere();
  }

  return {
    init, lireSnapshot, enregistrerSnapshot,
    ecrireChamp, inserer, appellerRpc,
    synchroniser, fileEnAttente, conflitsEnAttente,
    voirConflits, resoudreConflit, majBanniere,
  };
})();
