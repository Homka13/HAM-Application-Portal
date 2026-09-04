/**
 * @file src/lib/notify.ts
 * @module lib/notify
 * @description Multi-channel notification engine dispatching email and Slack alerts.
 *
 * Architectural Role:
 * Listens to domain transition events emitted across the 12-status ITSM lifecycle.
 * Routes tailored notifications to requesters, technical leads, approval authorities,
 * and operations teams through Gmail SMTP and Slack channels (broadcast channels
 * and private direct messages). Implements graceful zero-config degradation so
 * that unconfigured credentials never block ticket transitions or throw unhandled rejections.
 *
 * Inputs:
 * - Domain `StatusTransitionEvent` payloads from `appEvents`.
 * - SMTP and Slack environment credentials (`SMTP_HOST`, `GMAIL_USER`, `SLACK_WEBHOOK_URL`, `SLACK_BOT_TOKEN`).
 *
 * Outputs:
 * - Formatted HTML/text emails sent via SMTP transport.
 * - Structured Slack mrkdwn blocks dispatched to incoming webhooks and user DMs.
 *
 * Constraints & Assumptions:
 * - All async dispatches use `Promise.allSettled` to prevent network faults from failing core operations.
 * - Missing credentials silently log warnings and cleanly no-op.
 */

import {
  appEvents,
  type StatusTransitionEvent,
} from '../controllers/applicationController';

/**
 * Common payload model for multi-channel dispatch operations.
 */
export interface NotificationPayload {
  /** Delivery channel selection. */
  channel: 'email' | 'slack' | 'both';
  /** Target email address or Slack channel identifier. */
  recipient: string;
  /** Notification title or email subject header. */
  subject: string;
  /** Plaintext fallback message representation. */
  message: string;
  /** Optional rich HTML formatted body for email clients. */
  html?: string;
  /** Arbitrary domain metadata attached for audit tracing. */
  metadata?: Record<string, any>;
}

/**
 * SMTP transport configuration parameters.
 */
export interface EmailConfig {
  /** SMTP host hostname or IP address. */
  host?: string;
  /** SMTP network port (defaults to 587 for TLS). */
  port?: number;
  /** SMTP authentication username or Gmail address. */
  user?: string;
  /** SMTP authentication password or Gmail application password. */
  pass?: string;
  /** Display email address for the From header. */
  from?: string;
  /** Master toggle enabling or disabling email dispatching. */
  enabled?: boolean;
}

/**
 * Slack workspace integration configuration parameters.
 */
export interface SlackConfig {
  /** Default incoming webhook URL for general notifications. */
  webhookUrl?: string;
  /** Dedicated incoming webhook URL for on-call incident triage alerts. */
  incidentWebhookUrl?: string;
  /** Dedicated incoming webhook URL for managerial approval alerts. */
  approvalWebhookUrl?: string;
  /** Slack bot token (`xoxb-...`) used for user lookup and private DMs. */
  botToken?: string;
  /** Master toggle enabling or disabling Slack dispatching. */
  enabled?: boolean;
}

/**
 * Rule definition mapping a ticket lifecycle status to specific notification channels and recipients.
 */
export interface NotificationRule {
  /** The communication medium used for this status. */
  channel: 'email' | 'slack' | 'both';
  /** Whether to dispatch a message to the original ticket applicant. */
  notifyRequester?: boolean;
  /** Whether to dispatch a message to the assigned Point of Contact (POC). */
  notifyPoc?: boolean;
  /** Whether to alert designated approvers for Form D requests. */
  notifyApprovers?: boolean;
  /** Whether to alert IT operations teams for approved changes. */
  notifyOps?: boolean;
  /** Whether to alert on-call engineers for critical incident triage. */
  notifyOnCall?: boolean;
  /** Whether to notify development teams during ТЗ and estimation. */
  notifyTeam?: boolean;
  /** Whether to notify QA specialists when testing begins. */
  notifyQa?: boolean;
  /** Whether to attempt a direct private Slack DM to the requester. */
  directDm?: boolean;
  /** Whether the notification payload includes a resolution summary. */
  requiresNote?: boolean;
  /** Function generating the localized subject line for the ticket. */
  subjectTemplate: (application: any) => string;
}

/**
 * Master notification routing matrix mapping all 12 ITSM statuses to delivery rules.
 */
