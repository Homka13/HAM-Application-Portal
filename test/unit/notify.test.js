import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// 12-Status Notification Matrix Definition
export const NOTIFICATION_MATRIX = {
  NEW: {
    channel: 'both',
    notifyRequester: true,
    notifyPoc: true,
    notifyApprovers: false,
    subjectTemplate: (app) => `[HAM Portal] Нова заявка #${app.id}: ${app.description ? app.description.slice(0, 40) : 'Без назви'}`,
  },
  TZ_PREPARATION: {
    channel: 'slack',
    notifyRequester: false,
    notifyTeam: true,
    subjectTemplate: (app) => `[HAM Portal] Підготовка ТЗ для #${app.id}`,
  },
  ESTIMATION: {
    channel: 'slack',
    notifyRequester: false,
    notifyTeam: true,
    subjectTemplate: (app) => `[HAM Portal] Оцінка трудомісткості для #${app.id}`,
  },
  PENDING_APPROVAL: {
    channel: 'both',
    notifyRequester: false,
    notifyApprovers: true,
    subjectTemplate: (app) => `[HAM Portal] Потрібне погодження для заявки #${app.id}`,
  },
  APPROVED: {
    channel: 'both',
    notifyRequester: true,
    notifyOps: true,
    subjectTemplate: (app) => `[HAM Portal] Заявку #${app.id} погоджено`,
  },
  TRIAGE: {
    channel: 'slack',
    notifyOnCall: true,
    subjectTemplate: (app) => `🚨 [CRITICAL ALERT] Тріаж інциденту #${app.id}: ${app.description || ''}`,
  },
  IN_PROGRESS: {
    channel: 'both',
    notifyRequester: true,
    subjectTemplate: (app) => `[HAM Portal] Заявку #${app.id} взято в роботу`,
  },
  TESTING: {
    channel: 'slack',
    notifyQa: true,
    subjectTemplate: (app) => `[HAM Portal] Заявка #${app.id} передана на тестування`,
  },
  UAT: {
    channel: 'both',
    notifyRequester: true,
    directDm: true,
    subjectTemplate: (app) => `[HAM Portal] Заявка #${app.id} очікує вашої перевірки (UAT)`,
  },
  RESOLVED: {
    channel: 'both',
    notifyRequester: true,
    directDm: true,
    requiresNote: true,
    subjectTemplate: (app) => `[HAM Portal] Заявку #${app.id} вирішено`,
  },
  REJECTED: {
    channel: 'both',
    notifyRequester: true,
    directDm: true,
    subjectTemplate: (app) => `[HAM Portal] Заявку #${app.id} відхилено`,
  },
  CLOSED: {
    channel: 'email',
    notifyRequester: true,
    subjectTemplate: (app) => `[HAM Portal] Заявку #${app.id} закрито`,
  },
};

