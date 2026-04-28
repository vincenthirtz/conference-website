import type { NextApiRequest, NextApiResponse } from 'next';
import { load } from 'cheerio';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

const MEDIA_URL = 'https://overwatch.blizzard.com/fr-fr/media/';
const BASE_URL = 'https://overwatch.blizzard.com';

export type MediaType = 'comic' | 'story' | 'music' | 'screenshot';

// Liste statique des médias connus (fallback si le scraping échoue)
// Source: https://overwatch.blizzard.com/fr-fr/media/
const KNOWN_MEDIA: Omit<BlizzardMediaItem, 'description'>[] = [
  // Comics / Bandes dessinées
  {
    id: 'comic-a-new-empire',
    title: 'Un nouvel empire',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/a-new-empire`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-reconciliation',
    title: 'Réconciliation',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/reconciliation`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-against-the-tide',
    title: 'À contre-courant',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/against-the-tide`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-dokiwatch-comic',
    title: "Le Cœur de l'espoir",
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/dokiwatch-comic`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-freja-comic',
    title: 'Chasseuse de tempête',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/freja-comic`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-together-comic',
    title: 'Ensemble',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/together-comic`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-tear-it-down',
    title: 'Table rase',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/tear-it-down`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-the-red-promise',
    title: 'La promesse rouge',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/the-red-promise`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-transmission',
    title: 'TRANSMISSION',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/transmission`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-ventures-adventures-tangle-with-talon',
    title: 'Les aventures de Venture',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/ventures-adventures-tangle-with-talon`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-starwatch-epilogue',
    title: 'Starwatch',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/starwatch-epilogue`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-new-blood-5',
    title: 'Sang Neuf - Partie 5',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/new-blood-5`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-new-blood-4',
    title: 'Sang Neuf - Partie 4',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/new-blood-4`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-new-blood-3',
    title: 'Sang Neuf - Partie 3',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/new-blood-3`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-new-blood-2',
    title: 'Sang Neuf - Partie 2',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/new-blood-2`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-new-blood-1',
    title: 'Sang Neuf - Partie 1',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/new-blood-1`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-tracer-london-calling-5',
    title: 'Tracer—London Calling - Partie 5',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/tracer-london-calling-5`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-tracer-london-calling-4',
    title: 'Tracer—London Calling - Partie 4',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/tracer-london-calling-4`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-tracer-london-calling-3',
    title: 'Tracer—London Calling - Partie 3',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/tracer-london-calling-3`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-tracer-london-calling-2',
    title: 'Tracer—London Calling - Partie 2',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/tracer-london-calling-2`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-tracer-london-calling-1',
    title: 'Tracer—London Calling - Partie 1',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/tracer-london-calling-1`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-retribution',
    title: 'Représailles',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/retribution`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-yeti-hunt',
    title: 'Chasse au yéti',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/yeti-hunt`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-halloween-terror',
    title: 'Un Halloween terrifiant',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/halloween-terror`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-searching',
    title: 'La recherche',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/searching`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-wasted-land',
    title: 'Désolation',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/wasted-land`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-masquerade',
    title: 'Bas les masques',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/masquerade`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-uprising',
    title: 'Insurrection',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/uprising`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-binary',
    title: 'Binaire',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/binary`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-reflections',
    title: 'Réflexions',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/reflections`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-junkenstein',
    title: 'Schakalstein',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/junkenstein`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-old-soldiers',
    title: 'Vétérans',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/old-soldiers`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-legacy',
    title: "L'héritage",
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/legacy`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-destroyer',
    title: 'Le destructeur',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/destroyer`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-mission-statement',
    title: 'Ordre de mission',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/mission-statement`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-a-better-world',
    title: 'Un monde meilleur',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/a-better-world`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-going-legit',
    title: 'Rangés des camions',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/going-legit`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-dragon-slayer',
    title: 'Tueur de dragons',
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/dragon-slayer`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'comic-train-hopper',
    title: "L'hypertrain sifflera trois fois",
    type: 'comic',
    category: 'Bande dessinée',
    link: `${BASE_URL}/fr-fr/media/comic/train-hopper`,
    thumbnail_url: null,
    parts: 1,
  },

  // Short stories / Nouvelles
  {
    id: 'story-signs-of-life',
    title: 'Signe de vie',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/signs-of-life`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-atlas-news-report',
    title: "Rapport d'Atlas News",
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/atlas-news-report`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-futures-past',
    title: 'Souvenirs, avenir',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/futures-past`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-lucky-man',
    title: 'Veinard',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/lucky-man`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-lost-ghosts',
    title: 'Âmes errantes',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/lost-ghosts`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-the-pocket-king',
    title: 'Un atout dans la manche',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/the-pocket-king`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-where-honor-lives',
    title: "En quête d'honneur",
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/where-honor-lives`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-thoughtless-gods',
    title: 'Dieux inconséquents',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/thoughtless-gods`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-unity',
    title: 'Unité',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/unity`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-rebuilding-ruins',
    title: 'Les ruines de notre amitié',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/rebuilding-ruins`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-a-friendly-rivalry',
    title: 'Une rivalité amicale',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/a-friendly-rivalry`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-sojourn',
    title: 'Ondes de choc',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/sojourn`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-torbjorn',
    title: "Notes de l'atelier Torbjörn",
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/torbjorn`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-echo',
    title: 'Notes de Mina Liao',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/echo`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-as-you-are',
    title: 'Tel que tu es',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/as-you-are`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-ramattra-reflections',
    title: 'Ramattra : Réflexions',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/ramattra-reflections`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-yokai',
    title: 'Yōkai',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/yokai`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-code-of-violence',
    title: 'Un code de violence',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/code-of-violence`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-deadlock-rebels-chapter-1',
    title: 'Deadlock Rebels - Chapitre 1',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/deadlock-rebels-chapter-1`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-stone-by-stone',
    title: 'Pierre après pierre',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/stone-by-stone`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-valkyrie',
    title: 'Valkyrie',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/valkyrie`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-what-you-left-behind',
    title: 'Le Poids du Passé',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/what-you-left-behind`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'story-bastet',
    title: 'Bastet',
    type: 'story',
    category: 'Nouvelle',
    link: `${BASE_URL}/fr-fr/media/short-story/bastet`,
    thumbnail_url: null,
    parts: 1,
  },

  // Music / Musique
  {
    id: 'music-overwatch-2-original-soundtrack',
    title: 'Overwatch 2 Original Soundtrack',
    type: 'music',
    category: 'Musique',
    link: `${BASE_URL}/fr-fr/media/music/overwatch-2-original-soundtrack`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'music-heroes-and-villains',
    title: 'Heroes & Villains',
    type: 'music',
    category: 'Musique',
    link: `${BASE_URL}/fr-fr/media/music/heroes-and-villains`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'music-animated-shorts',
    title: 'Animated Shorts',
    type: 'music',
    category: 'Musique',
    link: `${BASE_URL}/fr-fr/media/music/animated-shorts`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'music-cities-and-countries',
    title: 'Cities & Countries',
    type: 'music',
    category: 'Musique',
    link: `${BASE_URL}/fr-fr/media/music/cities-and-countries`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'music-collectors-edition',
    title: "Collector's Edition",
    type: 'music',
    category: 'Musique',
    link: `${BASE_URL}/fr-fr/media/music/collectors-edition`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'music-synaesthesia-auditiva',
    title: 'Synaesthesia Auditiva',
    type: 'music',
    category: 'Musique',
    link: `${BASE_URL}/fr-fr/media/music/synaesthesia-auditiva`,
    thumbnail_url: null,
    parts: 1,
  },

  // Images / Screenshots - Héros (Concept Art)
  {
    id: 'image-baptiste',
    title: 'Baptiste',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/baptiste`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-wrecking-ball',
    title: 'Bouldozer',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/wrecking-ball`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-brigitte',
    title: 'Brigitte',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/brigitte`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-moira',
    title: 'Moira',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/moira`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-doomfist',
    title: 'Doomfist',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/doomfist`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-orisa',
    title: 'Orisa',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/orisa`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-sombra',
    title: 'Sombra',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/sombra`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-genji',
    title: 'Genji',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/genji`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-mei',
    title: 'Mei',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/mei`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-dva',
    title: 'D.Va',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/dva`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-roadhog',
    title: 'Chopper',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/roadhog`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-junkrat',
    title: 'Chacal',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/junkrat`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-lucio',
    title: 'Lúcio',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/lucio`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-soldier-76',
    title: 'Soldat : 76',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/soldier-76`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-zarya',
    title: 'Zarya',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/zarya`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-cassidy',
    title: 'Cassidy',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/cassidy`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-bastion',
    title: 'Bastion',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/bastion`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-hanzo',
    title: 'Hanzo',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/hanzo`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-mercy',
    title: 'Ange',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/mercy`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-pharah',
    title: 'Pharah',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/pharah`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-reaper',
    title: 'Faucheur',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/reaper`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-reinhardt',
    title: 'Reinhardt',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/reinhardt`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-symmetra',
    title: 'Symmetra',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/symmetra`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-torbjorn',
    title: 'Torbjörn',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/torbjorn`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-tracer',
    title: 'Tracer',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/tracer`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-widowmaker',
    title: 'Fatale',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/widowmaker`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-winston',
    title: 'Winston',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/winston`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-zenyatta',
    title: 'Zenyatta',
    type: 'screenshot',
    category: 'Concept Art',
    link: `${BASE_URL}/fr-fr/media/image/zenyatta`,
    thumbnail_url: null,
    parts: 1,
  },

  // Images / Screenshots - Cartes
  {
    id: 'image-sojourn-map',
    title: 'Sojourn',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/sojourn`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-new-queen-street',
    title: 'New Queen Street',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/new-queen-street`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-midtown',
    title: 'Midtown',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/midtown`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-colosseo',
    title: 'Colosseo',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/colosseo`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-circuit-royal',
    title: 'Circuit Royal',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/circuit-royal`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-malevento',
    title: 'Malevento',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/malevento`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-kanezaka',
    title: 'Kanezaka',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/kanezaka`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-havana',
    title: 'La Havane',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/havana`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-paris',
    title: 'Paris',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/paris`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-busan',
    title: 'Busan',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/busan`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-petra',
    title: 'Petra',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/petra`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-rialto',
    title: 'Rialto',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/rialto`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-ayutthaya',
    title: 'Ayutthaya',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/ayutthaya`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-blizzard-world',
    title: 'Blizzard World',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/blizzard-world`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-junkertown',
    title: 'Junkertown',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/junkertown`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-chateau-guillard',
    title: 'Château Guillard',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/chateau-guillard`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-oasis',
    title: 'Oasis',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/oasis`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-eichenwalde',
    title: 'Eichenwalde',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/eichenwalde`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-hollywood',
    title: 'Hollywood',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/hollywood`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-dorado',
    title: 'Dorado',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/dorado`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-numbani',
    title: 'Numbani',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/numbani`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-volskaya',
    title: 'Usine Volskaya',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/volskaya`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-watchpoint-gibraltar',
    title: 'Observatoire : Gibraltar',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/watchpoint-gibraltar`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-hanamura',
    title: 'Hanamura',
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/hanamura`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-kings-row',
    title: "King's Row",
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/kings-row`,
    thumbnail_url: null,
    parts: 1,
  },
  {
    id: 'image-temple-of-anubis',
    title: "Temple d'Anubis",
    type: 'screenshot',
    category: 'Cartes',
    link: `${BASE_URL}/fr-fr/media/image/temple-of-anubis`,
    thumbnail_url: null,
    parts: 1,
  },
];

