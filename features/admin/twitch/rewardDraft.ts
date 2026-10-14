// features/admin/twitch/rewardDraft.ts — saisie d'une récompense de points de
// chaîne (création et modification en ligne) → corps de requête Helix.
//
// Pur, sans React : sorti de TwitchRewardsPanel pour être testé
// (tests/unit/twitchRewardDraft.test.ts). Les deux formulaires appliquent la
// même règle : titre non vide, coût entier ≥ 1, vérifiés dans cet ordre.

// Limites Twitch : titre de reward ≤ 45, prompt ≤ 200.
export const MAX_REWARD_TITLE = 45;
export const MAX_REWARD_PROMPT = 200;

/** Formulaire de création, tel que saisi (le coût reste une chaîne). */
export type RewardDraft = {
  title: string;
  cost: string;
  prompt: string;
  userInput: boolean;
  skipQueue: boolean;
  /** '' = couleur par défaut de Twitch (rien n'est envoyé). */
  color: string;
};

export const EMPTY_REWARD_DRAFT: RewardDraft = {
  title: '',
  cost: '',
  prompt: '',
  userInput: false,
  skipQueue: false,
  color: '',
};

export type RewardCreateBody = {
  title: string;
  cost: number;
  prompt?: string;
  is_user_input_required?: boolean;
  should_redemptions_skip_request_queue?: boolean;
  background_color?: string;
};

/** Modification en ligne : titre, coût, message, file d'attente, limite par live. */
export type RewardEdit = {
  id: string;
  title: string;
  cost: string;
  prompt: string;
  /**
   * Sauter la file d'attente. Modifiable après coup parce qu'une récompense
   * du drop TCG DOIT garder sa file : sautée, l'échange est FULFILLED d'office
   * et Twitch refuse de l'annuler — le site ne peut plus rembourser.
   */
  skipQueue: boolean;
  /**
   * Échanges permis par personne et par live, saisi ('' = illimité). Le drop
   * TCG n'accorde qu'un paquet par récompense, par live et par personne : à 1,
   * Twitch refuse lui-même le second échange au lieu de le laisser en attente.
   */
  maxPerStream: string;
};

export type RewardDraftError =
  | 'titleRequired'
  | 'costInvalid'
  | 'maxPerStreamInvalid';

type Checked<T> =
  | { ok: true; value: T }
  | { ok: false; error: RewardDraftError };

function checkTitleAndCost(
  rawTitle: string,
  rawCost: string
): Checked<{ title: string; cost: number }> {
  const title = rawTitle.trim();
  if (!title) return { ok: false, error: 'titleRequired' };
  const cost = Number(rawCost);
  if (!Number.isInteger(cost) || cost < 1) {
    return { ok: false, error: 'costInvalid' };
  }
  return { ok: true, value: { title, cost } };
}

/** Corps du POST : les champs optionnels vides ne sont pas envoyés. */
export function rewardCreateBody(
  draft: RewardDraft
): Checked<RewardCreateBody> {
  const base = checkTitleAndCost(draft.title, draft.cost);
  if (!base.ok) return base;
  const body: RewardCreateBody = { ...base.value };
  const prompt = draft.prompt.trim();
  if (prompt) body.prompt = prompt;
  if (draft.userInput) body.is_user_input_required = true;
  if (draft.skipQueue) body.should_redemptions_skip_request_queue = true;
  const color = draft.color.trim();
  if (color) body.background_color = color;
  return { ok: true, value: body };
}

/** Limite par personne et par live telle que Helix l'attend. */
type MaxPerStreamPatch =
  | { is_max_per_user_per_stream_enabled: false }
  | {
      is_max_per_user_per_stream_enabled: true;
      max_per_user_per_stream: number;
    };

/** Champ vide = pas de limite ; sinon un entier ≥ 1. */
function checkMaxPerStream(raw: string): Checked<MaxPerStreamPatch> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: { is_max_per_user_per_stream_enabled: false } };
  }
  const max = Number(trimmed);
  if (!Number.isInteger(max) || max < 1) {
    return { ok: false, error: 'maxPerStreamInvalid' };
  }
  return {
    ok: true,
    value: {
      is_max_per_user_per_stream_enabled: true,
      max_per_user_per_stream: max,
    },
  };
}

/**
 * Corps du PATCH : le message est toujours envoyé (vide = l'effacer), la file
 * d'attente et la limite par live aussi (`false` est une valeur, pas une
 * absence : c'est ce qui les coupe).
 */
export function rewardEditPatch(edit: RewardEdit): Checked<
  {
    title: string;
    cost: number;
    prompt: string;
    should_redemptions_skip_request_queue: boolean;
  } & MaxPerStreamPatch
> {
  const base = checkTitleAndCost(edit.title, edit.cost);
  if (!base.ok) return base;
  const limit = checkMaxPerStream(edit.maxPerStream);
  if (!limit.ok) return limit;
  return {
    ok: true,
    value: {
      ...base.value,
      prompt: edit.prompt.trim(),
      should_redemptions_skip_request_queue: edit.skipQueue,
      ...limit.value,
    },
  };
}
