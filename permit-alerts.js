// permit-alerts.js
// Background job that checks permit availability for registered alerts
// and sends email notifications via Resend (free tier: 3000 emails/month).
//
// Run manually: node permit-alerts.js
// Or schedule via cron: 0 8 * * * node /path/to/permit-alerts.js

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALERTS_PATH = path.join(__dirname, 'data', 'permit-alerts.json');
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'alerts@packpath.com';

async function loadAlerts() {
  try {
    const raw = await fs.readFile(ALERTS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveAlerts(alerts) {
  await fs.mkdir(path.dirname(ALERTS_PATH), { recursive: true });
  await fs.writeFile(ALERTS_PATH, JSON.stringify(alerts, null, 2));
}

async function checkPermitAvailability(permitId, startDate) {
  if (!permitId || !startDate) return null;
  try {
    const date = new Date(startDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const startOfMonth = `${year}-${month}-01`;
    const endOfMonth = new Date(year, date.getMonth() + 1, 0);
    const endStr = `${year}-${month}-${String(endOfMonth.getDate()).padStart(2, '0')}`;

    const url = `https://www.recreation.gov/api/permitinyo/${permitId}/availabilityv2?start_date=${startOfMonth}&end_date=${endStr}&commercial_acct=false`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PackPath/1.0 permit-alert-checker' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const availability = data.payload || data;

    const availableDates = [];
    for (const [dateStr, status] of Object.entries(availability)) {
      const d = new Date(dateStr);
      if (d >= date && (status === 'Available' || status === 'AVAILABLE')) {
        availableDates.push(dateStr.split('T')[0]);
      }
    }
    return availableDates;
  } catch {
    return null;
  }
}

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) {
    console.log(`[email] Would send to ${to}: ${subject}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[email] Failed to send to ${to}: ${err}`);
  } else {
    console.log(`[email] Sent to ${to}: ${subject}`);
  }
}

async function runAlertCheck() {
  const alerts = await loadAlerts();
  if (alerts.length === 0) {
    console.log('No alerts registered.');
    return;
  }

  const registry = JSON.parse(
    await fs.readFile(path.join(__dirname, 'regions', 'permit-registry.json'), 'utf-8')
  ).regions;

  let notified = 0;
  const updatedAlerts = [];

  for (const alert of alerts) {
    // Skip expired alerts (trip date passed)
    if (alert.startDate && new Date(alert.startDate) < new Date()) {
      console.log(`[skip] ${alert.email} — ${alert.regionId} — trip date passed`);
      continue;
    }

    const info = registry[alert.regionId];
    if (!info?.permitId) {
      updatedAlerts.push(alert);
      continue;
    }

    const availableDates = await checkPermitAvailability(info.permitId, alert.startDate);

    if (availableDates && availableDates.length > 0) {
      // Don't re-notify if we already sent this exact set of dates
      const datesKey = availableDates.sort().join(',');
      if (alert.lastNotifiedDates === datesKey) {
        updatedAlerts.push(alert);
        continue;
      }

      const regionName = info.permitName || alert.regionId;
      const dateList = availableDates.slice(0, 5).join(', ') + (availableDates.length > 5 ? ` +${availableDates.length - 5} more` : '');

      await sendEmail(
        alert.email,
        `🎫 Permit available — ${regionName}`,
        `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #059669;">Permit availability alert</h2>
          <p>Good news — permits are available for <strong>${regionName}</strong> around your requested dates.</p>
          <p><strong>Available dates:</strong> ${dateList}</p>
          <p><strong>Your trip window:</strong> ${alert.startDate}${alert.endDate ? ` → ${alert.endDate}` : ''}</p>
          <a href="${info.bookingUrl || 'https://www.recreation.gov'}"
             style="display: inline-block; background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
            Book now on Recreation.gov →
          </a>
          <p style="color: #78716c; font-size: 13px; margin-top: 24px;">
            You're receiving this because you set up a permit alert on PackPath.
            <a href="https://packpath.onrender.com">Visit PackPath</a>
          </p>
        </div>
        `
      );

      notified++;
      updatedAlerts.push({ ...alert, lastNotifiedDates: datesKey, lastChecked: new Date().toISOString() });
    } else {
      updatedAlerts.push({ ...alert, lastChecked: new Date().toISOString() });
    }
  }

  await saveAlerts(updatedAlerts);
  console.log(`Alert check complete. ${alerts.length} alerts checked, ${notified} notifications sent.`);
}

runAlertCheck().catch(err => {
  console.error('Alert check failed:', err.message);
  process.exit(1);
});
