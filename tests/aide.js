// Chargement des données figées du prototype (lecture seule).
import { readFileSync } from 'node:fs';
import { calendrier, tarifsHoteDepuisCalendrier } from '../prototype/lib/prix.js';

const lire = (f) => readFileSync(new URL(`../prototype/data/${f}`, import.meta.url), 'utf8');
export const fiche = JSON.parse(lire('fiche.json'));
export const canaux = JSON.parse(lire('canaux.json'));
export const tarifsPublic = JSON.parse(lire('tarifs.json'));
export const brouillons = JSON.parse(lire('brouillons-test.json'));
export const icsTexte = lire('calendrier.ics');
export const comparables = JSON.parse(lire('comparables.json'));
export const periodes = JSON.parse(lire('periodes.json'));
export const hypotheses = JSON.parse(lire('hypotheses.json'));
// Calendrier de prix (11 périodes avec bornes) et tarifs de l'hôte dérivés de ce calendrier (cible par période).
export const cal = calendrier(comparables, periodes, hypotheses);
export const tarifsHote = tarifsHoteDepuisCalendrier(cal);
export const tarifsAvecHote = { ...tarifsPublic, tarifsHote };
