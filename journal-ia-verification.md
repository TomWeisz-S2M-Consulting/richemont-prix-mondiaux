# Journal « IA et vérification humaine » — Richemont 3B · Tom Weisz

Ce que l'IA a proposé, ce qui a été vérifié par un humain, ce qui a été rejeté et pourquoi. Outils de fabrication : Claude Code (codage assisté, rédaction, relectures par des agents séparés), Playwright (captures, mesures), curl (HTML réel). Le livrable, lui, n'appelle aucun service payant.

## 1. Cadrage
| L'IA a proposé | Vérifié | Décision |
|---|---|---|
| Recherche initiale : « une ancienne annonce à l'année à CHF 2 100/mois circule encore » | Page Dreamo relue : même fiche vacances qu'ImmoCrans, aucune annonce à l'année trouvée | **Rejeté**. Une affirmation fausse sur l'appartement de l'hôte aurait annulé tout le dossier |
| « 74 m² contre 68 m² = incohérence » | ImmoCrans affiche « surface habitable 68 m² » et « surface utile 73,8 m² » : deux mesures | **Requalifié** en précision (« 74 m² utiles / 68 m² habitables ») |
| « Airbnb situe le bien à Lens = erreur » | La station Crans-Montana (rue du Pas-de-l'Ours) est sur la commune de Lens | **Rejeté** comme écart ; « Lens » est confirmé par le vérificateur avec la note « commune » |
| Commission Airbnb ≈ 3 % côté hôte (stratégie v1) | Sources tierces 2026 : modèle « host-only » ≈ 15,5 % ; date de bascule en Suisse incertaine | **Corrigé**, marqué [H] ; enjeu recalculé : CHF 600 à 2 400/an, dit « modeste » |
| Concierge multilingue en 5 langues (piste R1) | Sans LLM = arbre de FAQ figé ; avec LLM = service payant par défaut ; DE/IT/RU invérifiables par l'équipe | **Écarté** au profit de R3 |
| Grille de prix par saison avec coefficients (×1,25, ×1,6) | Aucun prix public hors « dès CHF 1 960/semaine » | **Rejeté** : un montant inventé sous le nom de l'hôte. Par défaut, seul le prix public sourcé s'affiche ; les tarifs de l'hôte sont un paramètre vide, avec un fichier d'exemple étiqueté « exemple » |

## 2. Faits et sources
| L'IA a lu | Vérifié par un humain | Décision |
|---|---|---|
| Résumés de pages (outil de lecture qui résume) | Tout chiffre repris est relu dans le HTML réel (`curl`) : JSON-LD `VacationRental` du site (74 m², 5 personnes, 2 chambres, 2 salles d'eau, adresse, rénové 2026), lignes ImmoCrans, `<title>` et `og:title` Airbnb | Statut **[C-HTML]** dans `fiche.json`, chaque champ avec URL, date et extrait |
| Titre Airbnb « 3 chambres » | Relu à l'œil : `<title>` = « Richemont 3 chambres • Ski à 3 min • … » et `og:title` de la même page = « … 2 chambres · 5 lits · 2 salles de bain » | Conservé comme **l'écart net**, cité avec ses deux balises, ton « précision à apporter » |
| Taxe de séjour ≈ CHF 3/adulte/nuit | Règlement communal non relu (PDF en 404) | **[H]**, hors prix, lien vers le règlement, « à confirmer » |
| Art. 8a LCD (parité tarifaire) | Lu sur fedlex (ancre `#art_8_a`, en vigueur 01.12.2022) | Une ligne dans le README ; application à un appartement privé : **[H]** |
| Bogue du vrai site à 1280×800 (lien du héros recouvert) | Capture relue à l'œil ; le bouton principal reste cliquable | Annexe du README au format « reproduire un bug », ton neutre, hors vidéo |
| Mesure Airbnb/Booking « temps jusqu'au prix » | L'automate n'a pas su saisir des dates (fenêtres de traduction, cookies) | **« Non mesuré »** écrit tel quel, jamais estimé ; refait avec dates fixes en paramètres d'URL (voir §4 de la conception) |

## 3. Code et tests
| L'IA a produit | Vérifié | Décision |
|---|---|---|
| Plan de tests `node --test tests/` | Essai réel sous Node 24 : échec (« Cannot find module …/tests ») | Commande corrigée : `node --test "tests/*.test.js"` |
| `new Date('2026-12-19')` pour les dates | Essai : donne le 18 sous `TZ=America/Los_Angeles` | Dates en entiers (`Date.UTC`), suite relancée sous deux fuseaux (`npm run test:tz`) |
| 8 modules `lib/` (586 lignes) et 37 tests | Tests lus et lancés : 37/37, aussi sous Los Angeles et Auckland ; 5 phrases supplémentaires sondées à la main (ci-dessous) | Accepté |
| Corpus de 25 brouillons (10 corrects, 10 pièges, 5 bruts LLM) | **Figé avant le code** du vérificateur : SHA-256 `d9306d7d…` (`prototype/data/CORPUS-SHA256.txt`, 17:26) | Résultat mesuré après coup : pièges bloqués 10/10, faux blocages 0/10, brouillons LLM bruts bloqués 1/5 (`llm-02` : montants des tarifs d'exemple, admis si l'estimation est passée en contexte) |
| Liste des équipements « absents » proposée (piscine, sauna, … ascenseur) | « Ascenseur » figure dans la liste de commodités d'ImmoCrans | **Retiré** des absents (`absents_retires`) : on ne déclare absent que ce qu'aucun canal n'annonce |
| 5 brouillons LLM bruts | Gardés tels quels, non relus (`note: "brut, non relu"`) | `llm-05` cite « Wi-Fi » : confirmé via l'équipement « internet » (site) |

Sondage manuel du vérificateur (5 phrases hors corpus, 05/11) :
- « Appartement de 74 m² à 4 min de la télécabine, 2 chambres, rénové en 2026, 3963 Crans-Montana, arrivée dès 16 h. » → ok, 4 confirmés, aucun faux fait sur 2026, 3963, 16 h.
- « Bel appartement avec piscine et 3 chambres à Lens. » → bloqué : piscine (absent), 3 chambres (contredit), Lens confirmé.
- « Sans piscine, 2 chambres, jardin de 1 000 m², CHF 1'960.- par semaine, golf à 7 min. » → ok.
- « Two bedrooms, 2 bathrooms, sleeps 5, no pets, garage, 80 m2. » → bloqué sur 80 m² seulement.
- « Nous sommes à 3 min des pistes de ski. Pas de garage. Prix : 300 CHF la nuit. » → bloqué : garage nié (contredit), 300 CHF (hors fiche) ; « 3 min » = précision (le site dit 4 min).

## 4. Textes et langues
- Interface, réponse type et FAQ en FR et EN : relues mot à mot.
- DE, IT, RU (décision revue : qualité maximale plutôt que coupes) : **livrées**, traduites par IA puis relues une seconde fois par IA (chiffres, noms propres, vouvoiement) ; **non relues par un natif** : un bandeau le dit à l'écran dans ces langues, et le vérificateur, lui, contrôle les faits dans les 5 langues (15/15 phrases correctes, 9/9 pièges).
- Micro-copie : aucun mot « erreur » ou « faux » à propos des annonces de l'hôte ; ton « précision à apporter ».

## 5. Deuxième passage : ce que la relecture critique interne a cassé, et ce qui a été corrigé
| Attaque (relecture adverse) | Vérifié | Correction |
|---|---|---|
| « La fiche de vérité se trompe sur le site de l'hôte » : la vue hôte affichait « Rénovation · Site : non mentionné », « Garage · Site : non mentionné » (cellules écrites à la main dans le code) | Vrai : le site dit « entièrement rénové en 2026 » et « Garage fermé » | Tableau **calculé** depuis les textes réels cités (23 extraits relus par `curl`) ; test : chaque cellule « non mentionné » est vraie |
| 34 phrases de cassage : 2 faux blocages (« Not only a garage… », « Без доплаты гараж включён ») et 7 pièges ratés (pluriels « dogs », « chiens », « piscines » ; « Chambres : 2. Salles de bain : 3 » ; négation après le mot ; télécabine à 15 min en simple précision ; « Zermatt » qui passe) | Rejoué une à une | Pluriels, forme « libellé : nombre », exceptions de négation (« not only », « sans supplément »…), négation après le mot, écart de distance > 2× = contredit, liste de lieux d'autres stations. Les 34 phrases + 33 nouvelles forment `sondage-post-gel.json` : 67/67, avec l'obligation de déclarer tout raté |
| « Envoyer à l'invité » bloqué sur un titre d'annonce : incohérent | Vrai | Sur un titre : « Copier le titre corrigé » ; sur un brouillon : « Envoyer à l'invité » |
| README annonçant 37 tests et DE/IT/RU hors périmètre | Vrai à la date du 1er README | Réécrit sur les chiffres du jour |
| Relecture de design par un second modèle : « null » affiché sous Voyageurs, saut de mise en page (CLS 0,07), couture dans la lumière de l'aube, crête sous le pli à 390 px, bouton sur deux lignes | Reproduit par captures | Corrigés et mesurés : aucun nœud « null », CLS 0, bord dégradé, pastille « Démo » et crête visible à 390 |
| Relecture de design : « nommer un sommet avec son altitude » pour rendre la crête plus vraie | Refusé | Règle du projet : zéro fait non sourcé, même décoratif ; l'aube est renforcée autrement |

## 6. Changement de cap décidé le 05/11 : le prix. Ce que l'IA a proposé, ce qui a été vérifié, ce qui a été rejeté
| L'IA a proposé | Vérifié par un humain | Décision |
|---|---|---|
| Relevé automatisé de 88 annonces Airbnb et 12 ImmoCrans sur 10 fenêtres (totaux lus sur les pages de résultats) | Captures pleine page refaites le soir même : 100 totaux sur 140 relus à l'identique, 40 annonces absentes au 2e passage, 0 écart ; quartiles Mondiaux recalculés à la main (455 / 465 / 500) | Relevé figé et daté ; les absentes gardent leur relevé du matin, marquées « capture partielle » |
| « À 280 CHF/nuit pendant les Mondiaux, l'appartement est à −40 % du marché » (vignette d'accueil, indicateur) | Le prix de l'hôte pendant les Mondiaux n'est pas lisible (« dates non disponibles ») ; 280 est le plancher « dès » d'ImmoCrans | **Rejeté** : on montre le marché à côté du plancher public et « votre prix actuel pour ces dates : non publié » |
| Courbe d'occupation `occ × (1 − k·Δp/280)` avec k = 0,2 / 0,4 / 0,6 | Aucune source ; asymétrique (baisser le prix ne remplissait jamais plus) ; 75 % du « gain » venait de k | **Rejeté** : seuil d'occupation d'équivalence (60 % des nuits à 465 = 100 % à 280) + occupations posées par scénario, « sensibilité au prix : non mesurée » |
| Occupations posées par l'IA, plus basses à la cible qu'au plancher dans toutes les périodes | Incohérent quand la cible est sous le plancher (automne, mars, été) | **Corrigé à la main** : occupation à la cible posée plus haute quand la cible est sous le plancher, plus basse quand elle est au-dessus (`hypotheses.json`, toutes [H]) |
| Ajustement « +4 % garage, +4 % rénové » sur les comparables | Garage et capacité des annonces Airbnb non lisibles : l'ajustement était toujours à 0 | **Retiré** (code mort, et on ne corrige pas ce qu'on ne sait pas) |
| Combler janvier, printemps et automne 2027 avec une moyenne | Aucun relevé sur ces dates | **Rejeté** : « donnée insuffisante : aucune annonce relevée, il en faut 5 » |
| Compter les frais de ménage et de service à part | Détail du prix Airbnb Suisse relu sur 6 annonces : ménage et service intégrés au prix par nuit, seule la réduction à la semaine est listée | « Non isolables » écrit tel quel ; règle : total Airbnb et « dès 1'960 » ImmoCrans sont deux prix voyageur, comparables |
| Vérificateur de prix qui compare un prix aux bornes de n'importe quelle période | « 400/nuit au printemps » aurait été confirmé par les bornes des fêtes | **Corrigé** : comparaison à la période des dates citées ; sans période, « précision » |
| Captures de pages de résultats dans le dépôt public | Elles montrent les photos d'annonces d'autres hôtes | **Hors dépôt** (`export-ignore`), empreintes SHA-256 dans le JSON |
| Relecture de design : nommer un sommet avec son altitude | Fait non sourcé, même décoratif | **Refusé** une seconde fois |

## 7. Limites connues (à dire telles quelles)
- Le vérificateur est fondé sur des motifs (nombre + unité ou mot-clé) : il ne comprend pas le sens. Il rate un fait formulé sans nombre ni mot-clé connu, et un équipement non listé dans la fiche passe sans contrôle. C'est voulu : il ne bloque que ce qu'il peut prouver.
- Le calendrier des disponibilités est synthétique (étiqueté à l'écran) ; le branchement iCal réel est décrit, pas fait. Les prix, eux, viennent d'un relevé public figé et daté, pas d'une synthèse.
- Le relevé des comparables est un instantané (prix demandés par des annonces encore libres le 05/11/2026, tri par défaut d'Airbnb, page 1 seulement) : il dit l'ordre de grandeur, pas le prix final ; « 2 chambres » remplace une capacité non lisible.
- Les durées du journal de temps sont courtes parce que le travail est assisté par IA ; elles ne sont pas gonflées.
