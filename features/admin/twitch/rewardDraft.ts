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

/** Modification en ligne : titre, coût, message — ce que Helix accepte. */
export type RewardEdit = {
  id: string;
  title: string;
  cost: string;
  prompt: string;
};

export type RewardDraftError = 'titleRequired' | 'costInvalid';

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

/** Corps du PATCH : le message est toujours envoyé (vide = l'effacer). */
export function rewardEditPatch(
  edit: RewardEdit
): Checked<{ title: string; cost: number; prompt: string }> {
  const base = checkTitleAndCost(edit.title, edit.cost);
  if (!base.ok) return base;
  return { ok: true, value: { ...base.value, prompt: edit.prompt.trim() } };
}
