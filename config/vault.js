// config/vault.js
const { InstancePrincipalsAuthenticationDetailsProvider } = require("oci-common");
const { SecretsClient } = require("oci-secrets");

async function getSecret(secretOcid) {
  if (!secretOcid) throw new Error("secret OCID missing");

  if (typeof InstancePrincipalsAuthenticationDetailsProvider !== "function") {
    // Helpful diagnostics if PM2 uses wrong node_modules
    const cmn = require("oci-common");
    console.error("[vault] oci-common keys:", Object.keys(cmn || {}));
    throw new Error("InstancePrincipalsAuthenticationDetailsProvider not found from oci-common");
  }

  const provider = new InstancePrincipalsAuthenticationDetailsProvider();
  const client = new SecretsClient({ authenticationDetailsProvider: provider });
  client.regionId = process.env.OCI_REGION || "me-dubai-1";

  const { secretBundle } = await client.getSecretBundle({
    secretId: secretOcid,
    stage: "CURRENT",
  });

  const b64 = secretBundle.secretBundleContent.content;
  return Buffer.from(b64, "base64").toString("utf8");
}

module.exports = { getSecret };
