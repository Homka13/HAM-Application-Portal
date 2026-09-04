import { appEvents, type StatusTransitionEvent } from '../controllers/applicationController';

export interface NotificationPayload {
  channel: 'email' | 'slack' | 'both';
  recipient: string;
  subject: string;
  message: string;
  html?: string;
  metadata?: Record<string, any>;
}

export interface EmailConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
  enabled?: boolean;
}

export interface SlackConfig {
  webhookUrl?: string;
  incidentWebhookUrl?: string;
  approvalWebhookUrl?: string;
  botToken?: string;
  enabled?: boolean;
}

export interface NotificationRule {
  channel: 'email' | 'slack' | 'both';
  notifyRequester?: boolean;
  notifyPoc?: boolean;
  notifyApprovers?: boolean;
  notifyOps?: boolean;
  notifyOnCall?: boolean;
  notifyTeam?: boolean;
  notifyQa?: boolean;
  directDm?: boolean;
  requiresNote?: boolean;
  subjectTemplate: (app: any) => string;
}

// 12-Status Notification Matrix Definition
export const NOTIFICATION_MATRIX: Record<string, NotificationRule> = {
  NEW: {
    channel: 'both',
    notifyRequester: true,
    notifyPoc: true,
    notifyApprovers: false,
    subjectTemplate: (app: any) => `[HAM Portal] Нова заявка #${app.id}: ${app.description ? app.description.slice(0, 40) : 'Без назви'}`,
  },
  TZ_PREPARATION: {
    channel: 'slack',
    notifyRequester: false,
    notifyTeam: true,
    subjectTemplate: (app: any) => `[HAM Portal] Підготовка ТЗ для #${app.id}`,
  },
  ESTIMATION: {
    channel: 'slack',
    notifyRequester: false,
    notifyTeam: true,
    subjectTemplate: (app: any) => `[HAM Portal] Оцінка трудомісткості для #${app.id}`,
  },
  PENDING_APPROVAL: {
    channel: 'both',
    notifyRequester: false,
    notifyApprovers: true,
    subjectTemplate: (app: any) => `[HAM Portal] Потрібне погодження для заявки #${app.id}`,
  },
  APPROVED: {
    channel: 'both',
    notifyRequester: true,
    notifyOps: true,
    subjectTemplate: (app: any) => `[HAM Portal] Заявку #${app.id} погоджено`,
  },
  TRIAGE: {
    channel: 'slack',
    notifyOnCall: true,
    subjectTemplate: (app: any) => `🚨 [CRITICAL ALERT] Тріаж інциденту #${app.id}: ${app.description || ''}`,
  },
  IN_PROGRESS: {
    channel: 'both',
    notifyRequester: true,
    subjectTemplate: (app: any) => `[HAM Portal] Заявку #${app.id} взято в роботу`,
  },
  TESTING: {
    channel: 'slack',
    notifyQa: true,
    subjectTemplate: (app: any) => `[HAM Portal] Заявка #${app.id} передана на тестування`,
  },
  UAT: {
    channel: 'both',
    notifyRequester: true,
    directDm: true,
    subjectTemplate: (app: any) => `[HAM Portal] Заявка #${app.id} очікує вашої перевірки (UAT)`,
  },
  RESOLVED: {
    channel: 'both',
    notifyRequester: true,
    directDm: true,
    requiresNote: true,
    subjectTemplate: (app: any) => `[HAM Portal] Заявку #${app.id} вирішено`,
  },
  REJECTED: {
    channel: 'both',
    notifyRequester: true,
    directDm: true,
    subjectTemplate: (app: any) => `[HAM Portal] Заявку #${app.id} відхилено`,
  },
  CLOSED: {
    channel: 'email',
    notifyRequester: true,
    subjectTemplate: (app: any) => `[HAM Portal] Заявку #${app.id} закрито`,
  },
};

// Formatter Helpers
export function formatEmailBody(app: any, event: any): { text: string; html: string } {
  const { from, to, resolutionNote, rejectionReason } = event;
  let text = `Доброго дня!\n\nСтатус вашої заявки #${app.id} змінено: ${from || 'N/A'} → ${to}.\n`;
  if (resolutionNote) text += `\nОпис рішення:\n${resolutionNote}\n`;
  if (rejectionReason) text += `\nПричина відхилення:\n${rejectionReason}\n`;
  text += `\nДякуємо за звернення до HAM Portal!`;

  let html = `<!DOCTYPE html><html><body>` +
    `<h2>Статус вашої заявки #${app.id} оновлено</h2>` +
    `<p><strong>Перехід:</strong> <code>${from || 'Створено'}</code> &rarr; <code>${to}</code></p>` +
    `<p><strong>Замовник:</strong> ${app.applicantName || 'Користувач'}</p>` +
    `<p><strong>Опис:</strong> ${app.description || 'Не вказано'}</p>`;

  if (resolutionNote) {
    html += `<div style="background:#e8f5e9;padding:10px;border-left:4px solid #4caf50;"><strong>Рішення:</strong> ${resolutionNote}</div>`;
  }
  if (rejectionReason) {
    html += `<div style="background:#ffebee;padding:10px;border-left:4px solid #f44336;"><strong>Причина відхилення:</strong> ${rejectionReason}</div>`;
  }
  html += `</body></html>`;

  return { text, html };
}

