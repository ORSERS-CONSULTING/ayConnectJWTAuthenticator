// bootstrap.js
require('dotenv').config();
const loadConfig = require('./config/env');
const jwtKeyring = require('./lib/jwtKeyring');

(async () => {
  // load configuration (reads Vault or env as your loadConfig does)
  const cfg = await loadConfig();

  // Export values into process.env so other modules that expect env still work
  process.env.PORT = cfg.PORT;
  process.env.JWT_SECRET = cfg.JWT_SECRET;          // fallback single-secret
  process.env.IDCS_TENANT = cfg.IDCS_TENANT;
  process.env.IDCS_CLIENT_ID = cfg.IDCS_CLIENT_ID;
  process.env.IDCS_CLIENT_SECRET = cfg.IDCS_CLIENT_SECRET;
  process.env.ETISALAT_USER = cfg.ETISALAT_USER;
  process.env.ETISALAT_PASSWORD = cfg.ETISALAT_PASSWORD;
  process.env.ETISALAT_SENDER = cfg.ETISALAT_SENDER;
  process.env.GATEWAY_BASE_URL = cfg.GATEWAY_BASE_URL;
  process.env.STRIPE_PUBLISHABLE_KEY = cfg.STRIPE_PUBLISHABLE_KEY;
  process.env.ACCESS_TOKEN_TTL = cfg.ACCESS_TOKEN_TTL || process.env.ACCESS_TOKEN_TTL;

  // Now initialize the jwt keyring (preferred) but gracefully fall back
  try {
    await jwtKeyring.init({ refreshIntervalMs: 30_000 });
    global.jwtKeyring = jwtKeyring;
    console.log('[bootstrap] jwtKeyring ready', jwtKeyring.getKids());
  } catch (err) {
    console.warn('[bootstrap] jwtKeyring init failed, falling back to JWT_SECRET:', err.message || err);
    global.jwtKeyring = null;
  }

  // start your express app after env + keyring are ready
  require('./index');
})
