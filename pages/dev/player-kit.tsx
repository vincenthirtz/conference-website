// pages/dev/player-kit.tsx — aperçu de la coquille et des archétypes de
// l'espace joueuse (docs/PLAN-industrialisation-joueur.md, lot P8). 404 en
// production ; « bare » (utils/layout/appChrome.ts, préfixe /dev/) : ni barre
// du haut ni pied de page — la page montre elle-même la navigation.
//
// Tout est rendu sous `[data-surface="player"]` (densité 44 px). À regarder à
// 375 px (référence) puis à 1280 px (`lg:` = amélioration).

import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import {
  Button,
  ButtonLink,
  Card,
  Chip,
  EntityHeader,
  FilterSelect,
  ListSearch,
  MetaList,
  StatTile,
  rubanEyebrow,
} from '@/features/ruban';
import PlayerNav from '@/features/player/_shared/shell/PlayerNav';
import {
  CollectionView,
  FicheFold,
  FicheView,
  FilView,
  ListeRow,
  ListeView,
  ParcoursView,
} from '@/features/player/_shared/ui';

export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} };

const SECTIONS = [
  'coquille',
  'fil',
  'fiche',
  'liste',
  'parcours',
  'collection',
] as const;
type Section = (typeof SECTIONS)[number];

const TEAMS = Array.from({ length: 23 }, (_, i) => ({
  id: `t${i}`,
  name: `Équipe ${String.fromCharCode(65 + (i % 26))}${i + 1}`,
  region: i % 3 === 0 ? 'EU' : 'NA',
}));

const CARDS = Array.from({ length: 40 }, (_, i) => ({
  id: `c${i}`,
  name: `Carte ${i + 1}`,
  rarity: ['commune', 'rare', 'épique', 'légendaire'][i % 4],
}));

const STEPS = [
  { key: 'identite', label: 'Identité de l’équipe' },
  { key: 'roster', label: 'Roster' },
  { key: 'confirmation', label: 'Confirmation' },
];

function ShellDemo() {
  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      <p className={rubanEyebrow}>Coquille — navigation basse (mobile)</p>
      <div className="max-w-[375px] overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))]">
        <div className="h-40 p-4 text-[var(--t3,#a39ba6)]">Contenu de page</div>
        <PlayerNav variant="bottom" pathname="/player/matches" />
      </div>
      <p className={rubanEyebrow}>Coquille — rail latéral (desktop)</p>
      <div className="flex h-[420px] max-w-3xl overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))]">
        <PlayerNav variant="rail" pathname="/player/tcg/echanges" />
        <div className="flex-1 p-4 text-[var(--t3,#a39ba6)]">
          Contenu de page — la barre du haut (PlayerTopBar : onglets, menu Site,
          cloche, déconnexion) reste la barre globale de l’app.
        </div>
      </div>
    </div>
  );
}

function FilDemo() {
  const [news, setNews] = useState(0);
  return (
    <FilView
      title="Tableau de bord"
      subtitle="Prochain match mercredi 19 h"
      status={news ? `${news} nouveauté(s) dans le fil` : ''}
      actions={
        <Button size="sm" onClick={() => setNews((n) => n + 1)}>
          Simuler une mise à jour
        </Button>
      }
      primaryAction={
        <ButtonLink href="/dev/player-kit" variant="primary">
          Faire mon check-in
        </ButtonLink>
      }
    >
      <Card padding="sm">
        <p className={rubanEyebrow}>Prochain match</p>
        <p className="mt-2">Nova vs Aurora — mercredi 19 h</p>
        <div className="mt-3 flex gap-2">
          <Chip tone="warn">Check-in ouvert</Chip>
        </div>
      </Card>
      <Card padding="sm">
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Victoires" value="5" tone="ok" />
          <StatTile label="Défaites" value="2" tone="err" />
        </div>
      </Card>
      <Card padding="sm" live>
        <p className={rubanEyebrow}>En direct</p>
        <p className="mt-2">Votre scrim a commencé.</p>
      </Card>
    </FilView>
  );
}

