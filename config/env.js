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
    ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL,  // <— add this line
    JWT_SECRET: await required("JWT_SECRET", "JWT_SECRET_OCID"),
    ORDS_CLIENT_ID_OCID: await required("ORDS_CLIENT_ID", "ORDS_CLIENT_ID_OCID"),
    ORDS_CLIENT_SECRET_OCID: await required("ORDS_CLIENT_SECRET", "ORDS_CLIENT_SECRET_OCID"),
    IDCS_TENANT: await required("IDCS_TENANT", "IDCS_TENANT_OCID"),
    IDCS_CLIENT_ID: await required("IDCS_CLIENT_ID", "IDCS_CLIENT_ID_OCID"),
    IDCS_CLIENT_SECRET: await required("IDCS_CLIENT_SECRET", "IDCS_CLIENT_SECRET_OCID"),
    GATEWAY_BASE_URL: process.env.GATEWAY_BASE_URL,
    MPGS_BASE_URL: await required("MPGS_BASE_URL", "MPGS_BASE_URL_OCID"),
    MERCHANT_ID: await required("MERCHANT_ID", "MERCHANT_ID_OCID"),
    MERCHANT_PASSWORD: await required("MERCHANT_PASSWORD", "MERCHANT_PASSWORD_OCID"),
    ETISALAT_USER: await required("ETISALAT_USER", "ETISALAT_USER_OCID"),
    ETISALAT_PASSWORD: await required("ETISALAT_PASSWORD", "ETISALAT_PASSWORD_OCID"),
    ETISALAT_SENDER: await required("ETISALAT_SENDER", "ETISALAT_SENDER_OCID"),
    STRIPE_PUBLISHABLE_KEY: await required("STRIPE_PUBLISHABLE_KEY"),
  };
}

module.exports = loadConfig;
