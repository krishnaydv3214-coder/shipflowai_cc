import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";

// Helper to check if credentials are set
export function hasGithubCredentials(): boolean {
  return !!(
    process.env.GITHUB_APP_ID &&
    process.env.GITHUB_PRIVATE_KEY &&
    process.env.GITHUB_WEBHOOK_SECRET
  );
}

// Retrieve private key handling raw or base64 formats
function getPrivateKey(): string {
  const rawKey = process.env.GITHUB_PRIVATE_KEY || "";
  if (rawKey.includes("-----BEGIN")) {
    return rawKey;
  }
  // Fallback to base64 decoding
  try {
    return Buffer.from(rawKey, "base64").toString("utf-8");
  } catch {
    return rawKey;
  }
}

// Returns authenticated GitHub App Client
export function getGitHubClient(installationId: string): Octokit {
  if (!hasGithubCredentials()) {
    // Return a dummy mocked client when running locally without tokens
    console.warn("GitHub credentials missing. Initializing mock Octokit client.");
    return new Octokit({
      auth: "mock-token",
    });
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID!,
      privateKey: getPrivateKey(),
      installationId: installationId,
    },
  });
}
