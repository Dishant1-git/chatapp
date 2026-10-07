import { Router } from 'express';
import User from '../models/User.js';
import { readMailOffToken } from '../utils/comeBack.js';

// 💌 The "stop these emails" link at the bottom of a come-back mail
// (utils/comeBack.js). No login: the person clicking it is, by definition,
// someone who hasn't been in the app for a while. The signed token in the link
// says whose mails to stop, and can do nothing else.

const router = Router();

function page(title, text) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Ghost-ed</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f7e8e2;padding:32px">
  <div style="max-width:420px;margin:10vh auto 0;background:#fffbf9;border-radius:20px;padding:28px;text-align:center">
    <h1 style="margin:0 0 12px;color:#c1573a;font-size:22px">${title}</h1>
    <p style="margin:0;color:#8b6a5f;font-size:15px;line-height:1.5">${text}</p>
  </div>
</body>
</html>`;
}

// GET /api/mail/off?t=<token> — a GET, because it's opened from an email
router.get('/off', async (req, res) => {
  const userId = readMailOffToken(req.query.t);
  if (!userId) {
    return res.status(400).send(page('That link didn’t work', 'It may have been cut short. Try the link in the email again.'));
  }
  await User.updateOne({ _id: userId }, { comeBackMails: false });
  res.send(page('Done 👻', 'We won’t email you about people waiting for you any more. Your account and your chats are untouched.'));
});

export default router;
