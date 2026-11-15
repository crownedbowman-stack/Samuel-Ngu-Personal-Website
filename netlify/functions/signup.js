// Receives the signup form and writes one record to Airtable.
// The Airtable token lives only in Netlify's environment variables (AIRTABLE_TOKEN).

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appkwsucg7QjS96nG';
const TABLE = process.env.AIRTABLE_TABLE || 'tblUB0d6IFvTSlrPF'; // Enterprise Leads
const SOURCE = 'Enterprise webinar page';
const HEALTH_TABLE = process.env.AIRTABLE_HEALTH_TABLE || 'tblyr06qB7HWba3TX'; // Practitioner Leads
const INDIVIDUAL_TABLE = process.env.AIRTABLE_INDIVIDUAL_TABLE || 'Individual Leads'; // Align Individual save-the-date list

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const phoneOk = (p) => /^[0-9+()\-.\s]{7,25}$/.test(p) && p.replace(/\D/g, '').length >= 7 && p.replace(/\D/g, '').length <= 15;
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

  // Align Individual save-the-date list goes to its own table.
  if (d.list === 'individual') {
    const iName = text(d.name, 200);
    const iEmail = text(d.email, 200).toLowerCase();
    const iPhone = text(d.phone, 40);
    const platform = text(d.platform, 40);
    const handle = text(d.handle, 200);
    const understand = text(d.understand, 160);
    const slot = text(d.time, 120);

    if (!iName || !understand || !slot) return json(400, { error: 'Please complete the required fields.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(iEmail)) return json(400, { error: 'Please enter a valid email.' });
    if (!phoneOk(iPhone)) return json(400, { error: 'Please enter a valid phone number.' });
    if (d.consent !== 'yes' && d.consent !== true) return json(400, { error: 'Please confirm you agree to be emailed.' });

    // One real social profile, to filter out fake signups.
    const DOMAINS = {
      LinkedIn: ['linkedin.com'],
      Instagram: ['instagram.com'],
      Facebook: ['facebook.com', 'fb.com'],
      X: ['x.com', 'twitter.com'],
      TikTok: ['tiktok.com'],
      YouTube: ['youtube.com', 'youtu.be'],
    };
    if (!DOMAINS[platform]) return json(400, { error: 'Please choose where we can find you online.' });
    if ((handle.match(/[a-z0-9]/gi) || []).length < 3 || /\s{2,}/.test(handle)) {
      return json(400, { error: 'Please enter your handle or profile link.' });
    }
    if (/^https?:\/\//i.test(handle) || /\.[a-z]{2,}\//i.test(handle)) {
      const host = handle.replace(/^https?:\/\//i, '').split(/[\/?#]/)[0].toLowerCase().replace(/^www\./, '');
      if (!DOMAINS[platform].some((dom) => host === dom || host.endsWith('.' + dom))) {
        return json(400, { error: `That link does not look like a ${platform} profile. Please check it.` });
      }
    }

    const SLOTS = ['Tuesday 6:00 pm Arizona', 'Thursday 6:00 pm Arizona', 'Saturday 9:00 am Arizona'];
    if (!SLOTS.includes(slot)) return json(400, { error: 'Please choose a time.' });

    return save(
      {
        'Full name': iName,
        Email: iEmail,
        Phone: iPhone,
        'Social platform': platform,
        'Social handle': handle,
        'Want to understand': understand,
        'Preferred session time': slot,
        'Design partner interest': d.design_partner === true || d.design_partner === 'yes',
        'Consent to email': true,
        'Consent date': new Date().toISOString(),
        Source: 'Align Individual save the date',
        Status: 'New',
      },
      INDIVIDUAL_TABLE
    );
  }

  // Align Health practitioner list goes to its own table.
  if (d.list === 'health') {
    const hName = text(d.name, 200);
    const hEmail = text(d.email, 200).toLowerCase();
    const who = text(d.who, 120);
    const clients = text(d.active_clients, 120);
    const biz = text(d.business, 200);
    const hPhone = text(d.phone, 40);
    if (!hName || !who || !clients || !biz) return json(400, { error: 'Please complete the required fields.' });
    if (!phoneOk(hPhone)) return json(400, { error: 'Please enter a valid phone number.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(hEmail)) return json(400, { error: 'Please enter a valid email.' });
    if (d.consent !== 'yes' && d.consent !== true) return json(400, { error: 'Please confirm you agree to be emailed.' });

    const PLATFORMS = { LinkedIn: 'h_linkedin', Instagram: 'h_instagram', YouTube: 'h_youtube', TikTok: 'h_tiktok', Facebook: 'h_facebook' };
    const chosen = list(d.platforms).filter((n) => PLATFORMS[n] && text(d[PLATFORMS[n]], 200));
    if (!chosen.length) return json(400, { error: 'Please add at least one social handle or link.' });

    const hf = {
      'Full name': hName,
      Email: hEmail,
      Phone: hPhone,
      'Who you are': who,
      'Active clients': clients,
      'Main platforms': chosen,
      'Consent to email': true,
      'Consent date': new Date().toISOString(),
      Source: 'Align Health webinar page',
      Status: 'New',
    };
    chosen.forEach((n) => { hf[n] = text(d[PLATFORMS[n]], 200); });
    hf['Practice or business'] = biz;
    hf['Main platform'] = chosen.includes(text(d.main_platform, 40)) ? text(d.main_platform, 40) : chosen[0];
    const help = list(d.interest);
    if (help.length) hf['What would help most'] = help;
    const otherText = text(d.other_text, 300);
    if (otherText) hf['Other (what would help)'] = otherText;
    if (d.founding === true || d.founding === 'yes') hf['Founding interest'] = true;
    const ready = text(d.ready_to_invest, 120);
    if (ready) hf['Ready to invest'] = ready;
    const slot = text(d.time, 120);
    if (slot) hf['Preferred demo time'] = slot;
    const heard = text(d.heard_from, 200);
    if (heard) hf['Heard from'] = heard;
    const ref = text(d.referred_by, 80);
    if (ref) hf['Referred by'] = ref;
    return save(hf, HEALTH_TABLE);
  }

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
  const seniority = text(d.seniority, 120);
  const phone = text(d.phone, 40);

  if (!name || !company || !seniority) return json(400, { error: 'Please complete the required fields.' });
  if (!phoneOk(phone)) return json(400, { error: 'Please enter a valid phone number.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(400, { error: 'Please enter a valid email.' });
  if (d.consent !== 'yes' && d.consent !== true) return json(400, { error: 'Please confirm you agree to be emailed.' });

  const fields = {
    'Full name': name,
    Email: email,
    Phone: phone,
    Company: company,
    'Consent to email': true,
    'Consent date': new Date().toISOString(),
    Source: SOURCE,
    Status: 'New',
  };

  if (role) fields['Role or title'] = role;

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

async function save(fields, table = TABLE) {
  try {
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}`, {
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