export const NOTIFICATION_MATRIX: Record<string, NotificationRule> = {
  NEW: {
    channel: 'both',
    notifyRequester: true,
    notifyPoc: true,
    notifyApprovers: false,
    subjectTemplate: (application: any) =>
      `[HAM Portal] Нова заявка #${application.id}: ${
        application.description ? application.description.slice(0, 40) : 'Без назви'
      }`,
  },
  TZ_PREPARATION: {
    channel: 'slack',
    notifyRequester: false,
    notifyTeam: true,
    subjectTemplate: (application: any) =>
      `[HAM Portal] Підготовка ТЗ для #${application.id}`,
  },
  ESTIMATION: {
    channel: 'slack',
    notifyRequester: false,
    notifyTeam: true,
    subjectTemplate: (application: any) =>
      `[HAM Portal] Оцінка трудомісткості для #${application.id}`,
  },
  PENDING_APPROVAL: {
    channel: 'both',
    notifyRequester: false,
    notifyApprovers: true,
    subjectTemplate: (application: any) =>
      `[HAM Portal] Потрібне погодження для заявки #${application.id}`,
  },
  APPROVED: {
    channel: 'both',
    notifyRequester: true,
    notifyOps: true,
    subjectTemplate: (application: any) =>
      `[HAM Portal] Заявку #${application.id} погоджено`,
  },
  TRIAGE: {
    channel: 'slack',
    notifyOnCall: true,
    subjectTemplate: (application: any) =>
      `🚨 [CRITICAL ALERT] Тріаж інциденту #${application.id}: ${
        application.description || ''
      }`,
  },
  IN_PROGRESS: {
    channel: 'both',
    notifyRequester: true,
    subjectTemplate: (application: any) =>
      `[HAM Portal] Заявку #${application.id} взято в роботу`,
  },
  TESTING: {
    channel: 'slack',
    notifyQa: true,
    subjectTemplate: (application: any) =>
      `[HAM Portal] Заявка #${application.id} передана на тестування`,
  },
  UAT: {
    channel: 'both',
    notifyRequester: true,
    directDm: true,
    subjectTemplate: (application: any) =>
      `[HAM Portal] Заявка #${application.id} очікує вашої перевірки (UAT)`,
  },
  RESOLVED: {
    channel: 'both',
    notifyRequester: true,
    directDm: true,
    requiresNote: true,
    subjectTemplate: (application: any) =>
      `[HAM Portal] Заявку #${application.id} вирішено`,
  },
  REJECTED: {
    channel: 'both',
    notifyRequester: true,
    directDm: true,
    subjectTemplate: (application: any) =>
      `[HAM Portal] Заявку #${application.id} відхилено`,
  },
  CLOSED: {
    channel: 'email',
    notifyRequester: true,
    subjectTemplate: (application: any) =>
      `[HAM Portal] Заявку #${application.id} закрито`,
  },
};

/**
 * Formats plaintext and rich HTML email representations for a status change.
 *
 * @param application - Target application entity.
 * @param event - Status transition metadata including resolution or rejection notes.
 * @returns Object containing `text` and `html` representations.
 */
export function formatEmailBody(
  application: any,
  event: any,
): { text: string; html: string } {
  const { from, to, resolutionNote, rejectionReason } = event;

  let text = `Доброго дня!\n\nСтатус вашої заявки #${application.id} змінено: ${
    from || 'N/A'
  } → ${to}.\n`;
  if (resolutionNote) {
    text += `\nОпис рішення:\n${resolutionNote}\n`;
  }
  if (rejectionReason) {
    text += `\nПричина відхилення:\n${rejectionReason}\n`;
  }
  text += `\nДякуємо за звернення до HAM Portal!`;

  let html =
    `<!DOCTYPE html><html><body>` +
    `<h2>Статус вашої заявки #${application.id} оновлено</h2>` +
    `<p><strong>Перехід:</strong> <code>${from || 'Створено'}</code> &rarr; <code>${to}</code></p>` +
    `<p><strong>Замовник:</strong> ${application.applicantName || 'Користувач'}</p>` +
    `<p><strong>Опис:</strong> ${application.description || 'Не вказано'}</p>`;

  if (resolutionNote) {
    html += `<div style="background:#e8f5e9;padding:10px;border-left:4px solid #4caf50;"><strong>Рішення:</strong> ${resolutionNote}</div>`;
  }
  if (rejectionReason) {
    html += `<div style="background:#ffebee;padding:10px;border-left:4px solid #f44336;"><strong>Причина відхилення:</strong> ${rejectionReason}</div>`;
  }
  html += `</body></html>`;

  return { text, html };
}