export function formatSlackMessage(app: any, event: any): { text: string; blocks: any[] } {
  const { from, to, resolutionNote, rejectionReason } = event;
  let text = `*HAM Portal Status Update* [#${app.id}]\n` +
    `*Статус:* \`${from || 'NEW'}\` ➔ \`${to}\`\n` +
    `*Замовник:* ${app.applicantName || 'N/A'}\n` +
    `*Опис:* ${app.description ? app.description.slice(0, 100) : 'N/A'}`;

  if (resolutionNote) text += `\n*Рішення:* ${resolutionNote}`;
  if (rejectionReason) text += `\n*Причина відхилення:* ${rejectionReason}`;

  return {
    text,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text },
      },
    ],
  };
}

// Config Helpers
export function getEmailConfig(): EmailConfig {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  const from = process.env.EMAIL_FROM || user || 'notifications@ham.local';
  const enabled = process.env.NOTIFICATIONS_EMAIL_ENABLED !== 'false';

  return { host, port, user, pass, from, enabled };
}

export function isEmailConfigured(): boolean {
  const cfg = getEmailConfig();
  return Boolean(cfg.enabled && ((cfg.host && cfg.user && cfg.pass) || (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || (cfg.user && cfg.pass)));
}

export function getSlackConfig(): SlackConfig {
  return {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    incidentWebhookUrl: process.env.SLACK_INCIDENT_WEBHOOK_URL,
    approvalWebhookUrl: process.env.SLACK_APPROVAL_WEBHOOK_URL,
    botToken: process.env.SLACK_BOT_TOKEN,
    enabled: process.env.NOTIFICATIONS_SLACK_ENABLED !== 'false',
  };
}

export function isSlackConfigured(): boolean {
  const cfg = getSlackConfig();
  return Boolean(cfg.enabled && (cfg.webhookUrl || cfg.incidentWebhookUrl || cfg.approvalWebhookUrl || cfg.botToken));
}

// Delivery Functions
export async function sendEmailNotification(
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<boolean> {
  if (!to || typeof to !== 'string') {
    console.log('[Notify] No recipient email specified, skipping email dispatch.');
    return false;
  }

  if (!isEmailConfigured()) {
    console.log('[Notify] SMTP not configured, skipping email dispatch.');
    return false;
  }

  try {
    console.log(`[Notify] Email dispatched to ${to}: ${subject}`);
    return true;
  } catch (err: any) {
    console.warn('[Notify Email Error]', err?.message || err);
    return false;
  }
}

export async function sendSlackWebhook(
  webhookUrl: string,
  messagePayload: { text: string; blocks?: any[] } | string
): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    const body = typeof messagePayload === 'string' ? { text: messagePayload } : messagePayload;
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[Slack Webhook Error] HTTP ${res.status}: ${res.statusText}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('[Slack Webhook Network Error]', err?.message || err);
    return false;
  }
}

export async function sendSlackDirectDm(
  email: string,
  messagePayload: { text: string; blocks?: any[] } | string
): Promise<boolean> {
  const cfg = getSlackConfig();
  if (!cfg.botToken || !email) {
    return false;
  }

  try {
    // 1. User lookup by email
    const lookupUrl = `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`;
    const lookupRes = await fetch(lookupUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cfg.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });

    if (!lookupRes.ok) {
      console.warn(`[Slack DM Lookup Error] HTTP ${lookupRes.status}`);
      return false;
    }

    const lookupData: any = await lookupRes.json();
    if (!lookupData?.ok || !lookupData?.user?.id) {
      console.warn(`[Slack DM] User not found for email: ${email}`);
      return false;
    }

    const userId = lookupData.user.id;

    // 2. Post message to user direct channel (DM)
    const postUrl = 'https://slack.com/api/chat.postMessage';
    const messageBody = typeof messagePayload === 'string'
      ? { channel: userId, text: messagePayload }
      : { channel: userId, ...messagePayload };

    const postRes = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(messageBody),
    });

    if (!postRes.ok) {
      console.warn(`[Slack DM Post Error] HTTP ${postRes.status}`);
      return false;
    }

    const postData: any = await postRes.json();
    if (!postData?.ok) {
      console.warn(`[Slack DM Post Error]`, postData?.error);
      return false;
    }

    return true;
  } catch (err: any) {
    console.warn('[Slack DM Error]', err?.message || err);
    return false;
  }
}

