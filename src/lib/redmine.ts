import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import type { RedmineIssue, RedmineActivity, RedmineTimeEntry, WorkSession, IssueSearchResult } from "@/types";
import i18n from "@/i18n";
import { useSettingsStore } from "@/store";

interface RedmineIssuesResponse {
  issues: RedmineIssue[];
}

interface RedmineSingleIssueResponse {
  issue: RedmineIssue;
}

const SEARCH_REQUEST_LIMIT = 50;
const SEARCH_RESULT_LIMIT = 30;
const COMMENT_SEARCH_PAGE_SIZE = 100;
const COMMENT_SEARCH_MAX_SCANNED_ENTRIES = 500;
const COMMENT_SEARCH_MAX_MATCHED_ISSUES = 80;
const LOCAL_ENTRY_TIMES_STORAGE_KEY = "clepsydre-entry-times-by-domain-v1";

interface PersistedEntryTimes {
  startedAt: string;
  stoppedAt: string;
  updatedAt: string;
  issue?: RedmineIssue;
  loggedIssue?: RedmineIssue;
}

interface PersistEntryMetadata {
  issue?: RedmineIssue | null;
  loggedIssue?: RedmineIssue | null;
}

type PersistedEntryTimesByDomain = Record<string, Record<string, PersistedEntryTimes>>;

function normalizeRedmineDomainKey(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

function isValidTimeHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function readPersistedEntryTimes(): PersistedEntryTimesByDomain {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(LOCAL_ENTRY_TIMES_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    return parsed as PersistedEntryTimesByDomain;
  } catch {
    return {};
  }
}

function writePersistedEntryTimes(data: PersistedEntryTimesByDomain): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LOCAL_ENTRY_TIMES_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore persistence failures and keep app behavior unchanged.
  }
}

function getPersistedTimesForEntry(domainUrl: string, entryId: number): PersistedEntryTimes | null {
  const domainKey = normalizeRedmineDomainKey(domainUrl);
  const all = readPersistedEntryTimes();
  const fromDomain = all[domainKey]?.[String(entryId)];

  if (!fromDomain) return null;
  if (!isValidTimeHHMM(fromDomain.startedAt) || !isValidTimeHHMM(fromDomain.stoppedAt)) return null;

  return fromDomain;
}

function fallbackTimesFromCreatedAt(entry: RedmineTimeEntry): { startedAt: string; stoppedAt: string } {
  const created = new Date(entry.created_on);
  const durationMinutes = Math.round(entry.hours * 60);
  const endMinutes = created.getHours() * 60 + created.getMinutes();
  const startMinutes = endMinutes - durationMinutes;

  const startH = Math.floor(Math.max(0, startMinutes) / 60);
  const startM = Math.max(0, startMinutes) % 60;
  const endH = Math.floor(endMinutes / 60) % 24;
  const endM = endMinutes % 60;

  return {
    startedAt: `${startH.toString().padStart(2, "0")}:${startM.toString().padStart(2, "0")}`,
    stoppedAt: `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`,
  };
}

function persistEntryTimesForDomain(
  domainUrl: string,
  entryId: number,
  startedAt: string,
  stoppedAt: string,
  metadata?: PersistEntryMetadata
): void {
  if (!isValidTimeHHMM(startedAt) || !isValidTimeHHMM(stoppedAt)) return;

  const domainKey = normalizeRedmineDomainKey(domainUrl);
  const all = readPersistedEntryTimes();

  all[domainKey] = {
    ...(all[domainKey] ?? {}),
    [String(entryId)]: {
      startedAt,
      stoppedAt,
      updatedAt: new Date().toISOString(),
      ...(metadata?.issue ? { issue: metadata.issue } : {}),
      ...(metadata?.loggedIssue ? { loggedIssue: metadata.loggedIssue } : {}),
    },
  };

  writePersistedEntryTimes(all);
}

