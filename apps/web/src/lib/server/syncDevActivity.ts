import {
  githubOutcomeFromPayload,
  gitlabOutcomeFromPayload,
  isResolvedOutcome,
  type GithubPrPayload,
  type GitlabMrPayload,
  type PrOutcomeOrUnknown,
} from "@life-client/shared";
import type {
  DevPullRequest,
  IntegrationProvider,
  PrCheckStatus,
  PrEvent,
  PrReviewDecision,
  PrState,
  TaskPrMeta,
} from "@life-client/shared";
import { adminDb } from "./admin";
import { forEachUser, type FanOutResult } from "./fanOut";
import { setIntegrationStatus } from "./integrationStatus";
import { clientIdFor, clientSecretFor, refreshAccessToken } from "./providers";
import { allConnectedUids, getTokens, storeTokens, type StoredTokens } from "./tokens";

/** Author logins that mean "this PR is an automated dependency bump", so the Tasks
 * list can colour it apart from real code review work. Matched against the bare
 * login and the `login[bot]` form. */
const BOT_LOGINS = /^(dependabot|dependabot-preview|renovate|renovate-bot|snyk-bot|github-actions|mend-bolt-for-github|greenkeeper)(\[bot\])?$/i;
const DEPENDENCY_LABELS = new Set(["dependencies", "dependency", "dependency-update", "renovate"]);

function looksAutomated(login: string, isBotType: boolean, labels: string[]): boolean {
  if (isBotType || BOT_LOGINS.test(login)) return true;
  return labels.some((l) => DEPENDENCY_LABELS.has(l.toLowerCase()));
}

// ---------------------------------------------------------------------------
// GitHub — GraphQL. Two searches surface "my" work (authored, or my review is
// requested); a third pass walks every non-archived repo I own or belong to
// (needs read:org) and pulls its open PRs, so Tasks mirrors the whole team's
// board. One call gets draft/merged/CI/author/review per PR.
// ---------------------------------------------------------------------------

interface GithubPrNode {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  state: "OPEN" | "CLOSED" | "MERGED";
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  baseRefName: string;
  headRefName: string;
  repository: { nameWithOwner: string };
  author: { login: string; __typename: string } | null;
  labels: { nodes: { name: string }[] };
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
}

/** Field selection shared by both queries. `repository` comes back on search
 * results directly; the repo walk attaches it while flattening. */
const GITHUB_PR_FIELDS = `
  number title url isDraft state createdAt updatedAt additions deletions reviewDecision
  baseRefName headRefName
  repository { nameWithOwner }
  author { login __typename }
  labels(first: 20) { nodes { name } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
`;

const GITHUB_SEARCH_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest { ${GITHUB_PR_FIELDS} } }
    }
  }
`;

const GITHUB_REPOS_QUERY = `
  query {
    viewer {
      login
      repositories(
        first: 100
        affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        nodes {
          nameWithOwner
          isArchived
          pullRequests(states: OPEN, first: 30, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes { ${GITHUB_PR_FIELDS} }
          }
        }
      }
    }
  }
`;

function mapGithubChecks(state: string | undefined): PrCheckStatus {
  switch (state) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return "none";
  }
}

function mapGithubReview(decision: GithubPrNode["reviewDecision"]): PrReviewDecision | undefined {
  switch (decision) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes_requested";
    case "REVIEW_REQUIRED":
      return "review_required";
    default:
      return undefined;
  }
}

async function githubGraphql<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "life-client",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`GitHub GraphQL failed: ${response.status} ${await response.text()}`);
  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`GitHub GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
  if (!json.data) throw new Error("GitHub GraphQL returned no data");
  return json.data;
}

// A `search` on ISSUE type can also return Issues — those come back as `{}`.
function isPrNode(n: unknown): n is GithubPrNode {
  return typeof (n as GithubPrNode)?.number === "number";
}

async function searchGithubPRs(accessToken: string, q: string): Promise<GithubPrNode[]> {
  const data = await githubGraphql<{ search: { nodes: (GithubPrNode | Record<string, never>)[] } }>(
    accessToken,
    GITHUB_SEARCH_QUERY,
    { q: `${q} archived:false` },
  );
  return data.search.nodes.filter(isPrNode);
}