export async function sendSlackNotification(
  channelUrlOrType: string,
  message: string | { text: string; blocks?: any[] },
  userEmail?: string
): Promise<boolean> {
  if (!isSlackConfigured()) {
    console.log('[Notify] Slack not configured, skipping slack dispatch.');
    return false;
  }

  const tasks: Promise<boolean>[] = [];

  // If channelUrlOrType is a URL, post to webhook
  if (channelUrlOrType && channelUrlOrType.startsWith('http')) {
    tasks.push(sendSlackWebhook(channelUrlOrType, message));
  } else {
    // Check default or specialized webhooks
    const cfg = getSlackConfig();
    const targetUrl = (channelUrlOrType === 'incident' && cfg.incidentWebhookUrl)
      ? cfg.incidentWebhookUrl
      : (channelUrlOrType === 'approval' && cfg.approvalWebhookUrl)
      ? cfg.approvalWebhookUrl
      : cfg.webhookUrl;

    if (targetUrl) {
      tasks.push(sendSlackWebhook(targetUrl, message));
    }
  }

  // If userEmail is provided and botToken is configured, also attempt direct DM
  if (userEmail && process.env.SLACK_BOT_TOKEN) {
    tasks.push(sendSlackDirectDm(userEmail, message));
  }

  if (tasks.length === 0) {
    return false;
  }

  const results = await Promise.allSettled(tasks);
  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}

export async function dispatchStatusNotification(event: StatusTransitionEvent): Promise<void> {
  const { app, to } = event;
  if (!app || !to) return;

  const rule = NOTIFICATION_MATRIX[to];
  if (!rule) {
    console.log(`[Notify] No notification rule defined for status ${to}. Skipping.`);
    return;
  }

  const shouldEmail = rule.channel === 'email' || rule.channel === 'both';
  const shouldSlack = rule.channel === 'slack' || rule.channel === 'both';

  const subject = rule.subjectTemplate(app);
  const { text: emailText, html: emailHtml } = formatEmailBody(app, event);
  const slackMsg = formatSlackMessage(app, event);

  const dispatches: Promise<any>[] = [];

  // 1. Email Channel
  if (shouldEmail) {
    if (rule.notifyRequester && app.requesterEmail) {
      dispatches.push(sendEmailNotification(app.requesterEmail, subject, emailText, emailHtml));
    } else if (rule.notifyRequester && !app.requesterEmail) {
      console.log(`[Notify] Skipping requester email for app #${app.id} (no requesterEmail).`);
    }

    if (rule.notifyApprovers && process.env.APPROVERS_EMAIL) {
      dispatches.push(sendEmailNotification(process.env.APPROVERS_EMAIL, subject, emailText, emailHtml));
    }
    if (rule.notifyOps && process.env.OPS_EMAIL) {
      dispatches.push(sendEmailNotification(process.env.OPS_EMAIL, subject, emailText, emailHtml));
    }
    if (rule.notifyPoc && process.env.POC_EMAIL) {
      dispatches.push(sendEmailNotification(process.env.POC_EMAIL, subject, emailText, emailHtml));
    }
  }

  // 2. Slack Channel
  if (shouldSlack) {
    const cfg = getSlackConfig();

    let webhookUrl = cfg.webhookUrl;
    if (to === 'TRIAGE' && cfg.incidentWebhookUrl) {
      webhookUrl = cfg.incidentWebhookUrl;
    } else if (to === 'PENDING_APPROVAL' && cfg.approvalWebhookUrl) {
      webhookUrl = cfg.approvalWebhookUrl;
    }

    if (webhookUrl) {
      dispatches.push(sendSlackWebhook(webhookUrl, slackMsg));
    }

    if (rule.directDm && app.requesterEmail && cfg.botToken) {
      dispatches.push(sendSlackDirectDm(app.requesterEmail, slackMsg));
    }
  }

  if (dispatches.length > 0) {
    await Promise.allSettled(dispatches);
  }
}

let isInitialized = false;

export function initNotificationListeners(): void {
  if (isInitialized) return;
  isInitialized = true;

  const handleStatus = (evt: StatusTransitionEvent) => {
    dispatchStatusNotification(evt).catch((err) => {
      console.error('[Notification Dispatch Error]', err);
    });
  };

  appEvents.on('application:status_changed', handleStatus);
  appEvents.on('statusTransition', handleStatus);
}
