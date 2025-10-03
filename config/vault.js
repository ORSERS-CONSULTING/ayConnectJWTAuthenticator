// config/vault.js
const common  = require("oci-common");
const secrets = require("oci-secrets");

async function getSecret(secretOcid) {
  // Instance Principals (only works on OCI Compute/OKE)
  const provider = new common.InstancePrincipalsAuthenticationDetailsProvider();

  const client = new secrets.SecretsClient({
    authenticationDetailsProvider: provider,
  });

  // Set region explicitly (your tenancy is UAE East)
  client.regionId = process.env.OCI_REGION || "me-dubai-1";

  const resp = await client.getSecretBundle({ secretId: secretOcid });
  const b64  = resp.secretBundle.secretBundleContent.content;
  return Buffer.from(b64, "base64").toString("utf8");
}

module.exports = { getSecret };
