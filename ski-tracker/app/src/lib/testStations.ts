import type { SkiStation } from '@/types/skimap'

/** 3 real stations from OpenSkiMap as seed / offline fallback */
export const TEST_STATIONS: SkiStation[] = [
  {
    id: '3',
    name: 'Chamonix Mont-Blanc',
    country: 'France',
    region: 'Auvergne-Rhône-Alpes',
    center: [6.8696, 45.9237],
  },
  {
    id: '2',
    name: 'Val-d\'Isère / Tignes',
    country: 'France',
    region: 'Auvergne-Rhône-Alpes',
    center: [6.9797, 45.4484],
  },
  {
    id: '14',
    name: 'Verbier',
    country: 'Switzerland',
    region: 'Valais',
    center: [7.2273, 46.0956],
  },
  {
    id: '50',
    name: 'Zermatt',
    country: 'Switzerland',
    region: 'Valais',
    center: [7.7491, 46.0207],
  },
  {
    id: '1',
    name: 'Les Deux Alpes',
    country: 'France',
    region: 'Isère',
    center: [6.1214, 45.0128],
  },
  {
    id: '100',
    name: 'Courchevel / Méribel',
    country: 'France',
    region: 'Savoie',
    center: [6.6340, 45.4147],
  },
]
