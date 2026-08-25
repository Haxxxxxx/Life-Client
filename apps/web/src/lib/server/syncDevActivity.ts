import type { IntegrationProvider } from "@life-client/shared";
import { adminDb } from "./admin";
import { setIntegrationStatus } from "./integrationStatus";
import { clientIdFor, clientSecretFor, refreshAccessToken } from "./providers";
import { allConnectedUids, getTokens, storeTokens, type StoredTokens } from "./tokens";

interface DevPullRequest {
  provider: "github" | "gitlab";
  repo: string;
  number: number;
  title: string;
  url: string;
  isReviewRequested: boolean;
  isAuthor: boolean;
  updatedAt: string;
}

interface GithubSearchItem {
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  updated_at: string;
  pull_request?: unknown;
}

async function fetchGithubPRs(accessToken: string): Promise<DevPullRequest[]> {
  const headers = {
    Authorization: `token ${accessToken}`,
    Accept: "application/vnd.github+json",
  };

  const [authored, reviewRequested] = await Promise.all([
    fetch("https://api.github.com/search/issues?q=is:pr+is:open+author:@me", { headers }),
    fetch("https://api.github.com/search/issues?q=is:pr+is:open+review-requested:@me", { headers }),
  ]);

  if (!authored.ok || !reviewRequested.ok) {
    throw new Error(`GitHub PR search failed: ${authored.status}/${reviewRequested.status}`);
  }

  const authoredItems = ((await authored.json()) as { items: GithubSearchItem[] }).items;
  const reviewItems = ((await reviewRequested.json()) as { items: GithubSearchItem[] }).items;

  const byNumberUrl = new Map<string, DevPullRequest>();
  for (const item of authoredItems) {
    byNumberUrl.set(item.html_url, toGithubPR(item, true, false));
  }
  for (const item of reviewItems) {
    const existing = byNumberUrl.get(item.html_url);
    byNumberUrl.set(item.html_url, existing ? { ...existing, isReviewRequested: true } : toGithubPR(item, false, true));
  }
  return [...byNumberUrl.values()];
}

async function fetchGithubMergedCount(accessToken: string): Promise<number> {
  const response = await fetch(
    "https://api.github.com/search/issues?q=is:pr+is:merged+author:@me&per_page=1",
    { headers: { Authorization: `token ${accessToken}`, Accept: "application/vnd.github+json" } },
  );
  if (!response.ok) throw new Error(`GitHub merged-PR count failed: ${response.status}`);
  const data = (await response.json()) as { total_count: number };
  return data.total_count;
}

function toGithubPR(item: GithubSearchItem, isAuthor: boolean, isReviewRequested: boolean): DevPullRequest {
  const repo = item.repository_url.replace("https://api.github.com/repos/", "");
  return {
    provider: "github",
    repo,
    number: item.number,
    title: item.title,
    url: item.html_url,
    isAuthor,
    isReviewRequested,
    updatedAt: item.updated_at,
  };
}

interface GitlabMergeRequest {
  iid: number;
  title: string;
  web_url: string;
  updated_at: string;
  author: { username: string };
  references: { full: string };
}

async function ensureFreshGitlabToken(uid: string, tokens: StoredTokens): Promise<StoredTokens> {
  const isExpired = tokens.expiresAt !== undefined && tokens.expiresAt < Date.now() + 60_000;
  if (!isExpired || !tokens.refreshToken) return tokens;

  const refreshed = await refreshAccessToken("gitlab", {
    clientId: clientIdFor("gitlab"),
    clientSecret: clientSecretFor("gitlab"),
    refreshToken: tokens.refreshToken,
  });
  const next: StoredTokens = {
    accessToken: refreshed.access_token as string,
    refreshToken: (refreshed.refresh_token as string | undefined) ?? tokens.refreshToken,
    expiresAt: Date.now() + (refreshed.expires_in as number) * 1000,
  };
  await storeTokens(uid, "gitlab", next);
  return next;
}

async function fetchGitlabMRs(accessToken: string): Promise<DevPullRequest[]> {
  const response = await fetch(
    "https://gitlab.com/api/v4/merge_requests?scope=assigned_to_me&state=opened&per_page=50",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`GitLab MR fetch failed: ${response.status} ${await response.text()}`);
  const items = (await response.json()) as GitlabMergeRequest[];
  return items.map((mr) => ({
    provider: "gitlab" as const,
    repo: mr.references.full.split("!")[0] ?? "",
    number: mr.iid,
    title: mr.title,
    url: mr.web_url,
    isAuthor: false,
    isReviewRequested: true,
    updatedAt: mr.updated_at,
  }));
}

async function fetchGitlabMergedCount(accessToken: string): Promise<number> {
  const response = await fetch(
    "https://gitlab.com/api/v4/merge_requests?scope=authored_by_me&state=merged&per_page=1",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`GitLab merged-MR count failed: ${response.status}`);
  return Number(response.headers.get("x-total") ?? "0");
}

async function syncFor(uid: string, provider: Extract<IntegrationProvider, "github" | "gitlab">): Promise<void> {
  const tokens = await getTokens(uid, provider);
  if (!tokens) return;

  try {
    const freshAccessToken =
      provider === "github" ? tokens.accessToken : (await ensureFreshGitlabToken(uid, tokens)).accessToken;

    const [pullRequests, totalMergedCount] =
      provider === "github"
        ? await Promise.all([fetchGithubPRs(freshAccessToken), fetchGithubMergedCount(freshAccessToken)])
        : await Promise.all([fetchGitlabMRs(freshAccessToken), fetchGitlabMergedCount(freshAccessToken)]);

    await adminDb
      .collection("users")
      .doc(uid)
      .collection("devActivity")
      .doc(provider)
      .set(
        {
          provider,
          openPullRequests: pullRequests,
          totalMergedCount,
          lastSyncAt: new Date().toISOString(),
        },
        { merge: true },
      );
    await setIntegrationStatus(uid, provider, { status: "connected", lastSyncAt: new Date().toISOString() });
  } catch (error) {
    console.error(`syncDevActivity(${uid}, ${provider}) failed`, error);
    await setIntegrationStatus(uid, provider, {
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function syncGithubForUser(uid: string): Promise<void> {
  await syncFor(uid, "github");
}

export async function syncGitlabForUser(uid: string): Promise<void> {
  await syncFor(uid, "gitlab");
}

export async function syncAllDevActivity(): Promise<void> {
  const [githubUids, gitlabUids] = await Promise.all([
    allConnectedUids("github"),
    allConnectedUids("gitlab"),
  ]);
  await Promise.all([
    ...githubUids.map((uid) => syncGithubForUser(uid)),
    ...gitlabUids.map((uid) => syncGitlabForUser(uid)),
  ]);
}
