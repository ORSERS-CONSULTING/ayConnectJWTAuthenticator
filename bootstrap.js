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
  require('./index'); // start your express app
})();
