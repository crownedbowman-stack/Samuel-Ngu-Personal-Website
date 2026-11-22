// Receives the webinar registration, saves it to Airtable, then returns the calendar and join links.
// The Airtable token lives only in Netlify's environment variables (AIRTABLE_TOKEN).
// Optional Netlify variables: WEBINAR_JOIN_LINK, WEBINAR_CALENDAR_LINK (to change links without editing code).

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appkwsucg7QjS96nG';
const TABLE = process.env.AIRTABLE_TABLE || 'tblUB0d6IFvTSlrPF'; // Enterprise Leads
const SOURCE = 'Webinar Dec 9';
const JOIN = process.env.WEBINAR_JOIN_LINK || 'https://meet.google.com/ube-qvsu-pbp';
const CALENDAR = process.env.WEBINAR_CALENDAR_LINK || 'https://www.addevent.com/event/9hl0lgxnl5dz';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function save(fields) {
  return fetch(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!process.env.AIRTABLE_TOKEN) return json(500, { error: 'Server is not configured' });
  if ((event.body || '').length > 5000) return json(413, { error: 'Request too large' });

  let d;
  try {
    d = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid request' });
  }

  // Bots fill the hidden field. Pretend it worked, but give them nothing.
  if (text(d['bot-field'])) return json(200, { ok: true });

  const name = text(d.name);
  const email = text(d.email).toLowerCase();
  const company = text(d.company);
  const bottleneck = text(d.bottleneck, 400);

  if (!name || !company) return json(400, { error: 'Please add your name and company.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(400, { error: 'Please enter a valid email.' });
  if (d.consent !== 'yes' && d.consent !== true) return json(400, { error: 'Please tick the box so we can send your join link.' });

  const fields = {
    'Full name': name,
    Email: email,
    Company: company,
    'Consent to email': true,
    'Consent date': new Date().toISOString(),
    Source: SOURCE,
    Status: 'Registered',
  };

  try {
    let res;
    if (bottleneck) {
      // Try with the optional bottleneck field. If that column does not exist yet, save without it.
      res = await save({ ...fields, 'Biggest bottleneck': bottleneck });
      if (res.status === 422) res = await save(fields);
    } else {
      res = await save(fields);
    }
    if (!res.ok) {
      console.error('Airtable error', res.status, await res.text());
      return json(502, { error: 'We could not save that. Please try again in a moment.' });
    }
    return json(200, { ok: true, join: JOIN, calendar: CALENDAR });
  } catch (e) {
    console.error('Webinar signup failed', e);
    return json(502, { error: 'We could not save that. Please try again in a moment.' });
  }
};
