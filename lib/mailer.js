import nodemailer from 'nodemailer';

let cachedTransport = null;
function getTransport() {
  if (cachedTransport) return cachedTransport;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cachedTransport;
}

const FROM = process.env.MAIL_FROM || `FINLIT360 <${process.env.SMTP_USER}>`;

const wrap = (title, inner) => `
  <div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:32px 16px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:#1e3a8a;color:#fff;padding:24px;text-align:center">
        <div style="font-size:22px;font-weight:700;letter-spacing:0.5px">FINLIT360</div>
        <div style="font-size:12px;opacity:0.8;margin-top:4px">ISCI Foundation • Campaign Management</div>
      </div>
      <div style="padding:32px 28px;color:#1e293b">${inner}</div>
      <div style="background:#f1f5f9;padding:16px 28px;font-size:11px;color:#64748b;text-align:center">
        ISCI Foundation • Gwalior, Madhya Pradesh
      </div>
    </div>
  </div>`;

export async function sendMagicLink({ to, name, link }) {
  const transport = getTransport();
  if (!transport) throw new Error('Email service not configured (SMTP env vars missing)');
  const inner = `
    <div style="font-size:16px;margin-bottom:12px">Hi ${name || 'there'},</div>
    <div style="font-size:14px;line-height:1.6;color:#475569">You requested to sign in to FINLIT360. Click the button below to securely log in. This link expires in 15 minutes.</div>
    <div style="text-align:center;margin:32px 0">
      <a href="${link}" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px">Sign in to FINLIT360</a>
    </div>
    <div style="font-size:12px;color:#94a3b8;line-height:1.6">If you didn't request this, you can safely ignore this email. Your account will remain secure.</div>
    <div style="font-size:11px;color:#94a3b8;margin-top:16px;word-break:break-all">Or paste this link into your browser:<br/><span style="color:#475569">${link}</span></div>`;
  const info = await transport.sendMail({
    from: FROM,
    to,
    subject: 'Your FINLIT360 sign-in link',
    html: wrap('Sign-in link', inner),
    text: `Hi ${name || 'there'},\n\nSign in to FINLIT360 using this link (valid 15 minutes):\n\n${link}\n\nIf you didn't request this, ignore this email.`,
  });
  return { id: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

export async function sendNotificationEmail({ to, subject, name, body, cta }) {
  const transport = getTransport();
  if (!transport) return null;
  const inner = `
    <div style="font-size:15px;margin-bottom:12px">Hi ${name || ''},</div>
    <div style="font-size:14px;line-height:1.6;color:#475569">${body}</div>
    ${cta ? `<div style="text-align:center;margin:24px 0"><a href="${cta.url}" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px">${cta.label}</a></div>` : ''}`;
  try {
    const info = await transport.sendMail({ from: FROM, to, subject, html: wrap(subject, inner) });
    return { id: info.messageId };
  } catch (e) { console.error('Email send failed:', e.message); return null; }
}
