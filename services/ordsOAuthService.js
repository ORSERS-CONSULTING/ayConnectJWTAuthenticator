// services/ordsOAuthService.js
const axios = require("axios");

let cached = { token: null, exp: 0 };

async function getOrdsToken() {
    const now = Math.floor(Date.now() / 1000);
    if (cached.token && now < cached.exp - 30) return cached.token;
    const ORDS_TOKEN_URL = "https://apex2.renkaco.com/ords/wksp_maindb_ayc/oauth/token";
    if (!process.env.ORDS_CLIENT_ID) throw new Error("ORDS_CLIENT_ID missing");
    if (!process.env.ORDS_CLIENT_SECRET)
        throw new Error("ORDS_CLIENT_SECRET missing");

    const body = "grant_type=client_credentials";

    const { data } = await axios.post(ORDS_TOKEN_URL, body, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization:
                "Basic " +
                Buffer.from(
                    `${process.env.ORDS_CLIENT_ID}:${process.env.ORDS_CLIENT_SECRET}`
                ).toString("base64"),
        },
        validateStatus: () => true,
    });

    if (!data?.access_token) {
        // show useful error (ORDS often returns JSON with error fields)
        throw new Error(
            `Failed to get ORDS token. Response: ${JSON.stringify(data)}`
        );
    }

    cached.token = data.access_token;
    cached.exp = now + (data.expires_in || 900);
    return cached.token;
}

module.exports = { getOrdsToken };
