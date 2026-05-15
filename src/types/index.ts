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
}

export interface RedmineTimeEntry {
  id?: number;
  issue_id: number;
  hours: number;
  comments: string;
  activity_id: number;
  spent_on: string;
  synced?: boolean;
}

export interface UserSettings {
  redmine_url: string;
  check_interval_minutes: number;
  idle_threshold_minutes: number;
  theme: "light" | "dark" | "system";
}