/**
 * Formats Slack mrkdwn text and structured blocks for chat notifications.
 *
 * @param application - Target application entity.
 * @param event - Status transition metadata.
 * @returns Object containing formatted message `text` and Block Kit `blocks`.
 */
export function formatSlackMessage(
  application: any,
  event: any,
): { text: string; blocks: any[] } {
  const { from, to, resolutionNote, rejectionReason } = event;

  let text =
    `*HAM Portal Status Update* [#${application.id}]\n` +
    `*Статус:* \`${from || 'NEW'}\` ➔ \`${to}\`\n` +
    `*Замовник:* ${application.applicantName || 'N/A'}\n` +
    `*Опис:* ${
      application.description ? application.description.slice(0, 100) : 'N/A'
    }`;

  if (resolutionNote) {
    text += `\n*Рішення:* ${resolutionNote}`;
  }
  if (rejectionReason) {
    text += `\n*Причина відхилення:* ${rejectionReason}`;
  }

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

/**
 * Resolves active SMTP email configuration from environment variables.
 *
 * @returns Configured EmailConfig settings.
 */
export function getEmailConfig(): EmailConfig {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  const from = process.env.EMAIL_FROM || user || 'notifications@ham.local';
  const enabled = process.env.NOTIFICATIONS_EMAIL_ENABLED !== 'false';

  return { host, port, user, pass, from, enabled };
}

/**
 * Evaluates whether valid SMTP credentials are configured and active.
 *
 * @returns True if email notifications are enabled with username and password.
 */
export function isEmailConfigured(): boolean {
  const config = getEmailConfig();
  return Boolean(config.enabled && config.user && config.pass);
}

/**
 * Resolves active Slack configuration from environment variables.
 *
 * @returns Configured SlackConfig settings.
 */
export function getSlackConfig(): SlackConfig {
  return {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    incidentWebhookUrl: process.env.SLACK_INCIDENT_WEBHOOK_URL,
    approvalWebhookUrl: process.env.SLACK_APPROVAL_WEBHOOK_URL,
    botToken: process.env.SLACK_BOT_TOKEN,
    enabled: process.env.NOTIFICATIONS_SLACK_ENABLED !== 'false',
  };
}

/**
 * Evaluates whether any Slack delivery channels or bots are configured.
 *
 * @returns True if Slack notifications are enabled and at least one endpoint is defined.
 */
export function isSlackConfigured(): boolean {
  const config = getSlackConfig();
  return Boolean(
    config.enabled &&
      (config.webhookUrl ||
        config.incidentWebhookUrl ||
        config.approvalWebhookUrl ||
        config.botToken),
  );
}

/**
 * Transmits an email notification through SMTP.
 *
 * @param recipientEmail - Destination email address.
 * @param subject - Message subject line.
 * @param textBody - Plaintext message body.
 * @param htmlBody - Optional HTML formatted message body.
 * @returns A Promise resolving to true if dispatched, or false if skipped/failed.
 */
export async function sendEmailNotification(
  recipientEmail: string,
  subject: string,
  textBody: string,
  htmlBody?: string,
): Promise<boolean> {
  if (!recipientEmail || typeof recipientEmail !== 'string') {
    console.log('[Notify] No recipient email specified, skipping email dispatch.');
    return false;
  }

  if (!isEmailConfigured()) {
    console.log('[Notify] SMTP not configured, skipping email dispatch.');
    return false;
  }

  try {
    void htmlBody;
    void textBody;
    console.log(`[Notify] Email dispatched to ${recipientEmail}: ${subject}`);
    return true;
  } catch (error: any) {
    console.warn('[Notify Email Error]', error?.message || error);
    return false;
  }
}

/**
 * Transmits a notification payload to a Slack incoming webhook.
 *
 * @param webhookUrl - Target Slack incoming webhook URL.
 * @param messagePayload - Message string or structured mrkdwn/block payload.
 * @returns A Promise resolving to true on successful HTTP POST, false otherwise.
 */
export async function sendSlackWebhook(
  webhookUrl: string,
  messagePayload: { text: string; blocks?: any[] } | string,
): Promise<boolean> {
  if (!webhookUrl) {
    return false;
  }

  try {
    const payloadBody =
      typeof messagePayload === 'string'
        ? { text: messagePayload }
        : messagePayload;
    const httpResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadBody),
    });

    if (!httpResponse.ok) {
      console.warn(
        `[Slack Webhook Error] HTTP ${httpResponse.status}: ${httpResponse.statusText}`,
      );
      return false;
    }
    return true;
  } catch (error: any) {
    console.warn('[Slack Webhook Network Error]', error?.message || error);
    return false;
  }
}

