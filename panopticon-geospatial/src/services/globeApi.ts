/**
 * Pont impératif entre les composants HUD (recherche, panneau de détails)
 * et le contrôleur Cesium hébergé par <Globe />. Les méthodes sont injectées
 * par Globe à l'initialisation, ce qui évite tout prop-drilling.
 */
import type { SatState } from '../types';

export const globeApi = {
  /** Sélectionne et centre un satellite par son index interne. */
  selectSat: (_index: number) => {},
  /** Lit la position instantanée d'un satellite (télémétrie live). */
  getSatState: (_index: number): SatState | null => null,
  /** Prédicat de visibilité (sous-point dans le rectangle de vue caméra). */
  getVisibleSatFilter: (): ((index: number) => boolean) => () => true,
  /** Recentre la caméra sur le satellite sélectionné. */
  focusSat: (_index: number) => {},
  /** Vol caméra vers des coordonnées (lon, lat, altitude m). */
  flyTo: (_lon: number, _lat: number, _height: number) => {},
};
