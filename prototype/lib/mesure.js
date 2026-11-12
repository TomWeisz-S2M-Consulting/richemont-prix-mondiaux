// Mesure : poussée d'événements dans dataLayer (fonctionne aussi dans Node).
// Noms : r3b_reserver_clic, r3b_prix_public_affiche, r3b_estimation_affichee,
// r3b_aiguillage_immocrans, r3b_demande_envoyee, r3b_doublon_bloque, r3b_brouillon_bloque.
export function evenement(nom, donnees = {}) {
  if (!Array.isArray(globalThis.dataLayer)) globalThis.dataLayer = [];
  const e = { event: nom, ...donnees, ts: Date.now() };
  globalThis.dataLayer.push(e);
  return e;
}