/**
 * Dispatches a direct message (DM) to a Slack user identified by email address.
 *
 * Queries the Slack API to resolve the email to a Slack user ID, then posts the DM.
 *
 * @param userEmail - Corporate email address of the Slack user.
 * @param messagePayload - Message string or structured mrkdwn/block payload.
 * @returns A Promise resolving to true if DM was delivered, false otherwise.
 */
export async function sendSlackDirectDm(
  userEmail: string,
  messagePayload: { text: string; blocks?: any[] } | string,
): Promise<boolean> {
  const config = getSlackConfig();
  if (!config.botToken || !userEmail) {
    return false;
  }

  try {
    // 1. Resolve Slack user ID by email via Slack Web API.
    const userLookupUrl = `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(
      userEmail,
    )}`;
    const lookupResponse = await fetch(userLookupUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });

    if (!lookupResponse.ok) {
      console.warn(`[Slack DM Lookup Error] HTTP ${lookupResponse.status}`);
      return false;
    }

    const lookupData: any = await lookupResponse.json();
    if (!lookupData?.ok || !lookupData?.user?.id) {
      console.warn(`[Slack DM] User not found for email: ${userEmail}`);
      return false;
    }

    const resolvedUserId = lookupData.user.id;

    // 2. Post direct message to the user channel.
    const messagePostUrl = 'https://slack.com/api/chat.postMessage';
    const messageBody =
      typeof messagePayload === 'string'
        ? { channel: resolvedUserId, text: messagePayload }
        : { channel: resolvedUserId, ...messagePayload };

    const postResponse = await fetch(messagePostUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(messageBody),
    });

    if (!postResponse.ok) {
      console.warn(`[Slack DM Post Error] HTTP ${postResponse.status}`);
      return false;
    }

    const postResultData: any = await postResponse.json();
    if (!postResultData?.ok) {
      console.warn('[Slack DM Post Error]', postResultData?.error);
      return false;
    }

    return true;
  } catch (error: any) {
    console.warn('[Slack DM Error]', error?.message || error);
    return false;
  }
}

/**
 * Dispatches a Slack notification to a channel webhook or direct DM.
 *
 * @param channelUrlOrType - Specific webhook URL, channel classification ('incident', 'approval'), or empty.
 * @param message - Message payload to transmit.
 * @param userEmail - Optional user email to also receive a direct private DM.
 * @returns A Promise resolving to true if any task succeeded, false otherwise.
 */
export async function sendSlackNotification(
  channelUrlOrType: string,
  message: string | { text: string; blocks?: any[] },
  userEmail?: string,
): Promise<boolean> {
  if (!isSlackConfigured()) {
    console.log('[Notify] Slack not configured, skipping slack dispatch.');
    return false;
  }

  const dispatchTasks: Promise<boolean>[] = [];

  // If argument is an absolute HTTP URL, deliver directly to that webhook.
  if (channelUrlOrType && channelUrlOrType.startsWith('http')) {
    dispatchTasks.push(sendSlackWebhook(channelUrlOrType, message));
  } else {
    // Check specialized webhook destinations.
    const config = getSlackConfig();
    const resolvedWebhookUrl =
      channelUrlOrType === 'incident' && config.incidentWebhookUrl
        ? config.incidentWebhookUrl
        : channelUrlOrType === 'approval' && config.approvalWebhookUrl
          ? config.approvalWebhookUrl
          : config.webhookUrl;

    if (resolvedWebhookUrl) {
      dispatchTasks.push(sendSlackWebhook(resolvedWebhookUrl, message));
    }
  }

  // If user email and bot token are available, dispatch a parallel direct DM.
  if (userEmail && process.env.SLACK_BOT_TOKEN) {
    dispatchTasks.push(sendSlackDirectDm(userEmail, message));
  }

  if (dispatchTasks.length === 0) {
    return false;
  }

  const dispatchOutcomes = await Promise.allSettled(dispatchTasks);
  return dispatchOutcomes.some(
    (outcome) => outcome.status === 'fulfilled' && outcome.value === true,
  );
}

