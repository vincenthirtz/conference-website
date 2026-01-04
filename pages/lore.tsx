import Head from 'next/head';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';

type TimelineItem = {
  year: string;
  title: string;
  description: string;
  imageUrl: string;
  videoUrl?: string;
};

type Faction = {
  name: string;
  summary: string;
  keyMembers: string[];
  alignment: 'Bienveillant' | 'Neutre' | 'Hostile';
};

type HeroDetail = {
  name: string;
  role: 'Tank' | 'Damage' | 'Support';
  bio: string;
  videoUrl: string;
  imageUrl: string;
};

const TIMELINE: TimelineItem[] = [
  {
    year: '2040s',
    title: 'Crise des Omniums',
    description:
      'Les usines d’IA “omniums” se retournent contre l’humanité, déclenchant une guerre mondiale.',
    imageUrl: '/images/timeline-omnium.jpg',
  },
  {
    year: '2040s',
    title: 'Null Sector & King’s Row',
    description:
      'L’Omnium britannique engendre Null Sector. L’insurrection de King’s Row marque l’alliance entre omnics et humains opprimés.',
    imageUrl: '/images/timeline-null-sector.jpg',
  },
  {
    year: '2050',
    title: 'Fondation d’Overwatch',
    description:
      'Jack Morrison et Gabriel Reyes prennent la tête d’une task force internationale pour vaincre les omniums.',
    imageUrl: '/images/timeline-overwatch.jpg',
  },
  {
    year: '2050s',
    title: 'Reconquête & héroïsme',
    description:
      'Ligne bleue de Gibraltar, opération Anubis en Égypte, missions d’élite de Blackwatch pour désamorcer les menaces émergentes.',
    imageUrl: '/images/timeline-anubis.jpg',
  },
  {
    year: '2050-2060',
    title: 'L’âge d’or',
    description:
      'Overwatch restaure la paix, mène des missions humanitaires et repousse les menaces globales.',
    imageUrl: '/images/timeline-golden-age.jpg',
  },
  {
    year: '2060',
    title: 'Scandales internes',
    description:
      'Rivalités Morrison/Reyes, opérations opaques de Blackwatch, fuite de Moira. L’opinion publique se retourne.',
    imageUrl: '/images/timeline-scandals.png',
  },
  {
    year: '2060+',
    title: 'Chute et disparition',
    description:
      'Scandales internes, explosion du QG suisse et dissolution officielle d’Overwatch par l’ONU.',
    imageUrl: '/images/timeline-fall.jpg',
  },
  {
    year: '2069',
    title: 'Réveil des menaces',
    description:
      'Null Sector se réarme (attaque de Paris), Talon accentue ses frappes, Vishkar cherche à “reconstruire” l’ordre mondial.',
    imageUrl: '/images/timeline-zero-hour.png',
  },
  {
    year: 'Aujourd’hui',
    title: 'Rappel des agents',
    description:
      'Winston lance un rappel. Les anciennes figures se reforment tandis que de nouvelles factions avancent leurs plans.',
    imageUrl: '/images/timeline-recall.jpg',
  },
];

const FACTIONS: Faction[] = [
  {
    name: 'Overwatch (Reformée)',
    summary:
      'Ancienne organisation de paix désormais clandestine. Winston, Tracer et Mercy rallient les vétérans pour contrer les nouvelles menaces.',
    keyMembers: ['Winston', 'Tracer', 'Mercy', 'Reinhardt', 'Soldier: 76'],
    alignment: 'Bienveillant',
  },
  {
    name: 'Blackwatch',
    summary:
      "Bras secret d'Overwatch, initialement dirigé par Gabriel Reyes. Opérations covertes, méthodes brutales, loyautés fracturées.",
    keyMembers: ['Reaper', 'Moira', 'Genji (ex)', 'McCree/Cassidy (ex)'],
    alignment: 'Neutre',
  },
  {
    name: 'Null Sector',
    summary:
      'Faction omnic militarisée née de l’oppression à King’s Row. Cherche à libérer les omnics par la force et des offensives coordonnées.',
    keyMembers: ['Orisa (ex confrontée)', 'Ramattra (ancien leader Shambali)'],
    alignment: 'Hostile',
  },
  {
    name: 'Talon',
    summary:
      'Syndicat criminel tirant profit du chaos global. Manipule conflits et attaques ciblées pour asseoir son influence.',
    keyMembers: ['Doomfist', 'Reaper', 'Widowmaker', 'Sombra', 'Moira'],
    alignment: 'Hostile',
  },
  {
    name: 'Vishkar / LumériCo',
    summary:
      'Conglomérats techno-architecturaux imposant des “solutions” de reconstruction. Exploitent la main-d’œuvre omnic et suscitent la résistance.',
    keyMembers: ['Symmetra (agent Vishkar)', 'Sancha (LumériCo)'],
    alignment: 'Neutre',
  },
  {
    name: 'Shambali',
    summary:
      'Moines omniacs prônant la paix homme-omnic. Guidés par Zenyatta et feu Tekhartha Mondatta.',
    keyMembers: ['Zenyatta', 'Ramattra (exilé)'],
    alignment: 'Neutre',
  },
  {
    name: 'Junkers & indépendants',
    summary:
      'Mercenaires, bricoleurs et survivants du désert australien. Motivations souvent personnelles.',
    keyMembers: ['Junker Queen', 'Junkrat', 'Roadhog'],
    alignment: 'Neutre',
  },
];

