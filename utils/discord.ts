// utils/discord.ts
// Helpers for posting notifications to Discord webhooks.
// Webhook URLs are read from env vars at call time so they are never bundled
// into the client. All helpers are fire-and-forget: errors are logged but
// never thrown to the caller.

type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

type DiscordEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
};

type DiscordWebhookPayload = {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
};

export async function postToDiscordWebhook(
  webhookUrl: string,
  payload: DiscordWebhookPayload
): Promise<void> {
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        '[discord] webhook POST failed:',
        res.status,
        text.slice(0, 300)
      );
    }
  } catch (e) {
    console.error('[discord] webhook POST error:', e);
  }
}

export type ScrimNotification = {
  fromTeamName: string;
  targetTeamName: string;
  preferredDate?: string | null;
  message?: string | null;
  requesterDisplayName?: string | null;
};

export async function notifyScrimRequest(
  data: ScrimNotification
): Promise<void> {
  const webhookUrl = process.env.DISCORD_SCRIM_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[discord] DISCORD_SCRIM_WEBHOOK_URL not configured');
    return;
  }

  const fields: DiscordEmbedField[] = [
    { name: 'Équipe demandeuse', value: data.fromTeamName, inline: true },
    { name: 'Équipe cible', value: data.targetTeamName, inline: true },
  ];

  if (data.preferredDate) {
    let dateLabel = data.preferredDate;
    try {
      dateLabel = new Date(data.preferredDate).toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      // keep raw value
    }
    fields.push({ name: 'Date souhaitée', value: dateLabel, inline: false });
  }

  if (data.message) {
    fields.push({
      name: 'Message',
      value: data.message.slice(0, 1000),
      inline: false,
    });
  }

  if (data.requesterDisplayName) {
    fields.push({
      name: 'Capitaine',
      value: data.requesterDisplayName,
      inline: true,
    });
  }

  await postToDiscordWebhook(webhookUrl, {
    username: "OW Women's Cup — Scrims",
    embeds: [
      {
        title: '🎯 Nouvelle demande de scrim',
        description: `**${data.fromTeamName}** souhaite affronter **${data.targetTeamName}**.`,
        color: 0x06b6d4, // cyan-500
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'À traiter dans /admin/demandes' },
      },
    ],
  });
}