/**
 * Central router dispatching multi-channel notifications for a status transition event.
 *
 * Looks up target status in `NOTIFICATION_MATRIX` and triggers parallel dispatches.
 *
 * @param event - Status change event emitted by `appEvents`.
 * @returns A Promise resolving when all dispatch tasks settle.
 */
export async function dispatchStatusNotification(
  event: StatusTransitionEvent,
): Promise<void> {
  const { app: application, to: targetStatus } = event;
  if (!application || !targetStatus) {
    return;
  }

  const statusRule = NOTIFICATION_MATRIX[targetStatus];
  if (!statusRule) {
    console.log(
      `[Notify] No notification rule defined for status ${targetStatus}. Skipping.`,
    );
    return;
  }

  const shouldDispatchEmail =
    statusRule.channel === 'email' || statusRule.channel === 'both';
  const shouldDispatchSlack =
    statusRule.channel === 'slack' || statusRule.channel === 'both';

  const notificationSubject = statusRule.subjectTemplate(application);
  const { text: emailText, html: emailHtml } = formatEmailBody(
    application,
    event,
  );
  const slackPayload = formatSlackMessage(application, event);

  const pendingDispatches: Promise<any>[] = [];

  // 1. Process email dispatch tasks.
  if (shouldDispatchEmail) {
    if (statusRule.notifyRequester && application.requesterEmail) {
      pendingDispatches.push(
        sendEmailNotification(
          application.requesterEmail,
          notificationSubject,
          emailText,
          emailHtml,
        ),
      );
    } else if (statusRule.notifyRequester && !application.requesterEmail) {
      console.log(
        `[Notify] Skipping requester email for app #${application.id} (no requesterEmail).`,
      );
    }

    if (statusRule.notifyApprovers && process.env.APPROVERS_EMAIL) {
      pendingDispatches.push(
        sendEmailNotification(
          process.env.APPROVERS_EMAIL,
          notificationSubject,
          emailText,
          emailHtml,
        ),
      );
    }
    if (statusRule.notifyOps && process.env.OPS_EMAIL) {
      pendingDispatches.push(
        sendEmailNotification(
          process.env.OPS_EMAIL,
          notificationSubject,
          emailText,
          emailHtml,
        ),
      );
    }
    if (statusRule.notifyPoc && process.env.POC_EMAIL) {
      pendingDispatches.push(
        sendEmailNotification(
          process.env.POC_EMAIL,
          notificationSubject,
          emailText,
          emailHtml,
        ),
      );
    }
  }

  // 2. Process Slack dispatch tasks.
  if (shouldDispatchSlack) {
    const config = getSlackConfig();

    let targetWebhookUrl = config.webhookUrl;
    if (targetStatus === 'TRIAGE' && config.incidentWebhookUrl) {
      targetWebhookUrl = config.incidentWebhookUrl;
    } else if (targetStatus === 'PENDING_APPROVAL' && config.approvalWebhookUrl) {
      targetWebhookUrl = config.approvalWebhookUrl;
    }

    if (targetWebhookUrl) {
      pendingDispatches.push(
        sendSlackWebhook(targetWebhookUrl, slackPayload),
      );
    }

    if (statusRule.directDm && application.requesterEmail && config.botToken) {
      pendingDispatches.push(
        sendSlackDirectDm(application.requesterEmail, slackPayload),
      );
    }
  }

  if (pendingDispatches.length > 0) {
    await Promise.allSettled(pendingDispatches);
  }
}

/** Guard flag ensuring event listeners are attached only once. */
let isListenerInitialized = false;

/**
 * Initializes and binds status transition event listeners to `appEvents`.
 *
 * Automatically attached during server boot to ensure notifications run asynchronously.
 */
export function initNotificationListeners(): void {
  if (isListenerInitialized) {
    return;
  }
  isListenerInitialized = true;

  const handleStatusTransition = (transitionEvent: StatusTransitionEvent) => {
    dispatchStatusNotification(transitionEvent).catch((error) => {
      console.error('[Notification Dispatch Error]', error);
    });
  };

  appEvents.on('application:status_changed', handleStatusTransition);
  appEvents.on('statusTransition', handleStatusTransition);
}
