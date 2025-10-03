// require('dotenv').config();

// const required = (name) => {
//   const v = process.env[name];
//   if (!v) throw new Error(`Missing env var: ${name}`);
//   return v;
// };

// module.exports = {
//   PORT: process.env.PORT || 3000,
//   JWT_SECRET: required('JWT_SECRET'),

//   // For later (API Gateway/IDCS)
//   IDCS_TENANT: process.env.IDCS_TENANT,
//   IDCS_CLIENT_ID: process.env.IDCS_CLIENT_ID,
//   IDCS_CLIENT_SECRET: process.env.IDCS_CLIENT_SECRET,
//   IDCS_SCOPES: process.env.IDCS_SCOPES || 'ayc.read ayc.write',
//   GATEWAY_BASE_URL: process.env.GATEWAY_BASE_URL,
//   ETISALAT_USER: process.env.ETISALAT_USER,
//   ETISALAT_PASSWORD: process.env.ETISALAT_PASSWORD,
//   ETISALAT_SENDER: process.env.ETISALAT_SENDER
// };
require("dotenv").config();
const { getSecret } = require("./vault");

const required = async (name, vaultOcidEnvVar) => {
  // 1. Try normal env var
  if (process.env[name]) return process.env[name];

  // 2. Otherwise, try fetching from OCI Vault
  const secretOcid = process.env[vaultOcidEnvVar];
  if (secretOcid) {
    return await getSecret(secretOcid);
  }

  throw new Error(`Missing config: ${name}`);
};

async function loadConfig() {
  return {
    PORT: process.env.PORT || 3000,
    JWT_SECRET: await required("JWT_SECRET", "JWT_SECRET_OCID"),

    IDCS_TENANT: await required("IDCS_TENANT", "IDCS_TENANT_OCID"),
    IDCS_CLIENT_ID: await required("IDCS_CLIENT_ID", "IDCS_CLIENT_ID_OCID"),
    IDCS_CLIENT_SECRET: await required("IDCS_CLIENT_SECRET", "IDCS_CLIENT_SECRET_OCID"),
    IDCS_SCOPES: process.env.IDCS_SCOPES || "ayc.read ayc.write",
    GATEWAY_BASE_URL: process.env.GATEWAY_BASE_URL,

    ETISALAT_USER: await required("ETISALAT_USER", "ETISALAT_USER_OCID"),
    ETISALAT_PASSWORD: await required("ETISALAT_PASSWORD", "ETISALAT_PASSWORD_OCID"),
    ETISALAT_SENDER: await required("ETISALAT_SENDER", "ETISALAT_SENDER_OCID"),
  };
}

module.exports = loadConfig;