export async function persistEntryTimesForCurrentDomain(
  entryId: number,
  startedAt: string,
  stoppedAt: string,
  metadata?: PersistEntryMetadata
): Promise<void> {
  const { url } = await getCredentials();
  persistEntryTimesForDomain(url, entryId, startedAt, stoppedAt, metadata);
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchIssuesBySubject(url: string, apiKey: string, subjectQuery: string): Promise<RedmineIssue[]> {
  const params = new URLSearchParams({
    subject: `~${subjectQuery}`,
    limit: String(SEARCH_REQUEST_LIMIT),
    status_id: "*",
    sort: "updated_on:desc",
  });

  const resp = await fetch(`${url}/issues.json?${params}`, {
    headers: { "X-Redmine-API-Key": apiKey },
    danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(i18n.t("redmine.apiError", { status: resp.status, body }));
  }

  const data = (await resp.json()) as RedmineIssuesResponse;
  return data.issues;
}

function scoreIssue(issue: RedmineIssue, normalizedQuery: string, terms: string[]): number {
  const subject = normalizeSearchText(issue.subject ?? "");
  const project = normalizeSearchText(issue.project?.name ?? "");
  const issueId = String(issue.id);
  const haystack = `${issueId} ${project} ${subject}`;

  let score = 0;

  if (issueId === normalizedQuery) score += 500;
  if (subject.includes(normalizedQuery)) score += 220;
  if (project.includes(normalizedQuery)) score += 150;

  const termsInSubject = terms.filter((term) => subject.includes(term)).length;
  const termsInProject = terms.filter((term) => project.includes(term)).length;
  const totalTermMatches = terms.filter((term) => haystack.includes(term)).length;

  if (terms.length > 0 && totalTermMatches === terms.length) {
    score += 180;
  }

  score += termsInSubject * 35;
  score += termsInProject * 25;

  return score;
}

function scoreCommentMatch(comment: string, normalizedQuery: string, terms: string[]): number {
  const normalizedComment = normalizeSearchText(comment);
  if (!normalizedComment) return 0;

  let score = 0;
  if (normalizedComment.includes(normalizedQuery)) score += 180;

  const matchedTerms = terms.filter((term) => normalizedComment.includes(term)).length;
  if (terms.length > 0 && matchedTerms === terms.length) {
    score += 120;
  }
  score += matchedTerms * 30;

  return score;
}

function extractMatchedCommentSnippet(comment: string, query: string, terms: string[]): string | null {
  const trimmed = comment.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  const loweredQuery = query.trim().toLowerCase();
  const loweredTerms = terms.map((term) => term.toLowerCase()).filter(Boolean);

  let startIndex = -1;
  let matchLength = 0;

  if (loweredQuery.length >= 2) {
    startIndex = lowered.indexOf(loweredQuery);
    matchLength = loweredQuery.length;
  }

  if (startIndex === -1) {
    for (const term of loweredTerms) {
      if (term.length < 2) continue;
      const idx = lowered.indexOf(term);
      if (idx >= 0) {
        startIndex = idx;
        matchLength = term.length;
        break;
      }
    }
  }

  if (startIndex === -1) return null;

  const contextRadius = 36;
  const from = Math.max(0, startIndex - contextRadius);
  const to = Math.min(trimmed.length, startIndex + matchLength + contextRadius);
  const snippet = trimmed.slice(from, to).replace(/\s+/g, " ").trim();

  return `${from > 0 ? "..." : ""}${snippet}${to < trimmed.length ? "..." : ""}`;
}

interface CommentSearchMatch {
  score: number;
  snippet?: string;
  fullComment?: string;
}

async function searchIssueScoresByTimeEntryComments(
  url: string,
  apiKey: string,
  query: string,
  normalizedQuery: string,
  terms: string[]
): Promise<Map<number, CommentSearchMatch>> {
  const matches = new Map<number, CommentSearchMatch>();
  let offset = 0;
  let scannedEntries = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (offset < totalCount && scannedEntries < COMMENT_SEARCH_MAX_SCANNED_ENTRIES) {
    const params = new URLSearchParams({
      user_id: "me",
      limit: String(COMMENT_SEARCH_PAGE_SIZE),
      offset: String(offset),
      sort: "spent_on:desc",
    });

    const resp = await fetch(`${url}/time_entries.json?${params}`, {
      headers: { "X-Redmine-API-Key": apiKey },
      danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
    });

    if (!resp.ok) {
      throw new Error(i18n.t("redmine.fetchEntriesFailed", { status: resp.status }));
    }

    const data = (await resp.json()) as {
      time_entries: RedmineTimeEntry[];
      total_count: number;
    };

    totalCount = data.total_count ?? data.time_entries.length;
    scannedEntries += data.time_entries.length;
    offset += COMMENT_SEARCH_PAGE_SIZE;

    for (const entry of data.time_entries) {
      const commentScore = scoreCommentMatch(entry.comments ?? "", normalizedQuery, terms);
      if (commentScore <= 0) continue;

      const current = matches.get(entry.issue.id);
      if (!current || commentScore > current.score) {
        matches.set(entry.issue.id, {
          score: commentScore,
          snippet: extractMatchedCommentSnippet(entry.comments ?? "", query, terms) ?? undefined,
          fullComment: entry.comments?.trim() || undefined,
        });
      }
    }

    if (matches.size >= COMMENT_SEARCH_MAX_MATCHED_ISSUES) {
      break;
    }
  }

  return matches;
}

async function getCredentials(): Promise<{ url: string; apiKey: string }> {
  const { redmine_url, api_key } = useSettingsStore.getState().settings;
  let apiKey = api_key;
  if (!apiKey) {
    apiKey = await invoke<string>("get_api_key");
    if (apiKey) {
      useSettingsStore.getState().setSettings({ api_key: apiKey });
    }
  }

  if (!redmine_url || !apiKey) {
    throw new Error(i18n.t("redmine.credentialsMissing"));
  }

  return { url: redmine_url.replace(/\/+$/, ""), apiKey };
}

export async function searchIssues(query: string): Promise<IssueSearchResult[]> {
  const { url, apiKey } = await getCredentials();
  const searchInTimeComments = useSettingsStore.getState().settings.search_in_time_comments;
  const trimmed = query.trim().replace(/^#/, "");

  if (!trimmed) return [];

  // If numeric, try fetching the exact issue by ID
  if (/^\d+$/.test(trimmed)) {
    try {
      const resp = await fetch(`${url}/issues/${trimmed}.json`, {
        headers: { "X-Redmine-API-Key": apiKey },
        danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
      });
      if (resp.ok) {
        const data = (await resp.json()) as RedmineSingleIssueResponse;
        return [{ issue: data.issue }];
      }
    } catch {
      // fall through to text search
    }
  }

  const normalizedQuery = normalizeSearchText(trimmed);
  const terms = normalizedQuery.split(" ").filter(Boolean);

  const subjectQueries = Array.from(
    new Set([
      trimmed,
      ...terms.filter((term) => term.length >= 2),
    ])
  ).slice(0, 5);

  const settled = await Promise.allSettled(
    subjectQueries.map((subjectQuery) => fetchIssuesBySubject(url, apiKey, subjectQuery))
  );

  const mergedById = new Map<number, RedmineIssue>();
  const commentMatchByIssueId = new Map<number, CommentSearchMatch>();
  let firstError: string | null = null;

  for (const result of settled) {
    if (result.status === "fulfilled") {
      for (const issue of result.value) {
        if (!mergedById.has(issue.id)) {
          mergedById.set(issue.id, issue);
        }
      }
      continue;
    }

    if (!firstError) {
      firstError = result.reason instanceof Error ? result.reason.message : String(result.reason);
    }
  }

  if (searchInTimeComments) {
    try {
      const commentMatches = await searchIssueScoresByTimeEntryComments(url, apiKey, trimmed, normalizedQuery, terms);
      commentMatches.forEach((match, issueId) => {
        commentMatchByIssueId.set(issueId, match);
      });

      const missingIssueIds = [...commentMatches.keys()].filter((issueId) => !mergedById.has(issueId));
      if (missingIssueIds.length > 0) {
        const fetchedMissing = await Promise.allSettled(
          missingIssueIds.map((issueId) => fetchIssue(issueId))
        );

        for (const result of fetchedMissing) {
          if (result.status === "fulfilled" && !mergedById.has(result.value.id)) {
            mergedById.set(result.value.id, result.value);
          }
        }
      }
    } catch {
      // Experimental search must not break the main subject/project search flow.
    }
  }

  if (mergedById.size === 0) {
    if (firstError) throw new Error(firstError);
    return [];
  }

  const ranked = [...mergedById.values()]
    .map((issue) => ({
      issue,
      score: scoreIssue(issue, normalizedQuery, terms) + (commentMatchByIssueId.get(issue.id)?.score ?? 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.issue.updated_on.localeCompare(a.issue.updated_on);
    })
    .slice(0, SEARCH_RESULT_LIMIT)
    .map(({ issue }) => ({
      issue,
      matchedCommentSnippet: commentMatchByIssueId.get(issue.id)?.snippet,
      matchedCommentFullText: commentMatchByIssueId.get(issue.id)?.fullComment,
    }));

  return ranked;
}

export async function fetchIssue(issueId: number): Promise<RedmineIssue> {
  const { url, apiKey } = await getCredentials();

  const resp = await fetch(`${url}/issues/${issueId}.json`, {
    headers: { "X-Redmine-API-Key": apiKey },
    danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
  });

  if (!resp.ok) {
    throw new Error(i18n.t("redmine.fetchIssueFailed", { issueId, status: resp.status }));
  }

  const data = (await resp.json()) as RedmineSingleIssueResponse;
  return data.issue;
}

export interface LogTimeParams {
  issueId: number;
  hours: number;
  activityId: number;
  comments: string;
  spentOn: string; // YYYY-MM-DD
}

export async function logTimeEntry(params: LogTimeParams): Promise<number> {
  const { url, apiKey } = await getCredentials();

  const resp = await fetch(`${url}/time_entries.json`, {
    method: "POST",
    headers: {
      "X-Redmine-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
    body: JSON.stringify({
      time_entry: {
        issue_id: params.issueId,
        hours: params.hours,
        activity_id: params.activityId,
        comments: params.comments,
        spent_on: params.spentOn,
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(i18n.t("redmine.logTimeFailed", { status: resp.status, body }));
  }

  const data = (await resp.json()) as { time_entry: { id: number } };
  return data.time_entry.id;
}

export async function updateTimeEntry(
  entryId: number,
  params: Partial<LogTimeParams>
): Promise<void> {
  const { url, apiKey } = await getCredentials();

  const resp = await fetch(`${url}/time_entries/${entryId}.json`, {
    method: "PUT",
    headers: {
      "X-Redmine-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
    body: JSON.stringify({
      time_entry: {
        ...(params.issueId != null && { issue_id: params.issueId }),
        ...(params.hours != null && { hours: params.hours }),
        ...(params.activityId != null && { activity_id: params.activityId }),
        ...(params.comments != null && { comments: params.comments }),
        ...(params.spentOn != null && { spent_on: params.spentOn }),
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(i18n.t("redmine.updateTimeFailed", { status: resp.status, body }));
  }
}

export async function deleteTimeEntry(entryId: number): Promise<void> {
  const { url, apiKey } = await getCredentials();

  const resp = await fetch(`${url}/time_entries/${entryId}.json`, {
    method: "DELETE",
    headers: { "X-Redmine-API-Key": apiKey },
    danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(i18n.t("redmine.deleteTimeFailed", { status: resp.status, body }));
  }
}

export async function fetchActivities(): Promise<RedmineActivity[]> {
  const { url, apiKey } = await getCredentials();

  const resp = await fetch(`${url}/enumerations/time_entry_activities.json`, {
    headers: { "X-Redmine-API-Key": apiKey },
    danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
  });

  if (!resp.ok) {
    throw new Error(i18n.t("redmine.fetchActivitiesFailed", { status: resp.status }));
  }

  const data = (await resp.json()) as { time_entry_activities: RedmineActivity[] };
  return data.time_entry_activities;
}

export async function validateRedmineConnection(redmineUrl: string, apiKey: string): Promise<void> {
  const url = redmineUrl.trim().replace(/\/+$/, "");
  const token = apiKey.trim();

  if (!url || !token) {
    throw new Error(i18n.t("redmine.credentialsMissing"));
  }

  const resp = await fetch(`${url}/enumerations/time_entry_activities.json`, {
    headers: { "X-Redmine-API-Key": token },
    danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(i18n.t("redmine.connectionTestFailed", { status: resp.status, body }));
  }
}

export async function fetchIssueTodayLoggedHours(issueId: number): Promise<number> {
  const { url, apiKey } = await getCredentials();
  const today = new Date().toISOString().split("T")[0];
  const pageSize = 100;
  let offset = 0;
  let total = 0;
  let totalCount = 0;

  do {
    const params = new URLSearchParams({
      user_id: "me",
      issue_id: String(issueId),
      spent_on: today,
      limit: String(pageSize),
      offset: String(offset),
    });

    const resp = await fetch(`${url}/time_entries.json?${params}`, {
      headers: { "X-Redmine-API-Key": apiKey },
      danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
    });

    if (!resp.ok) {
      throw new Error(i18n.t("redmine.fetchTodayEntriesFailed", { status: resp.status }));
    }

    const data = (await resp.json()) as {
      time_entries: RedmineTimeEntry[];
      total_count: number;
    };

    total += data.time_entries.reduce((sum, entry) => sum + (entry.hours ?? 0), 0);
    totalCount = data.total_count ?? data.time_entries.length;
    offset += pageSize;
  } while (offset < totalCount);

  return total;
}

export async function fetchUserLoggedHoursForDay(spentOn: string): Promise<number> {
  const stats = await fetchUserDayStats(spentOn);
  return stats.totalHours;
}

export interface UserDayStats {
  totalHours: number;
  entries: number;
  uniqueIssueCount: number;
  uniqueProjectCount: number;
  issueIds: number[];
  projectIds: number[];
}

export async function fetchUserDayStats(spentOn: string): Promise<UserDayStats> {
  const { url, apiKey } = await getCredentials();
  const pageSize = 100;
  let offset = 0;
  let total = 0;
  let totalCount = 0;
  let entries = 0;
  const issueIds = new Set<number>();

  do {
    const params = new URLSearchParams({
      user_id: "me",
      spent_on: spentOn,
      limit: String(pageSize),
      offset: String(offset),
    });

    const resp = await fetch(`${url}/time_entries.json?${params}`, {
      headers: { "X-Redmine-API-Key": apiKey },
      danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
    });

    if (!resp.ok) {
      throw new Error(i18n.t("redmine.fetchTodayEntriesFailed", { status: resp.status }));
    }

    const data = (await resp.json()) as {
      time_entries: RedmineTimeEntry[];
      total_count: number;
    };

    total += data.time_entries.reduce((sum, entry) => sum + (entry.hours ?? 0), 0);
    entries += data.time_entries.length;
    data.time_entries.forEach((entry) => issueIds.add(entry.issue.id));
    totalCount = data.total_count ?? data.time_entries.length;
    offset += pageSize;
  } while (offset < totalCount);

  const issueResults = await Promise.allSettled([...issueIds].map((issueId) => fetchIssue(issueId)));
  const projectIds = new Set<number>();
  issueResults.forEach((result) => {
    if (result.status === "fulfilled") {
      projectIds.add(result.value.project.id);
    }
  });

  return {
    totalHours: total,
    entries,
    uniqueIssueCount: issueIds.size,
    uniqueProjectCount: projectIds.size,
    issueIds: [...issueIds],
    projectIds: [...projectIds],
  };
}

export async function fetchLatestIssueComment(issueId: number): Promise<string | null> {
  const { url, apiKey } = await getCredentials();

  const params = new URLSearchParams({
    user_id: "me",
    issue_id: String(issueId),
    limit: "20",
    sort: "spent_on:desc",
  });

  const resp = await fetch(`${url}/time_entries.json?${params}`, {
    headers: { "X-Redmine-API-Key": apiKey },
    danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
  });

  if (!resp.ok) {
    throw new Error(i18n.t("redmine.fetchEntriesFailed", { status: resp.status }));
  }

  const data = (await resp.json()) as { time_entries: RedmineTimeEntry[] };
  const latestWithComment = data.time_entries.find(
    (entry) => entry.comments?.trim().length > 0
  );

  return latestWithComment?.comments.trim() ?? null;
}

export interface FetchTimeEntriesResult {
  sessions: WorkSession[];
  totalCount: number;
}

export async function fetchTimeEntriesForDateRange(from: string, to: string): Promise<WorkSession[]> {
  const { url, apiKey } = await getCredentials();
  const pageSize = 100;
  let offset = 0;
  let totalCount = 0;
  const allTimeEntries: RedmineTimeEntry[] = [];

  do {
    const params = new URLSearchParams({
      user_id: "me",
      limit: String(pageSize),
      offset: String(offset),
      from,
      to,
      sort: "spent_on:desc",
    });

    const resp = await fetch(`${url}/time_entries.json?${params}`, {
      headers: { "X-Redmine-API-Key": apiKey },
      danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
    });

    if (!resp.ok) {
      throw new Error(i18n.t("redmine.fetchEntriesFailed", { status: resp.status }));
    }

    const data = (await resp.json()) as {
      time_entries: RedmineTimeEntry[];
      total_count: number;
    };

    allTimeEntries.push(...data.time_entries);
    totalCount = data.total_count;
    offset += data.time_entries.length;

    if (data.time_entries.length === 0) {
      break;
    }
  } while (offset < totalCount);

  const issueIds = [...new Set(allTimeEntries.map((entry) => entry.issue.id))];
  const issueResults = await Promise.allSettled(
    issueIds.map((id) => fetchIssue(id))
  );

  const issueMap = new Map<number, RedmineIssue>();
  issueResults.forEach((result) => {
    if (result.status === "fulfilled") {
      issueMap.set(result.value.id, result.value);
    }
  });

  return allTimeEntries
    .filter((entry) => issueMap.has(entry.issue.id))
    .map((entry) => {
      const persisted = getPersistedTimesForEntry(url, entry.id);
      const { startedAt, stoppedAt } = persisted ?? fallbackTimesFromCreatedAt(entry);
      const loggedIssue = issueMap.get(entry.issue.id)!;
      const selectedIssue = persisted?.issue ?? loggedIssue;
      const persistedLoggedIssue = persisted?.loggedIssue ?? loggedIssue;

      return {
        id: `redmine-${entry.id}`,
        issue: selectedIssue,
        loggedIssue: persistedLoggedIssue,
        hours: entry.hours,
        activityId: entry.activity.id,
        comments: entry.comments || "",
        spentOn: entry.spent_on,
        startedAt,
        stoppedAt,
        redmineEntryId: entry.id,
        createdAt: entry.created_on,
      } satisfies WorkSession;
    });
}

export async function fetchRecentTimeEntries(
  offset = 0,
  limit = 10
): Promise<FetchTimeEntriesResult> {
  const { url, apiKey } = await getCredentials();

  const params = new URLSearchParams({
    user_id: "me",
    limit: String(limit),
    offset: String(offset),
    sort: "spent_on:desc",
  });

  const resp = await fetch(`${url}/time_entries.json?${params}`, {
    headers: { "X-Redmine-API-Key": apiKey },
    danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
  });

  if (!resp.ok) {
    throw new Error(i18n.t("redmine.fetchEntriesFailed", { status: resp.status }));
  }

  const data = (await resp.json()) as {
    time_entries: RedmineTimeEntry[];
    total_count: number;
  };

  const issueIds = [...new Set(data.time_entries.map((e) => e.issue.id))];
  const issueResults = await Promise.allSettled(
    issueIds.map((id) => fetchIssue(id))
  );
  const issueMap = new Map<number, RedmineIssue>();
  issueResults.forEach((r) => {
    if (r.status === "fulfilled") issueMap.set(r.value.id, r.value);
  });

  const sessions = data.time_entries
    .filter((entry) => issueMap.has(entry.issue.id))
    .map((entry) => {
      const persisted = getPersistedTimesForEntry(url, entry.id);
      const { startedAt, stoppedAt } = persisted ?? fallbackTimesFromCreatedAt(entry);
      const loggedIssue = issueMap.get(entry.issue.id)!;
      const selectedIssue = persisted?.issue ?? loggedIssue;
      const persistedLoggedIssue = persisted?.loggedIssue ?? loggedIssue;

      return {
        id: `redmine-${entry.id}`,
        issue: selectedIssue,
        loggedIssue: persistedLoggedIssue,
        hours: entry.hours,
        activityId: entry.activity.id,
        comments: entry.comments || "",
        spentOn: entry.spent_on,
        startedAt,
        stoppedAt,
        redmineEntryId: entry.id,
        createdAt: entry.created_on,
      } satisfies WorkSession;
    });

  return { sessions, totalCount: data.total_count };
}
