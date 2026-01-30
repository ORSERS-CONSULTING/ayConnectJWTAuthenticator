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
  process.env.REFRESH_TOKEN_PEPPER_OCID = config.REFRESH_TOKEN_PEPPER_OCID,
  process.env.TEST_RESOURCE = config.TEST_RESOURCE,
  process.env.TEST_CLEINT = config.TEST_CLEINT,
  require('./index'); // start your express app
})();



