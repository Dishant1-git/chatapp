// ✉️ Sending email.
//
// Free hosting (Render's free tier, and most others) blocks outbound SMTP
// ports, so Gmail/SMTP can't be used there at all. This sends over plain HTTPS
// through Brevo's API instead, which nothing blocks — while still letting the
// mail come *from* your own Gmail address once you've verified it as a sender
// in Brevo (free: 300 emails a day, no card).
//
// Set in the environment:
//   BREVO_API_KEY   the key from Brevo → SMTP & API → API keys
//   MAIL_FROM       the address you verified there, e.g. you@gmail.com
//   MAIL_FROM_NAME  optional, the name shown in the inbox (default "Ghost-ed")
//
// With no key set, the message is printed to the server log instead, so local
// development and tests work without an account anywhere.

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

export function mailerReady() {
  return Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail({ to, subject, text, html }) {
  if (!mailerReady()) {
    // No mail service configured: log it, so the code can still be used
    console.log(`\n> [mail] to ${to}: ${subject}\n> ${text.replace(/\n/g, '\n> ')}\n`);
    return { delivered: false, logged: true };
  }

  const response = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || 'Ghost-ed' },
      to: [{ email: to }],
      subject,
      textContent: text,
      ...(html && { htmlContent: html }),
    }),
  });

  if (!response.ok) {
    // Brevo answers with { message, code }
    const body = await response.json().catch(() => ({}));
    const reason = body.message || `HTTP ${response.status}`;
    console.error(`[mail] Brevo refused the message to ${to}: ${reason}`);
    throw new Error('The code could not be sent. Please try again in a moment.');
  }

  return { delivered: true };
}

// The one mail this app sends: a six-digit code, in plain text and as a card
export function verificationMail(code, name = '') {
  const hello = name ? `Hi ${name},` : 'Hi,';
  const text = `${hello}

Your Ghost-ed verification code is ${code}

It works for the next 15 minutes. If you didn't sign up, you can ignore this email.`;

  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f7e8e2;padding:32px">
  <div style="max-width:420px;margin:0 auto;background:#fffbf9;border-radius:20px;padding:28px;text-align:center">
    <p style="margin:0 0 6px;color:#8b6a5f;font-size:14px">${hello}</p>
    <h1 style="margin:0 0 18px;color:#c1573a;font-size:22px">Your Ghost-ed code</h1>
    <p style="margin:0 auto 18px;display:inline-block;background:#fadfd4;color:#33170f;font-size:32px;letter-spacing:8px;font-weight:700;padding:12px 20px;border-radius:14px">${code}</p>
    <p style="margin:0;color:#8b6a5f;font-size:13px">It works for the next 15 minutes.<br>If you didn't sign up, you can ignore this email.</p>
  </div>
</div>`;

  return { subject: `${code} is your Ghost-ed code`, text, html };
}

// 🔑 The other one: a code for setting a new password after forgetting it
export function resetMail(code, name = '') {
  const hello = name ? `Hi ${name},` : 'Hi,';
  const text = `${hello}

Your Ghost-ed password reset code is ${code}

It works for the next 15 minutes. If you didn't ask to reset your password, you can ignore this
email — nothing has changed.`;

  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f7e8e2;padding:32px">
  <div style="max-width:420px;margin:0 auto;background:#fffbf9;border-radius:20px;padding:28px;text-align:center">
    <p style="margin:0 0 6px;color:#8b6a5f;font-size:14px">${hello}</p>
    <h1 style="margin:0 0 18px;color:#c1573a;font-size:22px">Reset your password</h1>
    <p style="margin:0 auto 18px;display:inline-block;background:#fadfd4;color:#33170f;font-size:32px;letter-spacing:8px;font-weight:700;padding:12px 20px;border-radius:14px">${code}</p>
    <p style="margin:0;color:#8b6a5f;font-size:13px">It works for the next 15 minutes.<br>Didn't ask for this? Ignore this email — nothing has changed.</p>
  </div>
</div>`;

  return { subject: `${code} is your Ghost-ed password reset code`, text, html };
}
