const loadConfig = require('./config/env');

(async () => {
  const config = await loadConfig();
  process.env.PORT = config.PORT
  process.env.JWT_SECRET = config.JWT_SECRET;
  process.env.IDCS_TENANT = config.IDCS_TENANT;
  process.env.IDCS_CLIENT_ID = config.IDCS_CLIENT_ID;
  process.env.IDCS_CLIENT_SECRET = config.IDCS_CLIENT_SECRET;
  process.env.ETISALAT_USER = config.ETISALAT_USER;
  process.env.ETISALAT_PASSWORD = config.ETISALAT_PASSWORD;
  process.env.ETISALAT_SENDER = config.ETISALAT_SENDER;
  process.env.GATEWAY_BASE_URL = config.GATEWAY_BASE_URL;
  process.env.STRIPE_PUBLISHABLE_KEY = config.STRIPE_PUBLISHABLE_KEY;
  process.env.ACCESS_TOKEN_TTL = config.ACCESS_TOKEN_TTL || process.env.ACCESS_TOKEN_TTL;
  process.env.MPGS_BASE_URL = config.MPGS_BASE_URL,
  process.env.MERCHANT_ID = config.MERCHANT_ID,
  process.env.MERCHANT_PASSWORD = config.MERCHANT_PASSWORD,
  process.env.ORDS_CLIENT_ID_OCID = config.ORDS_CLIENT_ID_OCID,
  process.env.ORDS_CLIENT_SECRET_OCID = config.ORDS_CLIENT_SECRET_OCID,

  require('./index'); // start your express app
})();



// require('dotenv').config();
// const loadConfig = require('./config/env');
// const jwtKeyring = require('./utils/jwtKeyring');

// (async () => {
//   const cfg = await loadConfig();

//   // export for legacy code expecting process.env
//   process.env.PORT = cfg.PORT;
//   process.env.JWT_SECRET = cfg.JWT_SECRET;
//   process.env.IDCS_TENANT = cfg.IDCS_TENANT;
//   process.env.IDCS_CLIENT_ID = cfg.IDCS_CLIENT_ID;
//   process.env.IDCS_CLIENT_SECRET = cfg.IDCS_CLIENT_SECRET;
//   process.env.ETISALAT_USER = cfg.ETISALAT_USER;
//   process.env.ETISALAT_PASSWORD = cfg.ETISALAT_PASSWORD;
//   process.env.ETISALAT_SENDER = cfg.ETISALAT_SENDER;
//   process.env.GATEWAY_BASE_URL = cfg.GATEWAY_BASE_URL;
//   process.env.STRIPE_PUBLISHABLE_KEY = cfg.STRIPE_PUBLISHABLE_KEY;
//   process.env.ACCESS_TOKEN_TTL = cfg.ACCESS_TOKEN_TTL || process.env.ACCESS_TOKEN_TTL;

//   // try to init keyring — fall back silently to env-based JWT_SECRET if it fails
//   try {
//     await jwtKeyring.init({ refreshIntervalMs: 30_000 });
//     global.jwtKeyring = jwtKeyring;
//     console.log('[bootstrap] jwtKeyring ready', jwtKeyring.getKids());
//   } catch (err) {
//     global.jwtKeyring = null;
//     console.warn('[bootstrap] jwtKeyring init failed, falling back to JWT_SECRET:', err && err.message);
//   }

//   // start the server after env + keyring are ready
//   require('./index');
// })();
