import { describe, expect, it } from 'vitest';
import {
  computeOpeningStatus,
  findOverlappingSlots,
  type HoursException,
  type HoursSlot,
} from '../../src/domains/organizations/opening-hours';

/**
 * Le filtre « ouvert maintenant » est un critere de decouverte central : un
 * restaurant affiche ouvert alors qu'il est ferme envoie le client devant une
 * porte close.
 *
 * Reference : specification sections 3.1 et 20.1.
 *
 * Les instants de test sont construits en UTC. Abidjan est a UTC+0 toute
 * l'annee, sans heure d'ete : l'heure locale coincide donc avec l'heure UTC.
 */
describe('computeOpeningStatus', () => {
  /** Vendredi 18:00 a 02:00 le lendemain, service de nuit typique d'un maquis. */
  const nightSlots: HoursSlot[] = [
    { weekDay: 'FRIDAY', opensAtMinutes: 1080, closesAtMinutes: 1560 },
    { weekDay: 'SATURDAY', opensAtMinutes: 1080, closesAtMinutes: 1560 },
  ];

  /** Lundi au vendredi, 11:00 a 23:00. */
  const daySlots: HoursSlot[] = [
    { weekDay: 'MONDAY', opensAtMinutes: 660, closesAtMinutes: 1380 },
    { weekDay: 'FRIDAY', opensAtMinutes: 660, closesAtMinutes: 1380 },
  ];

  it('declare ouvert pendant le creneau', () => {
    // Vendredi 2026-08-28, 20:00.
    const status = computeOpeningStatus(new Date('2026-08-28T20:00:00Z'), nightSlots, []);
    expect(status.open).toBe(true);
    expect(status.closesInMinutes).toBe(360);
  });

  it('declare ferme avant l ouverture et annonce le delai', () => {
    // Vendredi 16:00, ouverture a 18:00.
    const status = computeOpeningStatus(new Date('2026-08-28T16:00:00Z'), nightSlots, []);
    expect(status.open).toBe(false);
    expect(status.opensInMinutes).toBe(120);
  });

  it('reste ouvert apres minuit pour un service de nuit', () => {
    // Samedi 00:30 : le creneau du vendredi se termine a 02:00, soit 1560 minutes.
    // C'est le cas que rate un calcul naif limite a la journee courante.
    const status = computeOpeningStatus(new Date('2026-08-29T00:30:00Z'), nightSlots, []);
    expect(status.open).toBe(true);
    expect(status.closesInMinutes).toBe(90);
  });

  it('ferme apres la fin du service de nuit', () => {
    // Samedi 02:30, apres la fermeture a 02:00.
    const status = computeOpeningStatus(new Date('2026-08-29T02:30:00Z'), nightSlots, []);
    expect(status.open).toBe(false);
  });

  it('declare ferme un jour sans creneau', () => {
    // Mercredi, absent de la grille.
    const status = computeOpeningStatus(new Date('2026-08-26T12:00:00Z'), daySlots, []);
    expect(status.open).toBe(false);
  });

  it('declare ferme sans aucun horaire renseigne', () => {
    const status = computeOpeningStatus(new Date('2026-08-28T12:00:00Z'), [], []);
    expect(status.open).toBe(false);
    expect(status.reason).toBe('no_hours');
  });

  it('une fermeture exceptionnelle prime sur la grille hebdomadaire', () => {
    const exceptions: HoursException[] = [{ dateKey: '2026-08-28', closed: true, opensAtMinutes: null, closesAtMinutes: null }];

    const status = computeOpeningStatus(new Date('2026-08-28T20:00:00Z'), nightSlots, exceptions);

    expect(status.open).toBe(false);
    expect(status.reason).toBe('exception');
  });

  it('un horaire exceptionnel remplace le creneau habituel', () => {
    // Jour de fete : ouverture reduite de 10:00 a 14:00 alors que la grille
    // prevoit 18:00 a 02:00.
    const exceptions: HoursException[] = [
      { dateKey: '2026-08-28', closed: false, opensAtMinutes: 600, closesAtMinutes: 840 },
    ];

    expect(computeOpeningStatus(new Date('2026-08-28T12:00:00Z'), nightSlots, exceptions).open).toBe(true);
    expect(computeOpeningStatus(new Date('2026-08-28T20:00:00Z'), nightSlots, exceptions).open).toBe(false);
  });

  it('ignore une exception portant sur une autre date', () => {
    const exceptions: HoursException[] = [{ dateKey: '2026-12-25', closed: true, opensAtMinutes: null, closesAtMinutes: null }];

    expect(computeOpeningStatus(new Date('2026-08-28T20:00:00Z'), nightSlots, exceptions).open).toBe(true);
  });
});

describe('findOverlappingSlots', () => {
  it('ne signale rien pour une grille coherente', () => {
    const slots: HoursSlot[] = [
      { weekDay: 'MONDAY', opensAtMinutes: 660, closesAtMinutes: 900 },
      { weekDay: 'MONDAY', opensAtMinutes: 1080, closesAtMinutes: 1380 },
    ];

    expect(findOverlappingSlots(slots)).toHaveLength(0);
  });

  it('detecte deux creneaux qui se chevauchent le meme jour', () => {
    const slots: HoursSlot[] = [
      { weekDay: 'MONDAY', opensAtMinutes: 660, closesAtMinutes: 900 },
      { weekDay: 'MONDAY', opensAtMinutes: 840, closesAtMinutes: 1200 },
    ];

    expect(findOverlappingSlots(slots)).toHaveLength(1);
  });

  it('n assimile pas deux jours differents a un chevauchement', () => {
    const slots: HoursSlot[] = [
      { weekDay: 'MONDAY', opensAtMinutes: 660, closesAtMinutes: 1380 },
      { weekDay: 'TUESDAY', opensAtMinutes: 660, closesAtMinutes: 1380 },
    ];

    expect(findOverlappingSlots(slots)).toHaveLength(0);
  });
});
