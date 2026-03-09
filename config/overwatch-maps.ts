// config/overwatch-maps.ts
// Liste officielle des maps OW (partagée entre l'API et l'admin)

export type OverwatchMap = {
  name: string;
  type: string;
  image: string;
};

const LP = 'https://liquipedia.net/commons/images/thumb';

export const OVERWATCH_MAPS: OverwatchMap[] = [
  // Control
  { name: 'Antarctic Peninsula', type: 'control', image: `${LP}/8/83/Antarctic_Peninsula.jpg/600px-Antarctic_Peninsula.jpg` },
  { name: 'Busan', type: 'control', image: `${LP}/a/a1/Busan.jpg/600px-Busan.jpg` },
  { name: 'Hanaoka', type: 'control', image: `${LP}/f/f6/Hanaoka.jpg/600px-Hanaoka.jpg` },
  { name: 'Ilios', type: 'control', image: `${LP}/4/45/Ilios.jpg/600px-Ilios.jpg` },
  { name: 'Lijiang Tower', type: 'control', image: `${LP}/e/e8/Lijiang-tower.jpg/600px-Lijiang-tower.jpg` },
  { name: 'Nepal', type: 'control', image: `${LP}/c/ca/Nepal.jpg/600px-Nepal.jpg` },
  { name: 'Oasis', type: 'control', image: `${LP}/f/fc/Oasis.jpg/600px-Oasis.jpg` },
  { name: 'Samoa', type: 'control', image: `${LP}/b/b4/Samoa.jpg/600px-Samoa.jpg` },
  // Escort
  { name: 'Circuit Royal', type: 'escort', image: `${LP}/a/ad/Monte_Carlo.png/600px-Monte_Carlo.png` },
  { name: 'Dorado', type: 'escort', image: `${LP}/6/6f/Dorado.jpg/600px-Dorado.jpg` },
  { name: 'Havana', type: 'escort', image: `${LP}/d/d5/Havana.jpg/600px-Havana.jpg` },
  { name: 'Junkertown', type: 'escort', image: `${LP}/e/e3/Junkertown.jpg/600px-Junkertown.jpg` },
  { name: 'Rialto', type: 'escort', image: `${LP}/f/ff/Rialto.jpg/600px-Rialto.jpg` },
  { name: 'Route 66', type: 'escort', image: `${LP}/8/85/Route-66.jpg/600px-Route-66.jpg` },
  { name: 'Shambali Monastery', type: 'escort', image: `${LP}/e/ee/Shambali.jpg/600px-Shambali.jpg` },
  { name: 'Watchpoint: Gibraltar', type: 'escort', image: `${LP}/6/60/Watchpoint-gibraltar.jpg/600px-Watchpoint-gibraltar.jpg` },
  // Hybrid
  { name: 'Blizzard World', type: 'hybrid', image: `${LP}/0/0b/Blizzard-world.jpg/600px-Blizzard-world.jpg` },
  { name: 'Eichenwalde', type: 'hybrid', image: `${LP}/e/e0/Eichenwalde.jpg/600px-Eichenwalde.jpg` },
  { name: 'Hollywood', type: 'hybrid', image: `${LP}/5/5d/Hollywood.jpg/600px-Hollywood.jpg` },
  { name: 'King\'s Row', type: 'hybrid', image: `${LP}/6/6a/Kings-row.jpg/600px-Kings-row.jpg` },
  { name: 'Midtown', type: 'hybrid', image: `${LP}/e/e1/New_York_City.jpg/600px-New_York_City.jpg` },
  { name: 'Numbani', type: 'hybrid', image: `${LP}/f/f9/Numbani.jpg/600px-Numbani.jpg` },
  { name: 'Paraíso', type: 'hybrid', image: `${LP}/b/bc/Rio_de_Janeiro.png/600px-Rio_de_Janeiro.png` },
  // Push
  { name: 'Colosseo', type: 'push', image: `${LP}/8/80/Rome.jpg/600px-Rome.jpg` },
  { name: 'Esperança', type: 'push', image: `${LP}/c/cd/Esperanca.jpg/600px-Esperanca.jpg` },
  { name: 'New Junk City', type: 'push', image: `${LP}/a/ae/New_Junk_City.jpg/600px-New_Junk_City.jpg` },
  { name: 'New Queen Street', type: 'push', image: `${LP}/9/91/Toronto.jpg/600px-Toronto.jpg` },
  { name: 'Runasapi', type: 'push', image: `${LP}/f/fd/Runasapi.jpg/600px-Runasapi.jpg` },
];
