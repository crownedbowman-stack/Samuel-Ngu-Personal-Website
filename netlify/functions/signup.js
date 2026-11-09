// Receives the signup form and writes one record to Airtable.
// The Airtable token lives only in Netlify's environment variables (AIRTABLE_TOKEN).

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appkwsucg7QjS96nG';
const TABLE = process.env.AIRTABLE_TABLE || 'tblUB0d6IFvTSlrPF'; // Enterprise Leads
const SOURCE = 'Enterprise webinar page';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const text = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => text(x, 120)).filter(Boolean);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!process.env.AIRTABLE_TOKEN) return json(500, { error: 'Server is not configured' });
  if ((event.body || '').length > 20000) return json(413, { error: 'Request too large' });

  let d;
  try {
    d = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid request' });
  }

  // Bots fill the hidden field. Pretend it worked.
  if (text(d['bot-field'])) return json(200, { ok: true });

  // Email-only signup from the samuelngu.com updates box.
  if (d.mode === 'updates') {
    const addr = text(d.email, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) return json(400, { error: 'Please enter a valid email.' });
    return save({
      Email: addr,
      'Consent to email': true,
      'Consent date': new Date().toISOString(),
      Source: 'Updates list (samuelngu.com)',
      Status: 'New',
    });
  }

  const name = text(d.name, 200);
  const email = text(d.email, 200).toLowerCase();
  const company = text(d.company, 200);
  const role = text(d.role, 200);

  if (!name || !company || !role) return json(400, { error: 'Please complete the required fields.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(400, { error: 'Please enter a valid email.' });
  if (d.consent !== 'yes' && d.consent !== true) return json(400, { error: 'Please confirm you agree to be emailed.' });

  const fields = {
    'Full name': name,
    Email: email,
    Company: company,
    'Role or title': role,
    'Consent to email': true,
    'Consent date': new Date().toISOString(),
    Source: SOURCE,
    Status: 'New',
  };

  const phone = text(d.phone, 40);
  if (phone) fields.Phone = phone;

  let linkedin = text(d.linkedin, 300);
  if (linkedin) {
    if (!/^https?:\/\//i.test(linkedin)) linkedin = 'https://' + linkedin;
    try {
      new URL(linkedin);
      fields['LinkedIn URL'] = linkedin;
    } catch (e) {
      /* skip an unusable link rather than fail the signup */
    }
  }

  const single = {
    Seniority: text(d.seniority, 120),
    'Who you are': text(d.who, 120),
    'Company size': text(d.size, 120),
    'How soon': text(d.how_soon, 120),
    'Preferred demo time': text(d.time, 120),
  };
  Object.entries(single).forEach(([k, v]) => {
    if (v) fields[k] = v;
  });

  const problems = list(d.problems);
  if (problems.length) fields['Biggest problem'] = problems;
  const nextStep = list(d.next_step);
  if (nextStep.length) fields['Next step'] = nextStep;

  const notes = text(d.notes, 2000);
  if (notes) fields['What is going on'] = notes;

  return save(fields);
};

async function save(fields) {
  try {
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      // typecast lets Airtable accept a select option it has not seen yet
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('Airtable error', res.status, detail);
      return json(502, { error: 'We could not save your signup. Please try again in a moment.' });
    }
    return json(200, { ok: true });
  } catch (e) {
    console.error('Signup failed', e);
    return json(502, { error: 'We could not save your signup. Please try again in a moment.' });
  }
}
