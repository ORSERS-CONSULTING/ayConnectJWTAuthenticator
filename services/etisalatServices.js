const axios = require('axios');

function formatExpiryDubai(minutes = 10) {
  const d = new Date(Date.now() + minutes * 60 * 1000);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

function normalizeUaeMobile(input) {
  let value = String(input || '').trim().replace(/\s+/g, '');

  if (value.startsWith('+971')) {
    value = value.slice(1);
  } else if (value.startsWith('05')) {
    value = '971' + value.slice(1);
  } else if (value.startsWith('5') && value.length === 9) {
    value = '971' + value;
  }

  return value;
}

async function sendSms({ opts }) {
  const { to, message } = opts;

  if (!process.env.ETISALAT_USER || !process.env.ETISALAT_PASSWORD || !process.env.ETISALAT_SENDER) {
    throw new Error('Etisalat credentials missing');
  }

  const recipient = normalizeUaeMobile(to);
  const expiry = formatExpiryDubai(10);

  const query =
    `msgCategory=4.2` +
    `&channel=2.1` +
    `&recipient=${encodeURIComponent(recipient)}` +
    `&contentType=3.1` +
    `&dr=false` +
    `&expiryDt=${encodeURIComponent(expiry)}` +
    `&msg=${encodeURIComponent(String(message))}` +
    `&user=${encodeURIComponent(process.env.ETISALAT_USER)}` +
    `&pswd=${encodeURIComponent(process.env.ETISALAT_PASSWORD)}` +
    `&dndCategory=Campaign` +
    `&sender=${encodeURIComponent(process.env.ETISALAT_SENDER)}`;

  const url = `https://smartmessaging.etisalat.ae:9095/campaignService/campaigns/qs?${query}`;

  try {
    const { data, status } = await axios.get(url, { timeout: 15000 });

    console.log('Etisalat success:', {
      status,
      recipient,
      expiry,
      sender: process.env.ETISALAT_SENDER,
      data,
    });

    return { ok: true, raw: data };
  } catch (err) {
    console.error('Etisalat SMS failed:', {
      message: err?.message,
      status: err?.response?.status,
      data: err?.response?.data,
      recipient,
      expiry,
      sender: process.env.ETISALAT_SENDER,
      fullUrl: url,
    });

    throw err;
  }
}

module.exports = { sendSms };