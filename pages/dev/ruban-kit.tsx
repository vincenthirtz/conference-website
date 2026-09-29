// pages/dev/ruban-kit.tsx — la preuve visuelle du kit « Le Ruban » unique
// (docs/PLAN-industrialisation-joueur.md, lot P7) : chaque brique de
// features/ruban/, rendue une colonne par surface. 404 en production ;
// « bare » (utils/layout/appChrome.ts, préfixe /dev/) : pas de coquille.
//
// Aujourd'hui une seule surface (admin). La surface joueuse s'ajoutera en
// ajoutant `'player'` à SURFACES une fois styles/player-ruban.css posé : les
// deux colonnes ne doivent alors différer QUE par la densité.

import { useState, type ReactNode } from 'react';
import type { GetServerSideProps } from 'next';
import {
  Button,
  ButtonLink,
  Chip,
  DangerZone,
  EntityHeader,
  FicheLayout,
  FicheSection,
  FilterSelect,
  ListSearch,
  ListToolbar,
  MetaList,
  PageHeader,
  StatTile,
  rubanCardPadded,
  rubanEyebrow,
  rubanErrBox,
  rubanFormInput,
  rubanFormLabel,
  rubanInset,
  rubanOkBox,
  rubanRow,
  rubanRowLink,
  rubanSpinner,
  rubanWarnBox,
  type ButtonSize,
  type ButtonVariant,
  type ChipTone,
  type StatTone,
} from '@/features/ruban';

export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} };

/** Surfaces rendues côte à côte. `player` : lot P7, seconde moitié. */
const SURFACES = ['admin'] as const;

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
const SIZES: ButtonSize[] = ['md', 'sm', 'xs'];
const CHIP_TONES: ChipTone[] = [
  'ok',
  'warn',
  'err',
  'neutral',
  'brand',
  'live',
];
const STAT_TONES: StatTone[] = ['neutral', 'ok', 'warn', 'err', 'brand'];

function Block({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3" data-brick={name}>
      <p className={rubanEyebrow}>{name}</p>
      {children}
    </div>
  );
}

function KitColumn({ surface }: { surface: (typeof SURFACES)[number] }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div data-surface={surface} className="min-w-0 flex-1 p-6">
      {/* `main` : les règles de surface visent `[data-surface] main h1`… */}
      <main aria-label={surface} className="flex flex-col gap-10">
        <PageHeader
          title="Le Ruban"
          subtitle={`Surface ${surface} · 9 briques`}
          badge={<Chip tone="live">En direct</Chip>}
          actions={
            <>
              <Button variant="ghost" size="sm">
                Exporter
              </Button>
              <Button variant="primary" size="sm">
                Nouvelle équipe
              </Button>
            </>
          }
        />

        <Block name="Button / ButtonLink">
          {SIZES.map((size) => (
            <div key={size} className="flex flex-wrap gap-2.5">
              {VARIANTS.map((variant) => (
                <Button key={variant} variant={variant} size={size}>
                  {variant} {size}
                </Button>
              ))}
              <Button size={size} disabled>
                disabled
              </Button>
              <ButtonLink href="/dev/ruban-kit" size={size} variant="secondary">
                lien
              </ButtonLink>
            </div>
          ))}
        </Block>

        <Block name="Chip">
          <div className="flex flex-wrap gap-2">
            {CHIP_TONES.map((tone) => (
              <Chip key={tone} tone={tone}>
                {tone}
              </Chip>
            ))}
          </div>
        </Block>

        <Block name="StatTile">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {STAT_TONES.map((tone) => (
              <StatTile
                key={tone}
                tone={tone}
                label="Check-in"
                value="6 / 8"
                hint={`ton ${tone}`}
              />
            ))}
          </div>
        </Block>

        <Block name="ListToolbar / ListSearch / FilterSelect">
          <ListToolbar
            search={
              <ListSearch
                value={q}
                onChange={setQ}
                placeholder="Rechercher une équipe"
                label="Rechercher"
              />
            }
            filters={
              <FilterSelect
                label="Statut"
                allLabel="Toutes"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'ok', label: 'Validée' },
                  { value: 'wait', label: 'En attente' },
                ]}
              />
            }
            note="Trié par nom"
          />
        </Block>

        <Block name="EntityHeader">
          <EntityHeader
            crest="HSP"
            title="Hinode Spirit"
            meta="Créée le 30 août 2026 · modifiée il y a 2 h"
            status={<Chip tone="warn">Non enregistré</Chip>}
            actions={<Button variant="primary">Enregistrer</Button>}
          />
        </Block>

        <Block name="FicheLayout / FicheSection / MetaList">
          <FicheLayout
            main={
              <FicheSection title="Identité">
                <label className={rubanFormLabel} htmlFor={`${surface}-name`}>
                  Nom
                </label>
                <input
                  id={`${surface}-name`}
                  className={rubanFormInput}
                  defaultValue="Hinode Spirit"
                />
              </FicheSection>
            }
            aside={
              <FicheSection title="Métadonnées" eyebrow>
                <MetaList
                  items={[
                    { label: 'Identifiant', value: '4f2a1c9e' },
                    { label: 'Membres', value: 7 },
                  ]}
                />
              </FicheSection>
            }
          />
        </Block>

        <Block name="DangerZone">
          <DangerZone
            confirmName="HSP"
            labels={{
              title: 'Zone sensible',
              intro: 'Chaque action demande de retaper le nom.',
              typeToConfirm: 'Tapez « {name} » pour confirmer',
              cancel: 'Annuler',
            }}
            actions={[
              {
                id: 'delete',
                title: 'Supprimer l’équipe',
                description: 'Irréversible.',
                actionLabel: 'Exécuter',
                onConfirm: () => {},
              },
            ]}
          />
        </Block>

        <Block name="ruban.ts (classes)">
          <div className={rubanCardPadded}>
            <div className="flex flex-col gap-3">
              <div className={`${rubanInset} p-3`}>rubanInset</div>
              <div className={`${rubanRow(true)} p-3`}>rubanRow(live)</div>
              <button type="button" className={rubanRowLink}>
                rubanRowLink
              </button>
              <p className={rubanErrBox}>rubanErrBox</p>
              <p className={rubanWarnBox}>rubanWarnBox</p>
              <p className={rubanOkBox}>rubanOkBox</p>
              <div className={rubanSpinner} aria-hidden />
            </div>
          </div>
        </Block>
      </main>
    </div>
  );
}

export default function RubanKitPreview() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {SURFACES.map((s) => (
        <KitColumn key={s} surface={s} />
      ))}
    </div>
  );
}