function FicheDemo() {
  const [saved, setSaved] = useState('');
  return (
    <FicheView
      header={
        <EntityHeader
          crest="NOV"
          title="Nova Esports"
          meta="Créée le 30 août 2026"
          status={<Chip tone="ok">Inscrite</Chip>}
        />
      }
      status={saved}
      aside={
        <Card padding="sm">
          <MetaList
            items={[
              { label: 'Rang', value: '#4' },
              { label: 'Membres', value: '7' },
            ]}
          />
        </Card>
      }
      actions={
        <>
          <Button variant="ghost">Annuler</Button>
          <Button variant="primary" onClick={() => setSaved('Enregistré')}>
            Enregistrer
          </Button>
        </>
      }
    >
      <FicheFold title="Identité">
        <p>Nom, tag, logo, région.</p>
      </FicheFold>
      <FicheFold title="Roster" defaultOpen={false}>
        <p>7 membres, 1 remplaçante.</p>
      </FicheFold>
    </FicheView>
  );
}

function ListeDemo() {
  const [q, setQ] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  const [shown, setShown] = useState(8);
  const rows = TEAMS.filter(
    (t) =>
      t.name.toLowerCase().includes(q.toLowerCase()) &&
      (!region || t.region === region)
  );
  return (
    <ListeView
      title="Annuaire"
      subtitle="Équipes du réseau"
      labels={{
        filters: 'Filtres',
        closeFilters: 'Fermer',
        loadMore: 'Charger plus',
        loading: 'Chargement…',
      }}
      search={
        <ListSearch
          label="Rechercher une équipe"
          placeholder="Rechercher…"
          value={q}
          onChange={setQ}
        />
      }
      filters={
        <FilterSelect
          label="Région"
          allLabel="Toutes"
          value={region}
          onChange={setRegion}
          options={[
            { value: 'EU', label: 'EU' },
            { value: 'NA', label: 'NA' },
          ]}
        />
      }
      summary={`${Math.min(shown, rows.length)} sur ${rows.length}`}
      empty={
        <Card padding="sm" data-empty="">
          <p>Aucune équipe ne correspond.</p>
        </Card>
      }
      hasMore={shown < rows.length}
      onLoadMore={() => setShown((n) => n + 8)}
    >
      {rows.slice(0, shown).map((t) => (
        <ListeRow key={t.id} onClick={() => {}}>
          <span>{t.name}</span>
          <Chip tone="neutral">{t.region}</Chip>
        </ListeRow>
      ))}
    </ListeView>
  );
}

function ParcoursDemo() {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  return (
    <ParcoursView
      title="Créer mon équipe"
      steps={STEPS}
      current={step}
      progressLabel="Progression"
      position={`Étape ${step + 1} sur ${STEPS.length}`}
      backLabel="Retour"
      onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
      next={
        <Button
          variant="primary"
          onClick={() => setStep((s) => (last ? 0 : s + 1))}
        >
          {last ? 'Recommencer' : 'Continuer'}
        </Button>
      }
    >
      <p>Une seule décision sur cet écran.</p>
    </ParcoursView>
  );
}

function CollectionDemo() {
  return (
    <CollectionView
      title="Ma collection"
      subtitle="40 cartes"
      items={CARDS}
      getKey={(c) => c.id}
      tileLabel={(c) => `${c.name} (${c.rarity})`}
      renderTile={(c) => (
        <span className="flex aspect-[5/7] items-center justify-center text-[12px] text-[var(--t2,#c7bfca)]">
          {c.name}
        </span>
      )}
      renderDetail={(c) => (
        <Card>
          <p className={rubanEyebrow}>{c.rarity}</p>
          <p className="mt-2 text-[22px]">{c.name}</p>
        </Card>
      )}
      summary="40 cartes"
      labels={{ close: 'Fermer', more: 'Afficher plus' }}
      pageSize={12}
    />
  );
}

const DEMOS: Record<Section, () => React.JSX.Element> = {
  coquille: ShellDemo,
  fil: FilDemo,
  fiche: FicheDemo,
  liste: ListeDemo,
  parcours: ParcoursDemo,
  collection: CollectionDemo,
};

export default function PlayerKitPreview() {
  const [section, setSection] = useState<Section>('coquille');
  const Demo = DEMOS[section];
  return (
    <div data-surface="player" className="min-h-screen py-6">
      <div
        role="tablist"
        aria-label="Archétypes"
        className="mb-6 flex gap-1 overflow-x-auto px-4"
      >
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={section === s}
            onClick={() => setSection(s)}
            className="shrink-0 px-3 text-[var(--t2,#c7bfca)]"
          >
            {s}
          </button>
        ))}
      </div>
      <main aria-label={section} data-archetype={section}>
        <Demo />
      </main>
    </div>
  );
}
