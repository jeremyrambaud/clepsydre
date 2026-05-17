import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import type { RedmineIssue, RedmineActivity, RedmineTimeEntry, WorkSession } from "@/types";
import { useSettingsStore } from "@/store";

interface RedmineIssuesResponse {
  issues: RedmineIssue[];
}

interface RedmineSingleIssueResponse {
  issue: RedmineIssue;
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
    throw new Error("Redmine credentials not configured. Go to Settings to set them up.");
  }

  return { url: redmine_url.replace(/\/+$/, ""), apiKey };
}

export async function searchIssues(query: string): Promise<RedmineIssue[]> {
  const { url, apiKey } = await getCredentials();
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
        return [data.issue];
      }
    } catch {
      // fall through to text search
    }
  }

  // Full-text search on subject
  const params = new URLSearchParams({
    "subject": `~${trimmed}`,
    "limit": "15",
    "status_id": "open",
    "sort": "updated_on:desc",
  });

  const resp = await fetch(`${url}/issues.json?${params}`, {
    headers: { "X-Redmine-API-Key": apiKey },
    danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Redmine API error (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as RedmineIssuesResponse;
  return data.issues;
}

export async function fetchIssue(issueId: number): Promise<RedmineIssue> {
  const { url, apiKey } = await getCredentials();

  const resp = await fetch(`${url}/issues/${issueId}.json`, {
    headers: { "X-Redmine-API-Key": apiKey },
    danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch issue #${issueId} (${resp.status})`);
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
    throw new Error(`Failed to log time (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as { time_entry: { id: number } };
  return data.time_entry.id;
}

export async function updateTimeEntry(
  entryId: number,
  params: Partial<Omit<LogTimeParams, "issueId">>
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
        ...(params.hours != null && { hours: params.hours }),
        ...(params.activityId != null && { activity_id: params.activityId }),
        ...(params.comments != null && { comments: params.comments }),
        ...(params.spentOn != null && { spent_on: params.spentOn }),
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to update time entry (${resp.status}): ${body}`);
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
    throw new Error(`Failed to delete time entry (${resp.status}): ${body}`);
  }
}

export async function fetchActivities(): Promise<RedmineActivity[]> {
  const { url, apiKey } = await getCredentials();

  const resp = await fetch(`${url}/enumerations/time_entry_activities.json`, {
    headers: { "X-Redmine-API-Key": apiKey },
    danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch activities (${resp.status})`);
  }

  const data = (await resp.json()) as { time_entry_activities: RedmineActivity[] };
  return data.time_entry_activities;
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
      throw new Error(`Failed to fetch today's time entries (${resp.status})`);
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

export interface FetchTimeEntriesResult {
  sessions: WorkSession[];
  totalCount: number;
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
    throw new Error(`Failed to fetch time entries (${resp.status})`);
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
      const created = new Date(entry.created_on);
      const durationMinutes = Math.round(entry.hours * 60);
      const endMinutes = created.getHours() * 60 + created.getMinutes();
      const startMinutes = endMinutes - durationMinutes;

      const startH = Math.floor(Math.max(0, startMinutes) / 60);
      const startM = Math.max(0, startMinutes) % 60;
      const endH = Math.floor(endMinutes / 60) % 24;
      const endM = endMinutes % 60;

      return {
        id: `redmine-${entry.id}`,
        issue: issueMap.get(entry.issue.id)!,
        hours: entry.hours,
        activityId: entry.activity.id,
        comments: entry.comments || "",
        spentOn: entry.spent_on,
        startedAt: `${startH.toString().padStart(2, "0")}:${startM.toString().padStart(2, "0")}`,
        stoppedAt: `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`,
        redmineEntryId: entry.id,
        createdAt: entry.created_on,
      } satisfies WorkSession;
    });

  return { sessions, totalCount: data.total_count };
}
