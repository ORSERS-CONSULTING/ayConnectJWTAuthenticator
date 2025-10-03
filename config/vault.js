const common = require("oci-common");
const secrets = require("oci-secrets");

async function getSecret(secretOcid) {
  // Create provider that uses Instance Principal
  const provider = new common.InstancePrincipalsAuthenticationDetailsProvider();
  const client = new secrets.SecretsClient({ authenticationDetailsProvider: provider });

  const secretBundle = await client.getSecretBundle({ secretId: secretOcid });
  const content = secretBundle.secretBundle.secretBundleContent.content;

  // OCI returns base64 encoded secrets
  return Buffer.from(content, "base64").toString("utf8");
}

module.exports = { getSecret };
