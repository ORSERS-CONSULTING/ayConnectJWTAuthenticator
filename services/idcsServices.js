const axios = require('axios');
const base64 = require('base-64');
const {
    IDCS_TENANT, IDCS_CLIENT_ID, IDCS_CLIENT_SECRET
} = require('../config/env');

let cached = { token: null, exp: 0 };

async function getIdcsToken(scope) {
    if (!scope) throw new Error('scope required');
    const now = Math.floor(Date.now() / 1000);
    if (cached.token && now < cached.exp - 30) return cached.token;

    const url = `https://${IDCS_TENANT}/oauth2/v1/token`;
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        scope: scope
    }).toString();

    const { data } = await axios.post(url, body, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${base64.encode(`${IDCS_CLIENT_ID}:${IDCS_CLIENT_SECRET}`)}`
        },
    });

    cached.token = data.access_token;
    cached.exp = now + data.expires_in;
    return cached.token;
}

module.exports = { getIdcsToken };