const HEROES: HeroDetail[] = [
  {
    name: 'Tracer',
    role: 'Damage',
    bio: "Pilote d’essai victime d’un accident temporel, stabilisée par Winston. Symbole d’Overwatch, toujours prête à “remettre les pendules à l’heure”.",
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Tracer',
    imageUrl: '/images/hero-tracer.jpg',
  },
  {
    name: 'Reinhardt',
    role: 'Tank',
    bio: 'Chevalier-crusader en armure, défenseur du code d’honneur d’Overwatch. Porte le marteau Fulmination et le bouclier d’énergie sur le front.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Reinhardt',
    imageUrl: '/images/hero-reinhardt.jpg',
  },
  {
    name: 'Ana',
    role: 'Support',
    bio: 'Co-fondatrice d’Overwatch, sniper d’élite. Protége sa fille Pharah depuis l’ombre et endort les menaces d’une fléchette.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Ana',
    imageUrl: '/images/hero-ana.jpg',
  },
  {
    name: 'Sojourn',
    role: 'Damage',
    bio: "Ancienne capitaine d’Overwatch Canada. Implantes cybernétiques, railgun, rigueur tactique. Rappelle l’équipe pour contrer Null Sector.",
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Sojourn',
    imageUrl: '/images/hero-sojourn.jpg',
  },
  {
    name: 'Mercy',
    role: 'Support',
    bio: 'Médecin prodige, pacifiste. Sa Valkyrie lui permet de soigner et ressusciter, même si ses idéaux l’ont opposée à certaines décisions d’Overwatch.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Mercy',
    imageUrl: '/images/hero-mercy.jpg',
  },
  {
    name: 'Genji',
    role: 'Damage',
    bio: 'Ninja cyborg sauvé par Mercy, apaisé par les Shambali. Trouve son équilibre entre humanité et métal.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Genji',
    imageUrl: '/images/hero-genji.jpg',
  },
  {
    name: 'Ramattra',
    role: 'Tank',
    bio: 'Moine omnic Shambali devenu leader radical de Null Sector. Alterne forme omnic et némésis pour protéger son peuple par tous les moyens.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Ramattra',
    imageUrl: '/images/hero-ramattra.jpg',
  },
  {
    name: 'Doomfist',
    role: 'Damage',
    bio: 'Stratège de Talon qui croit au “progrès par le conflit”. Son gantelet sème le chaos pour remodeler le monde.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Doomfist',
    imageUrl: '/images/hero-doomfist.jpg',
  },
  {
    name: 'D.Va',
    role: 'Tank',
    bio: 'Ancienne pro-gamer devenue pilote MEKA pour défendre la Corée contre les kaijus omniques. Stream ses exploits et inspire la jeune génération.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=D.Va',
    imageUrl: '/images/hero-dva.jpg',
  },
  {
    name: 'Kiriko',
    role: 'Support',
    bio: 'Protectrice du clan Shimada, guidée par le renard Yōkai. Mélange talismans de soins et kunai précis.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Kiriko',
    imageUrl: '/images/hero-kiriko.jpg',
  },
  {
    name: 'Sombra',
    role: 'Damage',
    bio: 'Hackeuse de Talon obsédée par les “marionnettistes” mondiaux. Réseau, infiltration et EMP pour mettre à nu les secrets.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Sombra',
    imageUrl: '/images/hero-sombra.jpg',
  },
  {
    name: 'Orisa',
    role: 'Tank',
    bio: 'Gardiens d’oriisa conçue par Efi Oladele pour défendre Numbani. Ancre protectrice équipée de lance-fusion et javelot.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Orisa',
    imageUrl: '/images/hero-orisa.jpg',
  },
  {
    name: 'Cassidy',
    role: 'Damage',
    bio: 'Ex-Blackwatch devenu justicier errant. Six coups précis, grenade collante et flair de pistolero pour régler les comptes.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Cassidy',
    imageUrl: '/images/hero-cassidy.jpg',
  },
  {
    name: 'Junker Queen',
    role: 'Tank',
    bio: 'Chef des Junkers de Junkertown, charismatique et impitoyable. Hache, fusil anti-émeute et commandement brutal.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Junker%20Queen',
    imageUrl: '/images/hero-junker-queen.jpg',
  },
  {
    name: 'Widowmaker',
    role: 'Damage',
    bio: 'Sniper de Talon, jadis Amélie Lacroix. Conditionnement neural lui a glacé le cœur pour en faire l’assassin parfait.',
    videoUrl: 'https://www.youtube.com/@OverwatchFR/search?query=Widowmaker',
    imageUrl: '/images/hero-widowmaker.jpg',
  },
];

