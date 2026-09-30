// features/player/demandes/hooks/useScrimBroadcast.ts — formulaire de la
// demande de scrim GROUPÉE (utils/teams/scrimBroadcast.ts) : audience, SR
// annoncé, créneaux, message — et l'aperçu des destinataires, relu à chaque
// changement d'audience ou de SR.

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as z from 'zod';
import { useSchemaForm } from '@/hooks/forms/useSchemaForm';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/components/Toast';
import { format } from '@/lib/i18n/useT';
import { playerErrorWithRef } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { demandesClient, type ScrimBroadcastAudience } from '../client';
import type { RequestsTexts } from './useRequestsScreen';

const AUDIENCES = ['all', 'level', 'searching'] as const;

/** '' ou un entier 0–5000 ; le champ reste texte pour se laisser vider. */
function parseSr(raw: string): number | null | 'invalid' {
  const v = raw.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 5000 ? n : 'invalid';
}

function broadcastSchema(t: RequestsTexts) {
  return z
    .object({
      audience: z.enum(AUDIENCES),
      announcedSr: z.string(),
      slots: z.array(z.string()),
      message: z.string(),
    })
    .superRefine((v, c) => {
      if (parseSr(v.announcedSr) === 'invalid')
        c.addIssue({
          code: 'custom',
          path: ['announcedSr'],
          message: t.announcedSrInvalid,
        });
      if (!v.slots.some((s) => s.trim()))
        c.addIssue({
          code: 'custom',
          path: ['slots'],
          message: t.atLeastOneSlot,
        });
    })
    .transform((v) => ({
      audience: v.audience as ScrimBroadcastAudience,
      announcedSr: parseSr(v.announcedSr) as number | null,
      message: v.message.trim() || undefined,
      proposedSlots: v.slots
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => new Date(s).toISOString()),
    }));
}

const INITIAL = {
  audience: 'all' as ScrimBroadcastAudience,
  announcedSr: '',
  slots: [''],
  message: '',
};

export function useScrimBroadcast(t: RequestsTexts, enabled: boolean) {
  const scope = usePlayerScope();
  const { addToast } = useToast();

  const form = useSchemaForm({
    schema: broadcastSchema(t),
    initialValues: INITIAL,
    errorFallback: t.errCreateRequest,
    describeError: (err: unknown, fallback: string) =>
      playerErrorWithRef(err, fallback),
    onSubmit: async (body) => {
      const res = await demandesClient.scrimBroadcast(body, scope);
      addToast(format(t.successBroadcast, { count: res.sent }), 'success');
      form.reset({ ...form.values, message: '', slots: [''] });
      await preview.refetch();
    },
  });

  // Aperçu des destinataires : relu quand l'audience ou le SR change (SR
  // temporisé : on ne relit pas à chaque chiffre tapé).
  const sr = useDebounce(form.values.announcedSr, 400);
  const srValue = parseSr(sr);
  const preview = useQuery({
    queryKey: playerKey(scope, 'demandes', 'scrim-broadcast', {
      audience: form.values.audience,
      sr: srValue === 'invalid' ? null : srValue,
    }),
    queryFn: () =>
      demandesClient.scrimBroadcastPreview(
        form.values.audience,
        srValue === 'invalid' ? null : srValue,
        scope
      ),
    enabled: enabled && srValue !== 'invalid',
    ...PLAYER_QUERY_OPTIONS,
  });

  // SR annoncé prérempli avec celui de l'équipe, une fois, s'il est connu.
  const teamSr = preview.data?.teamSkillRating ?? null;
  const { setValue } = form;
  const untouched = form.values.announcedSr === '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: seulement à l'arrivée du SR de l'équipe — vider le champ doit rester possible ensuite
  useEffect(() => {
    if (untouched && teamSr !== null) setValue('announcedSr', String(teamSr));
  }, [teamSr]);

  return { form, preview };
}

export type ScrimBroadcastScreen = ReturnType<typeof useScrimBroadcast>;
