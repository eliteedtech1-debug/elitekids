/**
 * EliteKids transactional mailer — sales & subscription notifications.
 *
 * Convention mirrors elite-sms (SMTP_HOST/SMTP_PORT/SMTP_USERNAME/
 * SMTP_PASSWORD/SMTP_FROM_ADDRESS/SMTP_FROM_NAME). IMPORTANT: elite-kids'
 * own .env may NOT carry SMTP creds; this service FAILS OPEN (logs the
 * notice and returns false) so a missing/misconfigured SMTP can never
 * break the auth or payment flow.
 *
 * Rate limit: one email per (recipient, kind) per 6h window, so a school
 * whose teachers retry logins all morning can't spam sales or the admin.
 */
'use strict';

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (_) { /* optional dep */ }

const SALES_EMAIL = process.env.KIDS_SALES_EMAIL || 'sales@eliteedutech.com.ng';
const RATE_WINDOW_MS = 6 * 60 * 60 * 1000;
const _recent = new Map(); // "kind|to" -> timestamp

function rateLimited(kind, to) {
  const key = `${kind}|${to}`;
  const last = _recent.get(key);
  if (last && Date.now() - last < RATE_WINDOW_MS) return true;
  _recent.set(key, Date.now());
  // Opportunistic cleanup so the map can't grow unbounded.
  if (_recent.size > 500) {
    for (const [k, ts] of _recent) if (Date.now() - ts > RATE_WINDOW_MS) _recent.delete(k);
  }
  return false;
}

function transporter() {
  if (!nodemailer) return null;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
  });
}

/** Low-level send. Returns true only when actually handed to SMTP. */
async function send({ to, subject, html, text, kind = 'generic' }) {
  try {
    if (!to) return false;
    if (rateLimited(kind, to)) return false;
    const tx = transporter();
    if (!tx) {
      console.log(`[kids:mail] SMTP not configured — would send (${kind}) to ${to}: ${subject}`);
      return false;
    }
    await tx.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'EliteKids'}" <${process.env.SMTP_FROM_ADDRESS || process.env.SMTP_USERNAME}>`,
      to,
      subject,
      html,
      text: text || subject,
    });
    console.log(`[kids:mail] sent (${kind}) to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error('[kids:mail] send failed:', err.message);
    return false;
  }
}

/**
 * Sales alert — fired when a school without an active subscription/trial
 * tries to log in. This is a HOT lead: the school wants in right now.
 */
async function notifyLockedSchoolAttempt({ school, userType, plans, trial }) {
  const name = school?.school_name || school?.school_id || 'Unknown school';
  const planLines = (plans || [])
    .map((p) => `• ${p.name}: ₦${Number(p.amount_ngn).toLocaleString()} / ${p.billing_period}`)
    .join('<br/>') || '• (plans unavailable)';
  const trialLine = trial
    ? `<p style="color:#b45309"><b>Trial state:</b> expired ${trial.expires_at || 'unknown'}</p>`
    : '';
  return send({
    kind: 'locked-school',
    to: SALES_EMAIL,
    subject: `🔓 Locked-school login: ${name} wants access`,
    text: `Locked-school login attempt — ${name} (${school?.school_id || '?'}) as ${userType}. Plans: ${planLines.replace(/<br\/>/g, '; ')}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px">
        <h2 style="margin:0 0 8px">🔓 Locked-school login attempt</h2>
        <p style="margin:0 0 12px;color:#374151">A school without an active subscription just tried to sign in — this is a hot lead.</p>
        <table style="border-collapse:collapse;width:100%;margin-bottom:12px">
          <tr><td style="padding:6px 10px;background:#f0fdfa;font-weight:bold;width:130px">School</td><td style="padding:6px 10px">${name}</td></tr>
          <tr><td style="padding:6px 10px;background:#f0fdfa;font-weight:bold">School ID</td><td style="padding:6px 10px">${school?.school_id || '?'}</td></tr>
          <tr><td style="padding:6px 10px;background:#f0fdfa;font-weight:bold">User type</td><td style="padding:6px 10px">${userType || '?'}</td></tr>
          <tr><td style="padding:6px 10px;background:#f0fdfa;font-weight:bold">When</td><td style="padding:6px 10px">${new Date().toISOString()}</td></tr>
        </table>
        ${trialLine}
        <p style="margin:0 0 6px;font-weight:bold">Plans to offer:</p>
        <p style="margin:0 0 12px">${planLines}</p>
        <p style="color:#6b7280;font-size:12px;margin:0">Auto-sent by EliteKids login gate — reach out within minutes, the admin is at their desk right now.</p>
      </div>`,
  });
}

module.exports = { send, notifyLockedSchoolAttempt, SALES_EMAIL };
