# Richemont 3B · Le bon prix pour chaque date, et la preuve derrière

Exercice pratique, 2e tour « Digital Projects & AI Assistant », Stonks Holding AG · candidat **Tom Weisz** · novembre 2026.
Prototype autonome (HTML, CSS, JavaScript, zéro dépendance, zéro clé, données publiques figées et datées ou synthétiques étiquetées). Démo en ligne : https://s2mvision.fr/d/tw-richemont3b/ · Vidéo (2 min 32, sous-titres activables) : https://s2mvision.fr/d/tw-richemont3b-video/

La voix de la vidéo est une voix de synthèse (IA).

Les trois exercices (Richemont 3B, Cassa, MénageSimple), la même méthode : https://s2mvision.fr/d/tw-presentation/.

**En 5 lignes.**
1. Problème : Richemont 3B affiche un seul prix public, un plancher à plat (« dès CHF 1'960 / semaine », 280 CHF/nuit), alors que le marché public va de 130 CHF/nuit en novembre à 465 pendant les Mondiaux de ski FIS 2027 ; les deux prix Airbnb lisibles de l'appartement (216 et 269 CHF/nuit) ne suivent pas non plus ces écarts, et aucun prix n'est relié à une preuve.
2. Démo : un calendrier de prix sur 11 périodes, bornes basse / cible / haute calculées sur des annonces comparables publiques relevées le 05/11/2026, une **décision par période** (monter à la cible, ou garder le plancher quand le marché est en dessous), canal et net hôte, « donnée insuffisante » quand il manque des annonces ; l'encart « Réserver » affiche le prix retenu avec sa preuve.
3. Chiffre : aux Mondiaux, louer 6 nuits sur 10 à CHF 465 rapporte autant que toutes les nuits à 280 ; trois scénarios de demande à hypothèses nommées, et la liste de ce qui les invaliderait.
4. Preuve : une fiche de vérité sourcée et un vérificateur de faits (5 langues) qui contrôle tout texte sortant, prix compris, y compris ses propres sorties.
5. Test : `npm test` (157 tests, aucune installation), 38 contrôles de bout en bout ; captures des annonces tierces conservées hors dépôt, empreintes SHA-256 dans le JSON.

**English summary.** Richemont 3B is a single holiday flat in Crans-Montana. Its only public price is a flat floor ("from CHF 1,960/week", i.e. 280/night) while the public market ranges from 130/night in November to 465 during the 2027 FIS Alpine World Ski Championships. This prototype builds a **recommended price calendar** over 11 periods from a frozen, dated survey of comparable public listings (88 Airbnb listings, 12 ImmoCrans listings, 05/11/2026): low / target / high bounds (quartiles), recommended channel and host net, "insufficient data" where fewer than 5 listings exist, and a break-even figure (during the Championships, renting 6 nights out of 10 at CHF 465 equals 10 nights at 280) with three scenarios whose assumptions are all named, plus what would invalidate them. The booking panel shows the retained price with its evidence. The single sourced "truth sheet" and the deterministic **fact checker** (five languages, prices included) remain the foundation. No LLM call by default. Each period carries a decision: raise to the market target, or keep the public floor when the market sits below it. `npm test` runs 157 tests with no install; 38 end-to-end checks with Playwright.

## Lancer et tester (une commande chacune, aucune installation)
```
npm test          # 157 tests : prix (quartiles, périodes, séjours), gain, iCal, demandes, vérificateur (corpus figé, textes réels, 5 langues, sondage de cassage, prix par période), FAQ, canaux
npm start         # http://localhost:8080/  (python3 -m http.server, les modules ES exigent http://)
npm run test:tz   # même suite sous America/Los_Angeles puis Pacific/Auckland
npm run e2e       # 38 contrôles de bout en bout (Playwright) ; sans Playwright ni navigateur : « ignoré », sortie 0
node tests/mesurer-scene.mjs  # dégagement crête / boutons et axe du pic, WebGL et repli, 1280 et 390 (captures/apres/mesures-degagement.txt)
npm run captures  # 59 captures 1280 et 390 px dans captures/apres/ (Chrome sans écran, WebGL logiciel SwiftShader : scène réellement rendue ; tracé de la crête à t0 / 0,5 / 1,5 / 3 s, défilement, premier clic, mouvement réduit, chaque vue)
```
Sans npm : `node --test "tests/*.test.js"` et `python3 -m http.server 8080 --directory prototype`.

## Le problème (constaté le 05/11/2026, lecture publique seulement)
- https://richemont3b.ch : site en 5 langues ; le bouton « Réserver » ouvre trois liens sortants, sans prix ni dates (`captures/avant/`).
- Seul prix public : « à partir de CHF 1'960.-/semaine » (ImmoCrans, 7 nuits et plus, charges, linge, internet et garage compris), soit 280 CHF/nuit, un plancher sans saison. Sur Airbnb, l'appartement affiche 1'512 CHF pour 7 nuits mi-décembre (216/nuit) et 1'884 CHF fin mars (269/nuit) ; les autres périodes, dont les Mondiaux, sont « non disponibles » (réservé, bloqué ou fermé : indistinguable) : **le prix de l'hôte pendant les Mondiaux n'est pas lisible**, le dossier ne le devine pas.
- Le marché, lui, bouge (relevé public du 05/11/2026, 15 annonces Airbnb de la station par période, 4 adultes, total ÷ nuits) :

| Période (7 nuits, 4 adultes) | Annonces à 2 chambres | basse / cible / haute (CHF/nuit) |
|---|---|---|
| Automne 2026 (14-21 nov.) | 9 | 125 / 130 / 130 |
| Préouverture ski (12-19 déc.) | 12 | 140 / 155 / 205 |
| Fêtes (26 déc.-2 janv.) | 14 | 300 / 390 / 435 |
| **Mondiaux de ski FIS 2027** (6-13 févr.) | 7 | **455 / 465 / 500** |
| Février hors Mondiaux (20-27 févr.) | 10 | 225 / 265 / 305 |
| Fin de saison (20-27 mars) | 10 | 160 / 195 / 225 |
| Été (17-24 juil.) | 10 | 195 / 210 / 225 |
| Omega European Masters 2027 (2-6 sept., 4 nuits) | 9 | 195 / 230 / 255 |
| Janvier, printemps, automne 2027 | 0 | **donnée insuffisante** |

Prix demandés par des annonces encore libres le 05/11 ; les annonces déjà réservées, souvent les mieux placées, ne sont pas visibles. Capacité et garage des annonces Airbnb non lisibles : « 2 chambres » sert de proxy, dit comme tel.

## Ce que fait le prototype (`prototype/`)
1. **Accueil** : une scène de nuit en code (shader WebGL, `prototype/scene.js`) : la montagne de Crans-Montana en lignes de niveau, dont la crête EST le calendrier des prix (une période par pas, hauteur = prix cible de `lib/prix.js calendrier()`) ; le pic des Mondiaux 2027 s'allume en or « CHF 465 · par nuit » quand le tracé l'atteint (`captures/apres/accueil-t3000-1280.png`, `-390.png`). Repli sans WebGL : `img/nuit.webp` (1280) et `img/nuit-390.webp` (mobile, servie par `<picture>`), rendues par le même shader (`captures/apres/repli-1280.png`, `repli-390.png`) ; la crête reste à 16 px au moins de chaque bouton et texte, sommet et étiquette alignés (`node tests/mesurer-scene.mjs`, `captures/apres/mesures-degagement.txt`) ; mouvement réduit : image finale immédiate. Au premier défilement (`accueil-defile-1280.png`), le graphe : une barre par période sur l'axe du temps (largeur = durée, hauteur = cible), Mondiaux 2027 · CHF 465 en or, plancher public 280 en pointillé, périodes insuffisantes en cadre pointillé ; à droite, le rail de chiffres de la fiche et la carte « La preuve derrière » (titre Airbnb « 3 chambres » contredit par la fiche). Clic sur une barre = calendrier ouvert sur la période. Typographie du site (Source Serif 4, Manrope), polices auto-hébergées.
2. **Calendrier de prix recommandé** (vue hôte, FR/EN) : premier écran en trois lignes (la phrase des Mondiaux, puis « 2 périodes à monter, 6 à garder, 3 sans donnée »), 11 périodes avec dates sourcées (Mondiaux https://www.cransmontana2027.ch/ ; remontées mécaniques : ouverture 19/12/2026, fermeture 04/04/2027 ; OEM 2027 ; vacances scolaires), nuits minimales (hypothèse), barre basse–haute et cible sur une échelle commune, le trait du plancher public 280, les deux prix Airbnb lus de l'appartement, **deux lignes partout : prix voyageur et net hôte** (commissions en paramètres), n annonces et date du relevé, l'étendue réelle du relevé (« 7 nuits sur 14 » pour les Mondiaux), le biais dit dans la légende, « donnée insuffisante : aucune annonce relevée pour ces dates, il en faut 5 » là où c'est le cas. Détail par période : les annonces (titre, lien, total lu, nuit, avis ou « sans avis », capture vérifiée ou partielle, empreinte SHA-256 de la page de résultats), les bornes **sans les annonces sans avis** (sensibilité), le canal recommandé (ImmoCrans dès 7 nuits : proposition à l'agence ; plateformes pour les courts séjours ; direct quand la demande vient du site) et le net hôte par canal, la source de la période.
3. **Gain** : seuil d'occupation d'équivalence par période (Mondiaux : 60 %, même seuil en brut et en net), trois scénarios de **demande** (faible / moyenne / forte : un scénario décrit la demande posée, pas le gain) de revenu **net hôte** par saison, base (280 à plat) contre prix retenus (monter aux fêtes et aux Mondiaux, garder 280 ailleurs : aucune période ne perd par construction ; « suivre le marché partout, baisses comprises » affiché pour mémoire), **19 hypothèses visibles et modifiables** (`data/hypotheses.json`, toutes étiquetées [H] = posée, non mesurée), « sensibilité au prix : non mesurée », et **8 points qui invalideraient ces chiffres**, toujours visibles. Les écarts négatifs s'affichent tels quels.
4. **Boutons** : « Utiliser ces prix dans le panneau » (prix retenu par période, décision par défaut, modifiable : le gain et la proposition suivent), « Copier la proposition pour ImmoCrans » (texte prêt pour l'agence : période, dates, prix voyageur, net estimé, n annonces, date).
5. **Panneau Réserver** (visiteur, 5 langues) : pour un séjour de 7 nuits et plus (ImmoCrans), « prix public dès CHF 1'960 / semaine » et le repère marché « CHF 3'255 (7 nuits à 465), à confirmer par l'agence » (aucun prix non validé n'est vendu) ; pour un court séjour en direct, « CHF 795 pour 3 nuits · CHF 265 / nuit » avec sa preuve ; « prix sur demande » en période insuffisante ; nuits libres lues dans un iCal **synthétique au format d'export Airbnb** (étiqueté) ; trois canaux gardés, aiguillage 7 nuits et plus → ImmoCrans ; demande directe relue avant envoi, **dédupliquée** (même e-mail + mêmes dates = une seule demande) ; FAQ sourcée (8 × 5 langues, contrôlée par le vérificateur).
6. **Vérifier un texte** : tout texte (réponse à l'invité, annonce, FAQ) est contrôlé contre la fiche de vérité : chambres, surface, personnes, étage, équipements, lieux, distances, **prix avec unité et période** (« 700 CHF la nuit du 6 au 13 février 2027 » → hors bornes 455 – 500 : précision ; « 465 CHF la semaine » → 66/nuit : hors bornes ; « 1'960 par semaine » → prix plancher public) ; contredit et absent bloquent, précision n'empêche pas l'envoi ; texte corrigé proposé.
7. **Fiche de vérité** : chaque champ avec source, date, extrait HTML ; les quatre canaux côte à côte, cellules calculées depuis 23 extraits réels (le `<title>` Airbnb dit « 3 chambres », l'`og:title` de la même page dit « 2 »).

## Résultats des tests (05/11/2026)
- `npm test` : 157 tests verts, aussi sous deux fuseaux ; `npm run e2e` : 38 contrôles verts (Chrome ; journal complet, un contrôle par ligne, dans `captures/apres/e2e-journal.txt`) ; `npx impeccable detect prototype --no-config` : 2 constats, tous deux voulus (fond papier #f3f0e8, celui de richemont3b.ch, documenté en tête de `style.css` ; `overflow-x` coupé sur `body`, garde contre tout débordement à 390 px).
- Prix : quartiles « type 7 » recalculés à la main (Mondiaux 455 / 465 / 500, n = 7 ; sans les 3 annonces sans avis : 425 / 490 / 555, n = 4) ; chaque date de l'horizon dans exactement une période ; aucune borne affichée sans `annonces.length ≥ 5` ; aucun chiffre dans les périodes insuffisantes ; séjour à cheval 8 → 17 février = 7 × 465 + 2 × 265 = 3'785 ; seuil net Mondiaux 0,60 (ImmoCrans des deux côtés), 0,57 si la cible passe par Airbnb ; décision : monter aux fêtes et aux Mondiaux, garder 280 sur 6 périodes, aucune sur 3 ; gain net hiver : +975 / +1'344 / +1'742 selon la demande posée, été 0.
- Vérificateur : corpus figé avant le code (SHA-256 dans `prototype/data/CORPUS-SHA256.txt`) : pièges bloqués 10/10, faux blocages 0/10, brouillons LLM bruts bloqués 1/5 ; textes réels des 4 canaux : aucun blocage hors « 3 chambres » ; DE/IT/RU 15/15 et 9/9 ; **sondage de cassage post-gel** (67 phrases écrites après le code pour le casser, dont 34 par un relecteur adverse) : 67/67, tout raté devrait y être déclaré ; 20 pièges d'unité nuit / semaine en 5 langues ; le texte même du panneau (« CHF 3'255 pour 7 nuits · CHF 465 / nuit ») et la proposition ImmoCrans passent le vérificateur ; « 280 la nuit aux Mondiaux » ressort en précision (plancher hors bornes).
- Preuves du relevé : 100 totaux sur 140 relus à l'identique sur captures pleine page le soir même, 40 annonces absentes au 2e passage (marquées « capture partielle »), 0 écart ; frais de ménage et de service : **non isolables** sur Airbnb Suisse (intégrés au prix par nuit, relevé sur 6 annonces) ; règle retenue : total Airbnb et « dès 1'960 » ImmoCrans sont tous deux des prix voyageur, le net hôte = prix voyageur × (1 − commission). Captures conservées **hors dépôt** (photos d'annonces tierces : dossier ignoré par git, historique purgé), empreintes SHA-256 dans `data/comparables.json`.

## Place de l'IA, vérification humaine, temps
- `journal-ia-verification.md` : ce que l'IA a proposé, ce qui a été vérifié (HTML réel, captures relues, quartiles refaits à la main, 34 phrases de cassage), ce qui a été rejeté (« −40 % » contre un prix non lisible, courbe d'élasticité, ajustement garage sur des comparables inconnus, prix inventés pour les périodes vides, annonce à l'année non confirmée, « 74 vs 68 » comme erreur, LLM par défaut) ; relectures critiques par des agents séparés, dont une relecture de design par un second modèle.
- `journal-temps.md` : minutes réelles à l'horloge, part IA / part relue, pertes, total, estimation « humain seul » étiquetée, dépassement des ~4 h expliqué en une phrase.
- `prototype/prompts/reponse-invite.md` : prompt LLM **optionnel, jamais appelé par défaut**, même JSON que le modèle déterministe, même vérificateur.
- L'IA est interdite de prix : bornes, seuils et scénarios sont des calculs déterministes sur des relevés datés ; les hypothèses sont des paramètres visibles.

## Hors périmètre et limites (dites telles quelles)
Relevé automatique récurrent (le relevé est manuel, figé et daté) ; Booking (page illisible : paramètres ignorés, 0 établissement) ; prix de l'hôte pendant les Mondiaux (non lisible) ; paiement, contrat, synchronisation iCal réelle, envoi d'e-mail ; toute modification du vrai site ; tout contact avec l'hôte, ImmoCrans ou les plateformes. Textes DE, IT, RU : traductions automatiques, non relues par un natif (bandeau à l'écran). Le vérificateur travaille par motifs et ne comprend pas le sens : il ne bloque que ce qu'il peut prouver. Si le mandat ImmoCrans fixe les prix, le calendrier est une proposition à l'agence, pas un prix affiché.
Note juridique, une ligne : les clauses de parité tarifaire des plateformes envers les établissements d'hébergement sont interdites en Suisse (art. 8a LCD, 01.12.2022, https://www.fedlex.admin.ch/eli/cc/1988/223_223_223/fr#art_8_a) ; l'application à un appartement privé est une hypothèse à vérifier avec le contrat. Taxe de séjour hors prix (≈ CHF 3 par adulte et par nuit, règlement non relu).

## Greffe sur le vrai site (3 lignes)
Le composant Next.js `BookingOptions` rend le panneau actuel ; le module remplace son contenu (`app.js` + `lib/`), lit `fiche.json`, `comparables.json`, `periodes.json`, `hypotheses.json` et un `.ics` exporté d'Airbnb/Booking via une route serveur, et pousse ses événements (`r3b_prix_public_affiche`, `r3b_demande_envoyee`, `r3b_doublon_bloque`, `r3b_brouillon_bloque`…) dans le `dataLayer` déjà soumis au composant `AnalyticsConsent`. Le calendrier de prix est un outil de l'hôte, hors site public.

## Le même motif pour les autres sociétés du groupe
| Société | Fiche de vérité | Prix sourcé | Réponse contrôlée |
|---|---|---|---|
| MénageSimple | service « fin de bail » : inclus, matériel | devis sur le tarif horaire public (CHF 43.90/h), bornes | 0 chiffre non sourcé |
| Cassa | par coffre : frais, plafond, juridictions | frais et rendements affichés avec source et date | 0 chiffre non sourcé |

## Annexe · un bug reproduit sur le site actuel (trouvé en testant le parcours)
À 1280×800 exactement, le lien secondaire du héros « Voir les disponibilités » est recouvert par la barre « 5 voyageurs · 2 chambres · … » et ne reçoit pas le clic ; à 720, 900 et 1000 px de haut, il fonctionne. Le bouton principal n'est pas touché.
1. Chrome, viewport 1280×800, https://richemont3b.ch/fr/, attendre la fin des animations (≈ 9 s). 2. Refuser les cookies. 3. Observer le lien sous « Découvrir nos appartements » : coupé par la barre blanche (`captures/avant/avant-hero-1280x800.png`). 4. `document.elementFromPoint(143, 705)` renvoie un `<strong>` de `.facts`, pas le lien.
Cause (styles calculés) : `.facts { position: relative; z-index: 2; margin-top: -44px }` et lien en `position: static`. Correction proposée, à valider : `.facts { margin-top: 0 }`, `.hero-message { padding-bottom: 120px }`, `.hero-actions { position: relative; z-index: 3 }`.

## Arborescence
```
prototype/   index.html · style.css · app.js · lib/ (11 modules purs : prix, gain, vérificateur, iCal, tarifs, demandes, réponse, canaux, dates, mesure, i18n) · data/ (comparables figés + SHA-256, périodes, hypothèses, fiche, canaux, faq, ui, calendrier.ics, corpus figé, sondage post-gel) · prompts/
tests/       17 fichiers *.test.js (node:test) · aide.js · e2e.spec.mjs et captures.mjs (Playwright, optionnels)
captures/    avant/ (site actuel, mesures) · apres/ (59 captures du prototype, 1280 et 390 px, mesures du graphe et de la scène, vidéo 10 s de la scène, e2e-journal.txt)
```
Données personnelles : aucune (identités de démo neutres, e-mails en `@example.test`, aucun nom d'hôte, photos d'annonces tierces hors dépôt). Polices : Source Serif 4 et Manrope (SIL Open Font License, fichiers et licences dans `prototype/fonts/`).
