// config/vault.js
const { InstancePrincipalsAuthenticationDetailsProvider } = require("oci-common");
const { SecretsClient } = require("oci-secrets");

async function getSecret(secretOcid) {
  if (!secretOcid) throw new Error("secret OCID missing");

  // Auth: Instance Principals (for Compute VM in a Dynamic Group with policy)
  const provider = new InstancePrincipalsAuthenticationDetailsProvider();

  // Client
  const client = new SecretsClient({ authenticationDetailsProvider: provider });

  // Region (explicit is safer)
  client.regionId = process.env.OCI_REGION || "me-dubai-1";

  // Fetch CURRENT version (you can also use 'LATEST')
  const { secretBundle } = await client.getSecretBundle({
    secretId: secretOcid,
    stage: "CURRENT",
  });

  // Secrets come base64-encoded
  const b64 = secretBundle.secretBundleContent.content;
  return Buffer.from(b64, "base64").toString("utf8");
}

module.exports = { getSecret };