export default function LorePage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-20">
      <Head>
        <title>Lore Overwatch | OW Women&apos;s Cup</title>
        <meta
          name="description"
          content="Résumé du lore d’Overwatch : crise omnium, création d’Overwatch, chute et factions actuelles."
        />
      </Head>

      <div className="container mx-auto max-w-6xl px-4 pt-24 space-y-10">
        <div className="flex flex-col gap-3">
          <Heading typeStyle="heading-md" className="text-gradient">
            Lore Overwatch – repères essentiels
          </Heading>
          <Paragraph textColor="text-gray-200" className="max-w-3xl">
            Une frise rapide pour situer les grands événements, suivie de fiches
            synthétiques sur les principales factions. Un rappel concis pour
            préparer vos casts et vos decks de présentation.
          </Paragraph>
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          <Heading typeStyle="heading-sm" className="text-white">
            Frise chronologique
          </Heading>
          <div className="relative">
            <div className="absolute left-[10px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-blue-400/80 to-purple-500/60" />
            <div className="space-y-4 ml-8">
              {TIMELINE.map((item) => (
                <div
                  key={`${item.year}-${item.title}`}
                  className="rounded-xl border border-white/10 bg-black/50 p-4 space-y-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-full h-36 object-cover rounded-lg border border-white/10"
                    loading="lazy"
                  />
                  <div className="flex items-center gap-3 text-sm text-blue-200">
                    <span className="h-3 w-3 rounded-full bg-blue-400" />
                    <span className="font-semibold">{item.year}</span>
                    <span className="text-gray-400">· {item.title}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-200 leading-relaxed">
                    {item.description}
                  </p>
                  {item.videoUrl && (
                    <a
                      href={item.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-xs text-amber-200 hover:text-amber-100"
                    >
                      Voir la vidéo liée ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          <Heading typeStyle="heading-sm" className="text-white">
            Factions principales
          </Heading>
          <div className="grid gap-4 md:grid-cols-2">
            {FACTIONS.map((f) => (
              <div
                key={f.name}
                className="rounded-xl border border-white/10 bg-black/50 p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{f.name}</h3>
                  <span
                    className={`text-xs rounded-full px-3 py-1 border ${
                      f.alignment === 'Bienveillant'
                        ? 'border-emerald-400/60 text-emerald-200'
                        : f.alignment === 'Hostile'
                          ? 'border-red-400/60 text-red-200'
                          : 'border-yellow-400/60 text-yellow-200'
                    }`}
                  >
                    {f.alignment}
                  </span>
                </div>
                <p className="text-sm text-gray-200 leading-relaxed">
                  {f.summary}
                </p>
                <p className="text-xs text-gray-400">
                  Membres clés : {f.keyMembers.join(', ')}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          <Heading typeStyle="heading-sm" className="text-white">
            Héros en lumière (fiche + vidéo)
          </Heading>
          <div className="grid gap-4 md:grid-cols-2">
            {HEROES.map((h) => (
              <div
                key={h.name}
                className="rounded-xl border border-white/10 bg-black/50 p-4 flex flex-col gap-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={h.imageUrl}
                  alt={h.name}
                  className="w-full h-40 object-cover rounded-lg border border-white/10"
                  loading="lazy"
                />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-gray-400">
                      {h.role}
                    </p>
                    <h3 className="text-lg font-semibold text-white">
                      {h.name}
                    </h3>
                  </div>
                  <a
                    href={h.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs rounded-full bg-amber-400/90 text-black px-3 py-1 font-semibold hover:bg-amber-300 transition"
                  >
                    Voir la vidéo
                  </a>
                </div>
                <p className="text-sm text-gray-200 leading-relaxed">{h.bio}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          <Heading typeStyle="heading-sm" className="text-white">
            Conflits / lieux emblématiques
          </Heading>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: 'King’s Row (Londres)',
                desc: 'Bastion de Null Sector et symbole de la lutte omnic-humaine.',
                image: '/images/location-kings-row.png',
              },
              {
                title: 'Temple d’Anubis (Égypte)',
                desc: 'Site d’IA interdit, surveillé par Helix Security. Opération majeure d’Overwatch.',
                image: '/images/location-anubis.png',
              },
              {
                title: 'Numbani',
                desc: 'Ville modèle homme-omnic, prise pour cible par Doomfist et Talon.',
                image: '/images/location-numbani.png',
              },
            ].map((loc) => (
              <div
                key={loc.title}
                className="rounded-xl border border-white/10 bg-black/50 p-3 space-y-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={loc.image}
                  alt={loc.title}
                  className="w-full h-28 object-cover rounded-lg border border-white/10"
                  loading="lazy"
                />
                <p className="text-sm font-semibold text-white">{loc.title}</p>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {loc.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
