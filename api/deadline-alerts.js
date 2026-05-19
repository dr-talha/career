// Career Pakistan — /api/deadline-alerts.js
// Vercel Serverless Function
// Sends deadline reminder emails to subscribers when opportunities
// are closing in 1, 3, or 7 days.
//
// CRITICAL BUG FIX: This file contained the cms.js code (file swap).
// This is now the correct deadline-alerts implementation.
//
// Designed to be triggered by a Vercel Cron Job (runs daily at 8 AM PKT):
//   vercel.json:
//   {
//     "crons": [{ "path": "/api/deadline-alerts", "schedule": "0 3 * * *" }]
//   }
//   (3 AM UTC = 8 AM PKT)
//
// Required environment variables (set in Vercel Dashboard):
//   CRON_SECRET          — random secret string, add to vercel.json cron auth
//   RESEND_API_KEY       — from https://resend.com
//   RESEND_FROM_EMAIL    — sender (default: Career Pakistan <hello@careerpk.co>)
//   RESEND_AUDIENCE_ID   — Resend audience ID to fetch subscriber list
//
// The function:
//   1. Fetches all sheets (Jobs, Scholarships, Internships, Exams) from /api/sheets
//   2. Finds items with deadlines in 1, 3, or 7 days
//   3. Sends a digest email to all active subscribers

'use strict';