async function fetchViewerRepoPRs(accessToken: string): Promise<{ viewerLogin: string; prs: GithubPrNode[] }> {
  const data = await githubGraphql<{
    viewer: {
      login: string;
      repositories: {
        nodes: { nameWithOwner: string; isArchived: boolean; pullRequests: { nodes: GithubPrNode[] } }[];
      };
    };
  }>(accessToken, GITHUB_REPOS_QUERY);

  const prs: GithubPrNode[] = [];
  for (const repo of data.viewer.repositories.nodes) {
    if (repo.isArchived) continue;
    for (const pr of repo.pullRequests.nodes) {
      prs.push({ ...pr, repository: { nameWithOwner: repo.nameWithOwner } });
    }
  }
  return { viewerLogin: data.viewer.login, prs };
}

function toGithubPR(node: GithubPrNode, isAuthor: boolean, isReviewRequested: boolean): DevPullRequest {
  const login = node.author?.login ?? "unknown";
  const labels = node.labels.nodes.map((l) => l.name);
  const state: PrState = node.state === "MERGED" ? "merged" : node.state === "CLOSED" ? "closed" : node.isDraft ? "draft" : "open";
  return {
    provider: "github",
    repo: node.repository.nameWithOwner,
    number: node.number,
    title: node.title,
    url: node.url,
    isAuthor,
    isReviewRequested,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    state,
    checks: mapGithubChecks(node.commits.nodes[0]?.commit.statusCheckRollup?.state),
    author: login,
    isBot: looksAutomated(login, node.author?.__typename === "Bot", labels),
    reviewDecision: mapGithubReview(node.reviewDecision),
    additions: node.additions,
    deletions: node.deletions,
    labels,
    baseRef: node.baseRefName,
    headRef: node.headRefName,
  };
}

