export interface RedmineRef {
  id: number;
  name: string;
}

export interface RedmineProject {
  id: number;
  name: string;
  identifier: string;
  status: number;
}

export interface RedmineIssue {
  id: number;
  project: RedmineRef;
  tracker: RedmineRef;
  status: RedmineRef;
  priority: RedmineRef;
  subject: string;
  assigned_to?: RedmineRef;
  updated_on: string;
  estimated_hours?: number;
  spent_hours?: number;
}

export interface IssueSearchResult {
  issue: RedmineIssue;
  matchedCommentSnippet?: string;
  matchedCommentFullText?: string;
}

export interface RedmineTimeEntry {
  id: number;
  issue: RedmineRef;
  activity: RedmineRef;
  hours: number;
  comments: string;
  spent_on: string;
  created_on: string;
  updated_on: string;
}

export interface RedmineActivity {
  id: number;
  name: string;
}

export interface WorkSession {
  id: string;
  issue: RedmineIssue;
  hours: number;
  activityId: number;
  comments: string;
  spentOn: string; // YYYY-MM-DD
  startedAt: string; // HH:MM
  stoppedAt: string; // HH:MM
  redmineEntryId?: number;
  createdAt: string; // ISO timestamp
}

export interface UserSettings {
  redmine_url: string;
  api_key: string;
  language: "en" | "fr";
  default_activity_id: number | null;
  default_comment: string;
  prefill_last_comment_on_timer_start: boolean;
  express_entry: boolean;
  idle_detection_enabled: boolean;
  launch_at_startup: boolean;
  minimize_to_tray: boolean;
  update_channel: "stable" | "beta";
  check_interval_minutes: number;
  search_in_time_comments: boolean;
  idle_threshold_minutes: number;
  theme: "light" | "dark" | "system";
}