const RESEND_API   = 'https://api.resend.com';
const SHEETS_BASE  = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/sheets`
  : 'https://careerpk.vercel.app/api/sheets';

const DEADLINE_WINDOWS = [1, 3, 7]; // days before deadline to alert

// ── Date utilities ─────────────────────────────────────────────
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return null;
  const now  = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d) ? dateStr : d.toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Fetch a single sheet tab ───────────────────────────────────
async function fetchSheet(sheetName) {
  try {
    const res = await fetch(`${SHEETS_BASE}?sheet=${sheetName}`);
    if (!res.ok) return [];
    const csv = await res.text();
    return parseCsv(csv);
  } catch {
    return [];
  }
}

function parseCsv(csvText) {
  if (!csvText || !csvText.trim()) return [];
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (inQ) {
      if (ch === '"' && csvText[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cell += ch; }
    } else {
      if      (ch === '"')  { inQ = true; }
      else if (ch === ',')  { row.push(cell.trim()); cell = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') {
        row.push(cell.trim()); cell = '';
        if (row.some(v => v)) rows.push(row);
        row = [];
      } else { cell += ch; }
    }
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(v => v)) rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map((vals, idx) => {
    const obj = { _rowIndex: idx + 1 };
    headers.forEach((h, i) => { if (h) obj[h] = (vals[i] || '').trim(); });
    return obj;
  });
}

// ── Extract deadline field from any row type ───────────────────
function getDeadline(row, type) {
  if (type === 'exam') return row['Test Date'] || row['Registration Deadline'] || '';
  return row['Deadline'] || row['Application Deadline'] || '';
}

// ── Find items closing soon ────────────────────────────────────
function findClosingItems(items, type, windowDays) {
  return items.filter(item => {
    const d = daysUntil(getDeadline(item, type));
    return d !== null && DEADLINE_WINDOWS.includes(d) && d <= windowDays;
  }).map(item => ({
    type,
    title:    item['Title'] || item['title'] || '(Untitled)',
    deadline: getDeadline(item, type),
    org:      item['Organization'] || item['Country'] || item['Conducting Body'] || '',
    link:     item['Apply Link'] || item['Link'] || '',
    days:     daysUntil(getDeadline(item, type)),
  }));
}

// ── Build HTML email body ──────────────────────────────────────
function buildEmailHtml(closingItems) {
  const ICONS = { job: '💼', scholarship: '🎓', internship: '🚀', exam: '📝' };
  const LABELS = { job: 'Job', scholarship: 'Scholarship', internship: 'Internship', exam: 'Exam' };

  const grouped = {};
  closingItems.forEach(item => {
    (grouped[item.days] = grouped[item.days] || []).push(item);
  });

  let sections = '';
  [1, 3, 7].forEach(day => {
    if (!grouped[day]) return;
    const label = day === 1 ? '⚡ Closing Today' : day === 3 ? '🔔 Closing in 3 Days' : '📅 Closing This Week';
    const rows   = grouped[day].map(item => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:11px;background:#f1f5f9;border-radius:4px;padding:2px 7px;margin-right:6px;color:#475569;">
            ${ICONS[item.type] || ''} ${LABELS[item.type] || item.type}
          </span>
          <strong style="color:#0f172a;font-size:14px;">${item.title}</strong>
          ${item.org ? `<span style="font-size:12px;color:#64748b;margin-left:8px;">— ${item.org}</span>` : ''}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-size:13px;color:#64748b;">
          ${formatDate(item.deadline)}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">
          ${item.link ? `<a href="${item.link}" style="background:#0f766e;color:#fff;padding:5px 12px;border-radius:5px;text-decoration:none;font-size:12px;font-weight:600;">Apply →</a>` : ''}
        </td>
      </tr>`).join('');

    sections += `
      <h3 style="margin:20px 0 8px;font-size:14px;color:#0f766e;">${label}</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">${rows}</table>`;
  });

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:#0f766e;padding:18px 24px;color:#ffffff;">
          <h1 style="margin:0;font-size:20px;">⏳ Deadline Reminders — Career Pakistan</h1>
          <p style="margin:6px 0 0;font-size:12px;opacity:.8;">Don't miss these closing opportunities</p>
        </div>
        <div style="padding:20px 24px;">
          ${sections}
          <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
            Visit <a href="https://careerpk.vercel.app" style="color:#0f766e;">Career Pakistan</a> to browse all opportunities and apply before deadlines.
          </p>
        </div>
        <div style="padding:12px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:11px;color:#94a3b8;">
          You received this because you're subscribed to Career Pakistan deadline alerts.
        </div>
      </div>
    </div>`;
}

// ── Fetch subscriber list from Resend ─────────────────────────
async function getSubscribers() {
  const apiKey     = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey || !audienceId) return [];

  try {
    const res = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data || [])
      .filter(c => !c.unsubscribed && c.email)
      .map(c => c.email);
  } catch {
    return [];
  }
}

// ── Send digest email ─────────────────────────────────────────
async function sendDigest(emails, closingItems) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM_EMAIL || 'Career Pakistan <hello@careerpk.co>';

  if (!apiKey || !emails.length) return { sent: 0 };

  const html    = buildEmailHtml(closingItems);
  const subject = `⏳ ${closingItems.length} opportunity${closingItems.length !== 1 ? 'ies' : 'y'} closing soon — Career Pakistan`;

  // Resend batch send (max 100 recipients per call)
  let sent = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const batch = emails.slice(i, i + 100);
    try {
      const res = await fetch(`${RESEND_API}/emails`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ from, to: batch, subject, html }),
      });
      if (res.ok) sent += batch.length;
      else console.warn('[CareerPK] deadline-alerts: batch send failed:', await res.text());
    } catch (err) {
      console.error('[CareerPK] deadline-alerts: send error:', err.message);
    }
  }
  return { sent };
}

// ── Handler ────────────────────────────────────────────────────
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // Verify cron secret to prevent unauthorised triggers
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers?.authorization || '';
    const queryToken = req.query?.token || '';
    if (!authHeader.endsWith(secret) && queryToken !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // 1. Fetch all relevant sheets in parallel
    const [jobs, scholarships, internships, exams] = await Promise.all([
      fetchSheet('Jobs'),
      fetchSheet('Scholarships'),
      fetchSheet('Internships'),
      fetchSheet('Exams'),
    ]);

    // 2. Find items closing within 7 days
    const closingItems = [
      ...findClosingItems(jobs,          'job',         7),
      ...findClosingItems(scholarships,  'scholarship', 7),
      ...findClosingItems(internships,   'internship',  7),
      ...findClosingItems(exams,         'exam',        7),
    ];

    if (!closingItems.length) {
      return res.status(200).json({ ok: true, message: 'No deadlines in the next 7 days. No emails sent.' });
    }

    // 3. Get subscribers and send digest
    const subscribers  = await getSubscribers();
    const { sent }     = await sendDigest(subscribers, closingItems);

    return res.status(200).json({
      ok:            true,
      closingItems:  closingItems.length,
      subscribers:   subscribers.length,
      emailsSent:    sent,
      breakdown:     {
        jobs:         closingItems.filter(i => i.type === 'job').length,
        scholarships: closingItems.filter(i => i.type === 'scholarship').length,
        internships:  closingItems.filter(i => i.type === 'internship').length,
        exams:        closingItems.filter(i => i.type === 'exam').length,
      },
    });
  } catch (err) {
    console.error('[CareerPK] deadline-alerts: Unexpected error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = handler;