export type BlizzardMediaItem = {
  id: string;
  title: string;
  type: MediaType;
  category: string | null;
  link: string;
  thumbnail_url: string | null;
  description: string | null;
  parts: number;
};

export type BlizzardMediaResponse = {
  items: BlizzardMediaItem[];
  types: MediaType[];
};

/**
 * Détecte le type de média et extrait l'ID depuis une URL
 */
function parseMediaUrl(href: string): { type: MediaType; id: string } | null {
  // Comics: /media/comic/{slug}
  const comicMatch = href.match(/\/media\/comic\/([^/?#]+)/);
  if (comicMatch) return { type: 'comic', id: `comic-${comicMatch[1]}` };

  // Short stories: /media/short-story/{slug}
  const storyMatch = href.match(/\/media\/short-story\/([^/?#]+)/);
  if (storyMatch) return { type: 'story', id: `story-${storyMatch[1]}` };

  // Music: /media/music/{slug}
  const musicMatch = href.match(/\/media\/music\/([^/?#]+)/);
  if (musicMatch) return { type: 'music', id: `music-${musicMatch[1]}` };

  // Images: /media/image/{slug}
  const imageMatch = href.match(/\/media\/image\/([^/?#]+)/);
  if (imageMatch) return { type: 'screenshot', id: `image-${imageMatch[1]}` };

  return null;
}

/**
 * Scrape les médias depuis le site Blizzard
 */
async function scrapeBlizzardMedia(): Promise<BlizzardMediaItem[]> {
  const response = await fetch(MEDIA_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch media: ${response.status} ${response.statusText}`
    );
  }

  const html = await response.text();
  const $ = load(html);
  const items: BlizzardMediaItem[] = [];
  const seenIds = new Set<string>();

  // Approche 1: Chercher directement tous les blz-card avec style contenant --backgroundImg
  $('blz-card[style*="backgroundImg"]').each((_, cardEl) => {
    const $card = $(cardEl);
    const style = $card.attr('style') || '';

    // Trouver le lien dans cette card
    const $link = $card.find('a[href*="/media/"]').first();
    if (!$link.length) return;

    const href = $link.attr('href');
    if (!href) return;

    const parsed = parseMediaUrl(href);
    if (!parsed || seenIds.has(parsed.id)) return;

    // Extraire le titre depuis [slot="heading"]
    const title =
      $card.find('[slot="heading"]').text().trim() ||
      $card.find('h2, h3, h4').first().text().trim();

    if (!title || title.length < 2) return;

    // Extraire la thumbnail depuis --backgroundImg: url(...)
    const bgImgMatch = style.match(
      /--backgroundImg:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/
    );
    const thumbnail = bgImgMatch ? bgImgMatch[1] : null;

    // Déterminer la catégorie
    let category: string;
    switch (parsed.type) {
      case 'comic':
        category = 'Bande dessinée';
        break;
      case 'story':
        category = 'Nouvelle';
        break;
      case 'music':
        category = 'Musique';
        break;
      case 'screenshot':
        category = 'Image';
        break;
    }

    const fullLink = href.startsWith('http')
      ? href
      : `https://overwatch.blizzard.com${href}`;

    seenIds.add(parsed.id);
    items.push({
      id: parsed.id,
      title: title.replace(/\s+/g, ' ').trim(),
      type: parsed.type,
      category,
      link: fullLink,
      thumbnail_url: thumbnail,
      description: null,
      parts: 1,
    });
  });

  // Approche 2: Fallback - chercher les liens et remonter au parent
  const extractFromLink = (
    $el: ReturnType<typeof $>,
    href: string,
    parsed: { type: MediaType; id: string }
  ) => {
    if (seenIds.has(parsed.id)) return;

    // Chercher le conteneur parent (blz-card ou autre)
    const $parent = $el.parent();
    const $grandParent = $parent.parent();

    // Essayer plusieurs niveaux de parents pour trouver le style
    let thumbnail: string | null = null;
    let title = '';

    for (const $container of [$parent, $grandParent, $grandParent.parent()]) {
      const style = $container.attr('style') || '';
      if (style.includes('backgroundImg')) {
        const match = style.match(
          /--backgroundImg:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/
        );
        if (match) {
          thumbnail = match[1];
        }
      }

      if (!title) {
        title =
          $container.find('[slot="heading"]').text().trim() ||
          $container.find('h2, h3').first().text().trim();
      }

      if (thumbnail && title) break;
    }

    // Fallback titre
    if (!title) {
      title = $el.text().trim();
    }

    // Nettoyer le titre
    title = title.replace(/\s+/g, ' ').trim();
    const categoryPatterns = [
      /^Bande dessinée\s*/i,
      /\s*Bande dessinée$/i,
      /^Nouvelle\s*/i,
      /\s*Nouvelle$/i,
      /^Musique\s*/i,
      /\s*Musique$/i,
      /^Image\s*/i,
      /\s*Image$/i,
    ];
    for (const pattern of categoryPatterns) {
      title = title.replace(pattern, '').trim();
    }

    if (!title || title.length < 2 || title.length > 200) return;

    // Fallback thumbnail: chercher img
    if (!thumbnail) {
      thumbnail =
        $el.find('img').attr('src') ||
        $parent.find('img').attr('src') ||
        $grandParent.find('img').attr('src') ||
        null;
    }

    let category: string;
    switch (parsed.type) {
      case 'comic':
        category = 'Bande dessinée';
        break;
      case 'story':
        category = 'Nouvelle';
        break;
      case 'music':
        category = 'Musique';
        break;
      case 'screenshot':
        category = 'Image';
        break;
    }

    const fullLink = href.startsWith('http')
      ? href
      : `https://overwatch.blizzard.com${href}`;

    seenIds.add(parsed.id);
    items.push({
      id: parsed.id,
      title: title
        .replace(/\s*[-–]\s*\d+\s*(?:parties|parts|épisodes)/i, '')
        .trim(),
      type: parsed.type,
      category,
      link: fullLink,
      thumbnail_url: thumbnail,
      description: null,
      parts: 1,
    });
  };

  // Chercher tous les liens vers /media/ avec les bons patterns
  $('a[href*="/media/comic/"]').each((_, element) => {
    const $el = $(element);
    const href = $el.attr('href');
    if (!href) return;
    const parsed = parseMediaUrl(href);
    if (parsed) extractFromLink($el, href, parsed);
  });

  $('a[href*="/media/short-story/"]').each((_, element) => {
    const $el = $(element);
    const href = $el.attr('href');
    if (!href) return;
    const parsed = parseMediaUrl(href);
    if (parsed) extractFromLink($el, href, parsed);
  });

  $('a[href*="/media/music/"]').each((_, element) => {
    const $el = $(element);
    const href = $el.attr('href');
    if (!href) return;
    const parsed = parseMediaUrl(href);
    if (parsed) extractFromLink($el, href, parsed);
  });

  $('a[href*="/media/image/"]').each((_, element) => {
    const $el = $(element);
    const href = $el.attr('href');
    if (!href) return;
    const parsed = parseMediaUrl(href);
    if (parsed) extractFromLink($el, href, parsed);
  });

  // Approche alternative: chercher tous les liens /media/ génériques
  $('a[href*="/media/"]').each((_, element) => {
    const $el = $(element);
    const href = $el.attr('href');
    if (!href) return;

    // Ignorer les liens de navigation
    if (
      href === '/fr-fr/media/' ||
      href === '/media/' ||
      href.endsWith('/media/')
    )
      return;

    const parsed = parseMediaUrl(href);
    if (parsed) extractFromLink($el, href, parsed);
  });

  return items;
}

/**
 * Sauvegarde les médias en base de données (upsert)
 */
async function saveMediaToDb(items: BlizzardMediaItem[]): Promise<void> {
  if (items.length === 0 || !supabaseAdmin) return;

  const records = items.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    category: item.category,
    link: item.link,
    thumbnail_url: item.thumbnail_url,
    description: item.description,
    parts: item.parts,
  }));

  const { error } = await supabaseAdmin
    .from('blizzard_media')
    .upsert(records, { onConflict: 'id' });

  if (error) {
    console.error('[/api/blizzard-media] failed to save to DB:', error);
  }
}

/**
 * Récupère les médias depuis la base de données
 */
async function getMediaFromDb(
  type?: MediaType,
  limit = 50
): Promise<BlizzardMediaItem[]> {
  if (!supabaseAdmin) return [];

  let query = supabaseAdmin
    .from('blizzard_media')
    .select(
      'id, title, type, category, link, thumbnail_url, description, parts'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (type) {
    query = query.eq('type', type);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[/api/blizzard-media] failed to fetch from DB:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type as MediaType,
    category: row.category,
    link: row.link,
    thumbnail_url: row.thumbnail_url,
    description: row.description,
    parts: row.parts || 1,
  }));
}

/**
 * Retourne les médias statiques connus comme fallback
 */
function getStaticMedia(type?: MediaType): BlizzardMediaItem[] {
  let items = KNOWN_MEDIA.map((item) => ({ ...item, description: null }));

  if (type) {
    items = items.filter((item) => item.type === type);
  }

  return items;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BlizzardMediaResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 20 requests per minute (scraping is expensive)
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60 * 1000 }, 'blizzard-media')
  )
    return;

  const type = req.query.type as MediaType | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

  try {
    // 1. Essayer de scraper les médias depuis Blizzard
    let scrapedItems: BlizzardMediaItem[] = [];
    try {
      scrapedItems = await scrapeBlizzardMedia();
      // Sauvegarder en BDD (en arrière-plan)
      if (scrapedItems.length > 0) {
        saveMediaToDb(scrapedItems).catch((err) => {
          console.error('[/api/blizzard-media] background save error:', err);
        });
      }
    } catch (scrapeError) {
      console.error('[/api/blizzard-media] scrape failed:', scrapeError);
    }

    // 2. Récupérer depuis la BDD
    const dbItems = await getMediaFromDb(type, limit);

    // 3. Déterminer la source de données à utiliser
    let items: BlizzardMediaItem[];

    if (dbItems.length >= 10) {
      // BDD a assez de données
      items = dbItems;
    } else if (scrapedItems.length >= 10) {
      // Scraping a fonctionné
      items = type
        ? scrapedItems.filter((item) => item.type === type)
        : scrapedItems;
    } else {
      // Fallback sur les données statiques
      console.log('[/api/blizzard-media] using static fallback data');
      items = getStaticMedia(type);

      // Sauvegarder les données statiques en BDD si elle est vide
      if (dbItems.length === 0) {
        saveMediaToDb(items).catch((err) => {
          console.error('[/api/blizzard-media] static save error:', err);
        });
      }
    }

    // Types disponibles
    const availableTypes = [...new Set(items.map((item) => item.type))];

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

    return res.status(200).json({
      items: items.slice(0, limit),
      types: availableTypes,
    });
  } catch (error) {
    console.error('[/api/blizzard-media] error:', error);

    // En cas d'erreur totale, renvoyer les données statiques
    const staticItems = getStaticMedia(type);
    return res.status(200).json({
      items: staticItems.slice(0, limit),
      types: [...new Set(staticItems.map((item) => item.type))],
    });
  }
}
