#!/usr/bin/env node
/**
 * One-shot script: create a news entry for a team's latest tournament registration.
 *
 * Usage:
 *   node scripts/create-team-news.mjs <teamId>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no extra deps)
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = Object.fromEntries(
  envContent
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const teamId = process.argv[2];
if (!teamId) {
  console.error('Usage: node scripts/create-team-news.mjs <teamId>');
  process.exit(1);
}

// 1. Fetch team
const { data: team, error: teamErr } = await supabase
  .from('teams')
  .select('id, name, logo_url')
  .eq('id', teamId)
  .single();

if (teamErr || !team) {
  console.error('Team not found:', teamErr?.message);
  process.exit(1);
}

console.log(`Team: ${team.name}`);

// 2. Find latest tournament registration
const { data: reg, error: regErr } = await supabase
  .from('tournament_teams')
  .select('tournament_id, created_at, tournaments(id, name)')
  .eq('team_id', teamId)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (regErr || !reg) {
  console.error('No tournament registration found:', regErr?.message);
  process.exit(1);
}

const tournament = reg.tournaments;
console.log(`Tournament: ${tournament.name}`);

// 3. Create news
const newsSlug = `tournament-${tournament.id}-team-${teamId}-${Date.now().toString(36)}`;
const { data: news, error: newsErr } = await supabase
  .from('news')
  .insert({
    title: `${team.name} rejoint le tournoi ${tournament.name}`,
    slug: newsSlug,
    tag: 'tournaments',
    excerpt: `${team.name} s'est inscrite au tournoi ${tournament.name}.`,
    content: `L'équipe ${team.name} est désormais inscrite au tournoi ${tournament.name}. Bonne chance !`,
    image_url: team.logo_url ?? null,
    status: 'published',
    published_at: new Date().toISOString(),
  })
  .select('id, title, slug')
  .single();

if (newsErr) {
  console.error('Failed to create news:', newsErr.message);
  process.exit(1);
}

console.log(
  `News created: "${news.title}" (id: ${news.id}, slug: ${news.slug})`
);
