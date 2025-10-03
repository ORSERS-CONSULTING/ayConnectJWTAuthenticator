const axios = require('axios');
// const {
//     ETISALAT_USER,
//     ETISALAT_PASSWORD,
//     ETISALAT_SENDER,
// } = require('../config/env');

function svExpiry(minutes = 5) {
    // "YYYY-MM-DD HH:mm:ss" (Etisalat format)
    const d = new Date(Date.now() + minutes * 60 * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const MM = String(d.getMinutes()).padStart(2, '0');
    const SS = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`;
}
/**
 * Send SMS via Etisalat using your exact URL shape.
 * @param {{ to: string, message: string }} opts
 */

async function sendSms({ opts }) {
    const { to, message } = opts;
    if (!process.env.ETISALAT_USER || !process.env.ETISALAT_PASSWORD || !process.env.ETISALAT_SENDER) {
        throw new Error('Etisalat credentials missing');
    }

    const expiry = new Date(Date.now() + 5 * 60000)
        .toLocaleString("sv-SE")
        .replace("T", " ")
        .slice(0, 19);

    const url = `https://smartmessaging.etisalat.ae:9095/campaignService/campaigns/qs?msgCategory=4.2&channel=2.1&recipient=${to}&contentType=3.1&dr=false&expiryDt=${expiry}&msg=${message}&user=${process.env.ETISALAT_USER}&pswd=${process.env.ETISALAT_PASSWORD}&dndCategory=Campaign&sender=${process.env.ETISALAT_SENDER}`;
    const { data, status } = await axios.get(url, { timeout: 15000 });
    return { ok: status >= 200 && status < 300, raw: data };
}

module.exports = { sendSms };
