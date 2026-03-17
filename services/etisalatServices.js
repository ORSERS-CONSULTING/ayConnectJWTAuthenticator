const axios = require('axios');

function formatExpiry(minutes = 10) {
  const d = new Date(Date.now() + minutes * 60 * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  const SS = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`;
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
  const expiry = formatExpiry(10);

  const params = new URLSearchParams({
    msgCategory: '4.2',
    channel: '2.1',
    recipient,
    contentType: '3.1',
    dr: 'false',
    expiryDt: expiry,
    msg: String(message),
    user: process.env.ETISALAT_USER,
    pswd: process.env.ETISALAT_PASSWORD,
    dndCategory: 'Campaign',
    sender: process.env.ETISALAT_SENDER,
  });

  const url = `https://smartmessaging.etisalat.ae:9095/campaignService/campaigns/qs?${params.toString()}`;

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