require('dotenv').config();

const required = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
};

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: required('JWT_SECRET'),

  // For later (API Gateway/IDCS)
  IDCS_TENANT: process.env.IDCS_TENANT,
  IDCS_CLIENT_ID: process.env.IDCS_CLIENT_ID,
  IDCS_CLIENT_SECRET: process.env.IDCS_CLIENT_SECRET,
  IDCS_SCOPES: process.env.IDCS_SCOPES || 'ayc.read ayc.write',
  GATEWAY_BASE_URL: process.env.GATEWAY_BASE_URL,
  ETISALAT_USER: process.env.ETISALAT_USER,
  ETISALAT_PASSWORD: process.env.ETISALAT_PASSWORD,
  ETISALAT_SENDER: process.env.ETISALAT_SENDER
};
