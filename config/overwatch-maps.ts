// config/overwatch-maps.ts
// Liste officielle des maps OW (partagée entre l'API et l'admin)

export type OverwatchMap = {
  name: string;
  type: string;
  image: string;
};

export const OVERWATCH_MAPS: OverwatchMap[] = [
  // Control
  { name: 'Antarctic Peninsula', type: 'control', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/antarctic-peninsula.jpg' },
  { name: 'Busan', type: 'control', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/busan.jpg' },
  { name: 'Hanaoka', type: 'control', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/hanaoka.jpg' },
  { name: 'Ilios', type: 'control', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/ilios.jpg' },
  { name: 'Lijiang Tower', type: 'control', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/lijiang-tower.jpg' },
  { name: 'Nepal', type: 'control', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/nepal.jpg' },
  { name: 'Oasis', type: 'control', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/oasis.jpg' },
  { name: 'Samoa', type: 'control', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/samoa.jpg' },
  // Escort
  { name: 'Circuit Royal', type: 'escort', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/circuit-royal.jpg' },
  { name: 'Dorado', type: 'escort', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/dorado.jpg' },
  { name: 'Havana', type: 'escort', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/havana.jpg' },
  { name: 'Junkertown', type: 'escort', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/junkertown.jpg' },
  { name: 'Rialto', type: 'escort', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/rialto.jpg' },
  { name: 'Route 66', type: 'escort', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/route-66.jpg' },
  { name: 'Shambali Monastery', type: 'escort', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/shambali-monastery.jpg' },
  { name: 'Watchpoint: Gibraltar', type: 'escort', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/watchpoint-gibraltar.jpg' },
  // Hybrid
  { name: 'Blizzard World', type: 'hybrid', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/blizzard-world.jpg' },
  { name: 'Eichenwalde', type: 'hybrid', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/eichenwalde.jpg' },
  { name: 'Hollywood', type: 'hybrid', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/hollywood.jpg' },
  { name: 'King\'s Row', type: 'hybrid', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/kings-row.jpg' },
  { name: 'Midtown', type: 'hybrid', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/midtown.jpg' },
  { name: 'Numbani', type: 'hybrid', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/numbani.jpg' },
  { name: 'Paraíso', type: 'hybrid', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/paraiso.jpg' },
  // Push
  { name: 'Colosseo', type: 'push', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/colosseo.jpg' },
  { name: 'Esperança', type: 'push', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/esperanca.jpg' },
  { name: 'New Junk City', type: 'push', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/new-junk-city.jpg' },
  { name: 'New Queen Street', type: 'push', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/new-queen-street.jpg' },
  { name: 'Runasapi', type: 'push', image: 'https://overwatch.blizzard.com/static/media/screenshots/maps/runasapi.jpg' },
];