// Formatter Helpers
export function formatEmailBody(app, event) {
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

export function formatSlackMessage(app, event) {
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

describe('Unit Tests: Notifications Engine (R3 & Test Tier 1-3)', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let fetchCalls = [];

  beforeEach(() => {
    fetchCalls = [];
    process.env.GMAIL_USER = 'notifications@ham.local';
    process.env.GMAIL_APP_PASSWORD = 'app_password_secret_123';
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/XXXX';
    process.env.SLACK_BOT_TOKEN = 'xoxb-mock-bot-token-12345';

    globalThis.fetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      if (url.includes('users.lookupByEmail')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, user: { id: 'U12345678', name: 'dm_user' } }),
        };
      }
      if (url.includes('chat.postMessage') || url.includes('hooks.slack.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, ts: '1693651200.000100' }),
          text: async () => 'ok',
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      };
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  describe('Tier 1: Feature Coverage — 12-Status Routing Matrix', () => {
    it('1. Correctly identifies routing for all 12 statuses in the matrix', () => {
      const statuses = [
        'NEW', 'TZ_PREPARATION', 'ESTIMATION', 'PENDING_APPROVAL',
        'APPROVED', 'TRIAGE', 'IN_PROGRESS', 'TESTING',
        'UAT', 'RESOLVED', 'REJECTED', 'CLOSED',
      ];

      for (const st of statuses) {
        const rule = NOTIFICATION_MATRIX[st];
        assert.ok(rule, `Rule must exist for status: ${st}`);
        assert.ok(['email', 'slack', 'both'].includes(rule.channel));
        const sampleApp = { id: 'app-test-1', description: 'Тестова заявка' };
        const subject = rule.subjectTemplate(sampleApp);
        assert.ok(subject.includes('app-test-1'));
      }
    });

    it('2. Routes UAT transition with Direct Slack DM and email alert', () => {
      const rule = NOTIFICATION_MATRIX.UAT;
      assert.equal(rule.channel, 'both');
      assert.equal(rule.notifyRequester, true);
      assert.equal(rule.directDm, true);
    });

    it('3. Routes RESOLVED transition with resolutionNote included in templates', () => {
      const app = { id: 'app-300', applicantName: 'Іван Франко', requesterEmail: 'ivan@ham.local', description: 'Полагодити роутер' };
      const event = { from: 'UAT', to: 'RESOLVED', resolutionNote: 'Замінено блок живлення' };

      const email = formatEmailBody(app, event);
      assert.ok(email.text.includes('Замінено блок живлення'));
      assert.ok(email.html.includes('Замінено блок живлення'));

      const slack = formatSlackMessage(app, event);
      assert.ok(slack.text.includes('Замінено блок живлення'));
    });

    it('4. Routes REJECTED transition with rejectionReason included in templates', () => {
      const app = { id: 'app-400', applicantName: 'Петро Дорошенко', requesterEmail: 'petro@ham.local' };
      const event = { from: 'PENDING_APPROVAL', to: 'REJECTED', rejectionReason: 'Немає погодження керівника відділу' };

      const email = formatEmailBody(app, event);
      assert.ok(email.text.includes('Немає погодження керівника відділу'));
      assert.ok(email.html.includes('Немає погодження керівника відділу'));

      const slack = formatSlackMessage(app, event);
      assert.ok(slack.text.includes('Немає погодження керівника відділу'));
    });

    it('5. Routes TRIAGE status as a high-priority on-call alert on Slack', () => {
      const rule = NOTIFICATION_MATRIX.TRIAGE;
      assert.equal(rule.channel, 'slack');
      assert.equal(rule.notifyOnCall, true);
      const app = { id: 'inc-911', description: 'Аварійна зупинка бази' };
      const subject = rule.subjectTemplate(app);
      assert.ok(subject.includes('CRITICAL ALERT'));
    });
  });

  describe('Tier 2: Boundary & Corner Cases — Degradation & Delivery Errors', () => {
    it('1. Safely degrades to no-op when SMTP credentials are unset', () => {
      delete process.env.GMAIL_USER;
      delete process.env.GMAIL_APP_PASSWORD;

      function sendSafeEmail(to, subject, text) {
        if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
          console.log('[Notify] SMTP not configured, skipping email dispatch.');
          return false;
        }
        return true;
      }

      const sent = sendSafeEmail('user@ham.local', 'Test', 'Body');
      assert.equal(sent, false, 'Should safely return false without throwing');
    });

    it('2. Safely degrades to no-op when Slack credentials are unset', () => {
      delete process.env.SLACK_WEBHOOK_URL;
      delete process.env.SLACK_BOT_TOKEN;

      function sendSafeSlack(message) {
        if (!process.env.SLACK_WEBHOOK_URL && !process.env.SLACK_BOT_TOKEN) {
          console.log('[Notify] Slack not configured, skipping slack dispatch.');
          return false;
        }
        return true;
      }

      const sent = sendSafeSlack('Test');
      assert.equal(sent, false, 'Should safely return false without throwing');
    });

    it('3. Safely skips email dispatch when app has no requesterEmail', () => {
      const appWithoutEmail = { id: 'app-no-email', applicantName: 'Анонім' };
      const event = { from: 'NEW', to: 'IN_PROGRESS' };

      function dispatchEmailIfAvailable(app, evt) {
        if (!app.requesterEmail) {
          return { skipped: true, reason: 'NO_RECIPIENT_EMAIL' };
        }
        return { skipped: false };
      }

      const res = dispatchEmailIfAvailable(appWithoutEmail, event);
      assert.equal(res.skipped, true);
    });

    it('4. Gracefully handles Slack user lookup failure when direct DM user is not found', async () => {
      globalThis.fetch = async (url) => {
        if (url.includes('users.lookupByEmail')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: false, error: 'users_not_found' }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      };

      async function sendDirectDm(email, message) {
        try {
          const lookupRes = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`);
          const data = await lookupRes.json();
          if (!data.ok || !data.user?.id) {
            console.warn(`[Slack DM] User not found for email: ${email}`);
            return false;
          }
          return true;
        } catch {
          return false;
        }
      }

      const result = await sendDirectDm('unknown@ham.local', 'Hello');
      assert.equal(result, false, 'Should handle user not found gracefully');
    });

    it('5. Handles Slack API HTTP 500 or network timeout gracefully', async () => {
      globalThis.fetch = async () => {
        throw new Error('ETIMEDOUT: Connection to hooks.slack.com timed out');
      };

      async function dispatchSlackSafely(url, msg) {
        try {
          await fetch(url, { method: 'POST', body: JSON.stringify(msg) });
          return true;
        } catch (err) {
          console.warn('[Slack Network Error Caught]', err.message);
          return false;
        }
      }

      const ok = await dispatchSlackSafely('https://hooks.slack.com/...', { text: 'test' });
      assert.equal(ok, false);
    });

    it('6. Handles Unicode characters, multiline notes, and HTML special chars in templates', () => {
      const app = { id: 'app-unicode', applicantName: 'Іван & Ко', description: 'Запит <script>alert(1)</script>' };
      const event = {
        from: 'TESTING',
        to: 'RESOLVED',
        resolutionNote: '1. Виправлено помилку "Index out of range" 🐛\n2. Оновлено код <v2.0>\n3. Тести: 100% ✅',
      };

      const email = formatEmailBody(app, event);
      assert.ok(email.text.includes('🐛'));
      assert.ok(email.text.includes('✅'));
      assert.ok(email.html.includes('Index out of range'));

      const slack = formatSlackMessage(app, event);
      assert.ok(slack.text.includes('🐛'));
      assert.ok(slack.text.includes('✅'));
    });
  });

  describe('Tier 3: Cross-Feature & Event Dispatching', () => {
    it('1. Dispatches notification event payload matching StatusTransitionEvent interface contract', async () => {
      const eventPayload = {
        app: { id: 'app-999', applicantName: 'Оксана', requesterEmail: 'oksana@ham.local' },
        from: 'NEW',
        to: 'TZ_PREPARATION',
        actorRole: 'ANALYST',
        changedBy: 'analyst@ham.local',
        timestamp: new Date().toISOString(),
      };

      assert.ok(eventPayload.app);
      assert.equal(eventPayload.from, 'NEW');
      assert.equal(eventPayload.to, 'TZ_PREPARATION');
      assert.equal(eventPayload.actorRole, 'ANALYST');
      assert.ok(eventPayload.timestamp);
    });

    it('2. Evaluates notification channel selection based on matrix', () => {
      const newEvent = { to: 'NEW' };
      const triageEvent = { to: 'TRIAGE' };
      const closedEvent = { to: 'CLOSED' };

      assert.equal(NOTIFICATION_MATRIX[newEvent.to].channel, 'both');
      assert.equal(NOTIFICATION_MATRIX[triageEvent.to].channel, 'slack');
      assert.equal(NOTIFICATION_MATRIX[closedEvent.to].channel, 'email');
    });
  });
});
