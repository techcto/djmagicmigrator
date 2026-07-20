import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { config } from "./config.js";

const secrets = new SecretsManagerClient({});

export async function destinationCredential(secretArn?: string): Promise<string> {
  secretArn ||= config.destinationSecretArn || undefined;
  if (secretArn) {
    const result = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const value = result.SecretString || (result.SecretBinary ? Buffer.from(result.SecretBinary).toString("utf8") : "");
    if (!value) throw new Error("Destination secret is empty");
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return String(parsed.token || parsed.apiToken || parsed.api_key || "");
    } catch {
      return value;
    }
  }
  if (!config.destinationToken) throw new Error("No destination bearer token is configured");
  return config.destinationToken;
}