async function fetchGithubPRs(accessToken: string): Promise<DevPullRequest[]> {
  const [authored, reviewRequested, repoWalk] = await Promise.all([
    searchGithubPRs(accessToken, "is:pr is:open author:@me"),
    searchGithubPRs(accessToken, "is:pr is:open review-requested:@me"),
    fetchViewerRepoPRs(accessToken),
  ]);

  const byUrl = new Map<string, DevPullRequest>();
  // Team board first: every open PR in a repo I own or belong to.
  for (const node of repoWalk.prs) {
    byUrl.set(node.url, toGithubPR(node, node.author?.login === repoWalk.viewerLogin, false));
  }
  // Then let the personal searches assert the "mine" flags — and add any PR the
  // repo walk's top-100-repos / first-30-PRs caps didn't reach.
  for (const node of authored) {
    const existing = byUrl.get(node.url);
    byUrl.set(node.url, existing ? { ...existing, isAuthor: true } : toGithubPR(node, true, false));
  }
  for (const node of reviewRequested) {
    const existing = byUrl.get(node.url);
    byUrl.set(node.url, existing ? { ...existing, isReviewRequested: true } : toGithubPR(node, false, true));
  }
  return [...byUrl.values()];
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

// ---------------------------------------------------------------------------
// GitLab — REST list for authored + assigned MRs, then one call per MR for the
// head pipeline status.
// ---------------------------------------------------------------------------

interface GitlabMergeRequest {
  iid: number;
  title: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  state: "opened" | "closed" | "merged" | "locked";
  draft?: boolean;
  work_in_progress?: boolean;
  author: { username: string };
  references: { full: string };
  labels?: string[];
  source_branch?: string;
  target_branch?: string;
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

function mapGitlabChecks(status: string | undefined): PrCheckStatus {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "failure";
    case "created":
    case "waiting_for_resource":
    case "preparing":
    case "pending":
    case "running":
    case "scheduled":
      return "pending";
    default:
      return "none"; // canceled / skipped / manual / no pipeline
  }
}

async function fetchGitlabMRList(accessToken: string, scope: string): Promise<GitlabMergeRequest[]> {
  const response = await fetch(
    `https://gitlab.com/api/v4/merge_requests?scope=${scope}&state=opened&per_page=50&with_labels_details=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`GitLab MR fetch (${scope}) failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as GitlabMergeRequest[];
}

/** GitLab's list endpoint doesn't include the pipeline, so pull the head pipeline
 * status per MR. Best-effort — a failure here just leaves checks as "none". */
async function fetchGitlabPipeline(accessToken: string, projectPath: string, iid: number): Promise<PrCheckStatus> {
  try {
    const response = await fetch(
      `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectPath)}/merge_requests/${iid}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) return "none";
    const detail = (await response.json()) as { head_pipeline?: { status?: string } | null };
    return mapGitlabChecks(detail.head_pipeline?.status);
  } catch {
    return "none";
  }
}

async function fetchGitlabMRs(accessToken: string): Promise<DevPullRequest[]> {
  const [authored, assigned] = await Promise.all([
    fetchGitlabMRList(accessToken, "created_by_me"),
    fetchGitlabMRList(accessToken, "assigned_to_me"),
  ]);

  const byUrl = new Map<string, GitlabMergeRequest & { isAuthor: boolean; isReviewRequested: boolean }>();
  for (const mr of authored) byUrl.set(mr.web_url, { ...mr, isAuthor: true, isReviewRequested: false });
  for (const mr of assigned) {
    const existing = byUrl.get(mr.web_url);
    byUrl.set(mr.web_url, existing ? { ...existing, isReviewRequested: true } : { ...mr, isAuthor: false, isReviewRequested: true });
  }

  return Promise.all(
    [...byUrl.values()].map(async (mr) => {
      const projectPath = mr.references.full.split("!")[0] ?? "";
      const labels = mr.labels ?? [];
      const isDraft = mr.draft ?? mr.work_in_progress ?? /^\s*(draft|wip):/i.test(mr.title);
      const state: PrState =
        mr.state === "merged" ? "merged" : mr.state === "closed" || mr.state === "locked" ? "closed" : isDraft ? "draft" : "open";
      return {
        provider: "gitlab" as const,
        repo: projectPath,
        number: mr.iid,
        title: mr.title,
        url: mr.web_url,
        isAuthor: mr.isAuthor,
        isReviewRequested: mr.isReviewRequested,
        createdAt: mr.created_at,
        updatedAt: mr.updated_at,
        state,
        checks: await fetchGitlabPipeline(accessToken, projectPath, mr.iid),
        author: mr.author.username,
        isBot: looksAutomated(mr.author.username, false, labels),
        labels,
        baseRef: mr.target_branch,
        headRef: mr.source_branch,
      } satisfies DevPullRequest;
    }),
  );
}

async function fetchGitlabMergedCount(accessToken: string): Promise<number> {
  // GitLab's merge_requests `scope` only accepts created_by_me/assigned_to_me/all
  // — there's no "authored_by_me" (that's a GitHub-ism), which is why this was
  // failing with a 400.
  const response = await fetch(
    "https://gitlab.com/api/v4/merge_requests?scope=created_by_me&state=merged&per_page=1",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`GitLab merged-MR count failed: ${response.status}`);
  return Number(response.headers.get("x-total") ?? "0");
}

function taskDocId(provider: "github" | "gitlab", pr: DevPullRequest): string {
  return `${provider}_${pr.repo.replace(/[^a-zA-Z0-9_-]/g, "-")}_${pr.number}`;
}

/** `owner/repo#123` -> `["owner/repo", 123]`. */
function parseSourceRef(ref: string | undefined): { repo: string; number: number } | null {
  const m = /^(.+)#(\d+)$/.exec(ref ?? "");
  return m ? { repo: m[1]!, number: Number(m[2]) } : null;
}

/**
 * Both resolvers return `null` on any non-OK response rather than assuming the
 * PR is gone. A 403 rate-limit or a 502 tells us nothing about the PR, and the
 * caller treats `null` as "skip, ask again next run". The actual state mapping
 * lives in @life-client/shared/prOutcome so it can be unit-tested.
 */
async function resolveGithubOutcome(
  token: string,
  repo: string,
  number: number,
): Promise<PrOutcomeOrUnknown> {
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}`, {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json", "User-Agent": "life-client" },
  });
  if (!res.ok) return null;
  return githubOutcomeFromPayload((await res.json()) as GithubPrPayload);
}

async function resolveGitlabOutcome(
  token: string,
  projectPath: string,
  iid: number,
): Promise<PrOutcomeOrUnknown> {
  const res = await fetch(
    `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectPath)}/merge_requests/${iid}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  return gitlabOutcomeFromPayload((await res.json()) as GitlabMrPayload);
}

/** Denormalised PR snapshot stored on the task. All keys are always written (null
 * rather than omitted) so Firestore's deep merge on re-sync can't leave a stale
 * sub-field behind. */
function buildPrMeta(pr: DevPullRequest): TaskPrMeta {
  return {
    state: pr.state,
    checks: pr.checks,
    isBot: pr.isBot,
    mine: pr.isAuthor || pr.isReviewRequested,
    author: pr.author,
    reviewDecision: pr.reviewDecision ?? null,
    additions: pr.additions ?? null,
    deletions: pr.deletions ?? null,
    baseRef: pr.baseRef ?? null,
    headRef: pr.headRef ?? null,
    prCreatedAt: pr.createdAt ?? null,
    prUpdatedAt: pr.updatedAt ?? null,
    resolvedAt: null,
  };
}

/** Events to append given the previous vs. next snapshot of a PR. */
function diffPrEvents(prev: TaskPrMeta | undefined, next: TaskPrMeta, at: string): PrEvent[] {
  if (!prev) {
    const seed: PrEvent[] = [{ at, kind: "state", detail: next.state === "draft" ? "opened (draft)" : "opened" }];
    if (next.checks !== "none") seed.push({ at, kind: "checks", detail: `ci: ${next.checks}` });
    if (next.reviewDecision) seed.push({ at, kind: "review", detail: next.reviewDecision });
    return seed;
  }
  const events: PrEvent[] = [];
  if (prev.state !== next.state) events.push({ at, kind: "state", detail: next.state });
  if (prev.checks !== next.checks && next.checks !== "none")
    events.push({ at, kind: "checks", detail: `ci: ${next.checks}` });
  if ((prev.reviewDecision ?? null) !== (next.reviewDecision ?? null) && next.reviewDecision)
    events.push({ at, kind: "review", detail: next.reviewDecision });
  return events;
}

function appendEvents(existing: unknown, added: PrEvent[]): PrEvent[] {
  const prior = Array.isArray(existing) ? (existing as PrEvent[]) : [];
  return [...prior, ...added].slice(-25);
}

/**
 * Mirrors currently-open PRs/MRs into `users/{uid}/tasks` (source: "github"/"gitlab"),
 * using a deterministic doc ID per PR so re-syncing updates the same task rather than
 * duplicating it. A synced task no longer in the open set is resolved to
 * merged/closed (one API call via `resolveOutcome`) and marked "done" — its category
 * XP still counts and user edits (priority/category/difficulty) aren't touched. Each
 * run also appends any observed state/CI/review changes to `prEvents`.
 */
async function syncTasksFromPullRequests(
  uid: string,
  provider: "github" | "gitlab",
  pullRequests: DevPullRequest[],
  resolveOutcome: (repo: string, number: number) => Promise<PrOutcomeOrUnknown>,
): Promise<void> {
  const tasksRef = adminDb.collection("users").doc(uid).collection("tasks");
  const existingSnap = await tasksRef.where("source", "==", provider).get();
  const desiredIds = new Set(pullRequests.map((pr) => taskDocId(provider, pr)));
  const nowIso = new Date().toISOString();
  const prevById = new Map(existingSnap.docs.map((d) => [d.id, d.data()]));
  const batch = adminDb.batch();

  // PRs missing from the page of open PRs we fetched. That is NOT the same as
  // "no longer open" — the fetch is capped — so each one is confirmed with the
  // provider before anything is marked done.
  for (const doc of existingSnap.docs) {
    const data = doc.data();
    const prevMeta = data.prMeta as TaskPrMeta | undefined;
    const alreadyResolved = prevMeta?.state === "merged" || prevMeta?.state === "closed";
    if (desiredIds.has(doc.id) || alreadyResolved) continue;

    const parsed = parseSourceRef(data.sourceRef as string | undefined);
    // No sourceRef means there is no way to ask the provider. Previously this
    // marked the task done regardless; now we leave it alone, because "we
    // cannot check" is not evidence that the PR closed.
    const outcome = parsed ? await resolveOutcome(parsed.repo, parsed.number).catch(() => null) : null;

    // Still open upstream (it just fell outside the cap), or we could not find
    // out. Either way, leave the task as it is and re-check on the next run.
    if (!isResolvedOutcome(outcome)) continue;

    // No snapshot to fold the outcome into — record the status only.
    if (!prevMeta) {
      if (data.status !== "done") batch.update(doc.ref, { status: "done", updatedAt: nowIso });
      continue;
    }

    const nextMeta: TaskPrMeta = {
      ...prevMeta,
      state: outcome.state,
      resolvedAt: outcome.resolvedAt ?? nowIso,
    };
    batch.set(
      doc.ref,
      {
        status: "done",
        prMeta: nextMeta,
        prEvents: appendEvents(data.prEvents, [{ at: nowIso, kind: "state", detail: outcome.state }]),
        updatedAt: nowIso,
      },
      { merge: true },
    );
  }

  const existingIds = new Set(existingSnap.docs.map((d) => d.id));
  for (const pr of pullRequests) {
    const id = taskDocId(provider, pr);
    const ref = tasksRef.doc(id);
    const nextMeta = buildPrMeta(pr);
    if (existingIds.has(id)) {
      const prev = prevById.get(id);
      const prevMeta = prev?.prMeta as TaskPrMeta | undefined;
      // This PR is open right now, yet the task says it was merged or closed.
      // That can only be a previous run resolving it wrongly (the old code
      // closed anything it could not see, including rate-limited lookups), or
      // a genuinely reopened PR. Either way the task should be open again —
      // which also repairs the tasks the old behaviour already corrupted, with
      // no separate migration.
      const wasWronglyResolved = prevMeta?.state === "merged" || prevMeta?.state === "closed";
      batch.set(
        ref,
        {
          title: pr.title,
          sourceUrl: pr.url,
          prMeta: nextMeta,
          prEvents: appendEvents(prev?.prEvents, diffPrEvents(prevMeta, nextMeta, nowIso)),
          updatedAt: nowIso,
          ...(wasWronglyResolved && prev?.status === "done"
            ? { status: "todo", completedAt: null }
            : {}),
        },
        { merge: true },
      );
    } else {
      batch.set(ref, {
        title: pr.title,
        status: "todo",
        // Review requests are the real work; my own PRs are medium; teammates'
        // PRs (mirrored for the board view) and bot bumps are low / easy so they
        // don't dominate the list or inflate category XP much when they close.
        priority: pr.isReviewRequested ? "high" : pr.isAuthor && !pr.isBot ? "medium" : "low",
        difficulty: pr.isAuthor && !pr.isBot ? "medium" : "easy",
        category: "code",
        source: provider,
        sourceRef: `${pr.repo}#${pr.number}`,
        sourceUrl: pr.url,
        prMeta: nextMeta,
        prEvents: diffPrEvents(undefined, nextMeta, nowIso),
        tags: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  }

  await batch.commit();
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

    const resolveOutcome = (repo: string, number: number) =>
      provider === "github"
        ? resolveGithubOutcome(freshAccessToken, repo, number)
        : resolveGitlabOutcome(freshAccessToken, repo, number);
    await syncTasksFromPullRequests(uid, provider, pullRequests, resolveOutcome);

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

export async function syncAllDevActivity(): Promise<FanOutResult> {
  const [githubUids, gitlabUids] = await Promise.all([
    allConnectedUids("github"),
    allConnectedUids("gitlab"),
  ]);
  const [github, gitlab] = await Promise.all([
    forEachUser("github", githubUids, syncGithubForUser),
    forEachUser("gitlab", gitlabUids, syncGitlabForUser),
  ]);
  return {
    ok: github.ok + gitlab.ok,
    failed: github.failed + gitlab.failed,
    errors: [...github.errors, ...gitlab.errors],
  };
}
