/**
 * Dispatcher d'alertes multi-canal. Configuré par variables d'environnement
 * (cf. .env.example). Chaque canal échoue indépendamment (jamais bloquant).
 *
 *   ntfy.sh        -> push téléphone, zéro compte (NTFY_TOPIC)
 *   macOS          -> notification + son (ALERT_MACOS=1, défaut sur darwin)
 *   Telegram       -> TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 *   Webhook        -> WEBHOOK_URL (POST JSON, ex. Slack/Discord/Zapier)
 *   console        -> toujours
 */
import { execFile } from 'node:child_process';
import type { Offer } from './sources.js';

export interface AlertConfig {
  ntfyTopic?: string;
  ntfyServer: string;
  macos: boolean;
  telegramToken?: string;
  telegramChatId?: string;
  webhookUrl?: string;
}

export function loadAlertConfig(): AlertConfig {
  const env = process.env;
  return {
    ntfyTopic: env.NTFY_TOPIC,
    ntfyServer: env.NTFY_SERVER || 'https://ntfy.sh',
    macos: env.ALERT_MACOS
      ? env.ALERT_MACOS === '1' || env.ALERT_MACOS === 'true'
      : process.platform === 'darwin',
    telegramToken: env.TELEGRAM_BOT_TOKEN,
    telegramChatId: env.TELEGRAM_CHAT_ID,
    webhookUrl: env.WEBHOOK_URL,
  };
}

/** Liste lisible des canaux actifs (pour log de démarrage). */
export function activeChannels(cfg: AlertConfig): string[] {
  const out = ['console'];
  if (cfg.ntfyTopic) out.push(`ntfy:${cfg.ntfyTopic}`);
  if (cfg.macos) out.push('macOS');
  if (cfg.telegramToken && cfg.telegramChatId) out.push('telegram');
  if (cfg.webhookUrl) out.push('webhook');
  return out;
}

function buildMessage(offers: Offer[]): { title: string; body: string } {
  const n = offers.length;
  const title = `🎉 EN STOCK (${n}) — Midea PortaSplit`;
  const body = offers.map((o) => `• ${o.label}`).join('\n');
  return { title, body };
}

/** Les headers HTTP doivent être ASCII (ByteString) : on retire emoji/accents. */
function asciiHeader(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .replace(/[^\x20-\x7E]/g, '') // tout non-ASCII (emoji, —, …)
    .replace(/\s+/g, ' ')
    .trim();
}

async function sendNtfy(cfg: AlertConfig, title: string, body: string, url: string): Promise<void> {
  if (!cfg.ntfyTopic) return;
  const res = await fetch(`${cfg.ntfyServer}/${cfg.ntfyTopic}`, {
    method: 'POST',
    headers: {
      // Le titre passe en header (ASCII) ; les emoji arrivent via Tags.
      Title: asciiHeader(title) || 'Midea PortaSplit - EN STOCK',
      Priority: 'urgent',
      Tags: 'rotating_light,snowflake',
      Click: url,
    },
    body, // le corps (UTF-8) garde les emoji/accents
  });
  if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
}

async function sendTelegram(cfg: AlertConfig, title: string, body: string): Promise<void> {
  if (!cfg.telegramToken || !cfg.telegramChatId) return;
  await fetch(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: cfg.telegramChatId,
      text: `*${title}*\n${body}`,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
}

async function sendWebhook(cfg: AlertConfig, title: string, body: string, offers: Offer[]): Promise<void> {
  if (!cfg.webhookUrl) return;
  await fetch(cfg.webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: `${title}\n${body}`, offers }),
  });
}

function sendMacOS(title: string, body: string): Promise<void> {
  return new Promise((resolve) => {
    const safe = (s: string) => s.replace(/["\\]/g, ' ').replace(/\n/g, ' · ');
    const script = `display notification "${safe(body)}" with title "${safe(title)}" sound name "Glass"`;
    execFile('osascript', ['-e', script], () => resolve());
  });
}

/** Envoie une alerte sur tous les canaux actifs. Ne rejette jamais. */
export async function dispatchAlert(cfg: AlertConfig, offers: Offer[]): Promise<void> {
  if (offers.length === 0) return;
  const { title, body } = buildMessage(offers);
  const url = offers[0]?.url ?? 'https://www.optimea.fr';

  // Console (toujours, bien visible)
  console.log(`\n\x1b[1m\x1b[42m\x1b[30m  ${title}  \x1b[0m`);
  for (const o of offers) console.log(`   \x1b[32m→ ${o.label}\x1b[0m  \x1b[36m${o.url}\x1b[0m`);

  const channels: Array<[string, Promise<void>]> = [
    ['ntfy', sendNtfy(cfg, title, body, url)],
    ['telegram', sendTelegram(cfg, title, body)],
    ['webhook', sendWebhook(cfg, title, body, offers)],
    ['macOS', cfg.macos ? sendMacOS(title, body) : Promise.resolve()],
  ];
  const results = await Promise.allSettled(channels.map(([, p]) => p));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const name = channels[i]?.[0] ?? '?';
      console.error(`   ⚠️ canal "${name}" en échec : ${String(r.reason).slice(0, 120)}`);
    }
  });
}
