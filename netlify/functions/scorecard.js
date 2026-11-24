// Receives the scorecard form, writes one record to Airtable, then returns the download path.
// The Airtable token lives only in Netlify's environment variables (AIRTABLE_TOKEN).
// Optional: set SCORECARD_PATH in Netlify to change the file without editing this code.

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appkwsucg7QjS96nG';
const TABLE = process.env.AIRTABLE_TABLE || 'tblUB0d6IFvTSlrPF'; // Enterprise Leads
const SOURCE = 'Risk Scorecard download';
const FILE_PATH = process.env.SCORECARD_PATH || '/downloads/Align360-Risk-Scorecard-gjwg6rtxan.pdf';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

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

  if (!name || !company) return json(400, { error: 'Please add your name and company.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(400, { error: 'Please enter a valid email.' });
  if (d.consent !== 'yes' && d.consent !== true) return json(400, { error: 'Please tick the box so we can send your scorecard.' });

  try {
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      // typecast lets Airtable accept a select option it has not seen yet
      body: JSON.stringify({
        records: [{
          fields: {
            'Full name': name,
            Email: email,
            Company: company,
            'Consent to email': true,
            'Consent date': new Date().toISOString(),
            Source: SOURCE,
            Status: 'New',
          },
        }],
        typecast: true,
      }),
    });
    if (!res.ok) {
      console.error('Airtable error', res.status, await res.text());
      return json(502, { error: 'We could not save that. Please try again in a moment.' });
    }
    return json(200, { ok: true, download: FILE_PATH });
  } catch (e) {
    console.error('Scorecard signup failed', e);
    return json(502, { error: 'We could not save that. Please try again in a moment.' });
  }
};
