export const NATIVE_HOST_NAME = "com.clepsydre.bridge";

// --- Extension -> App ---

export interface GetTimerStateRequest {
  action: "getTimerState";
}

export interface StartIssueRequest {
  action: "startIssue";
  issueId: number;
  loggedIssueId?: number;
  openBillingIssueDialog?: boolean;
}

export interface StopCurrentRequest {
  action: "stopCurrent";
}

export type BridgeRequest =
  | GetTimerStateRequest
  | StartIssueRequest
  | StopCurrentRequest;

// --- App -> Extension ---

export type TimerStatus = "idle" | "running" | "paused";

export interface TimerState {
  status: TimerStatus;
  issueId: number | null;
  issueSubject: string | null;
  elapsedSeconds: number;
}

export interface GetTimerStateResponse {
  action: "getTimerState";
  ok: true;
  state: TimerState;
}

export interface StartIssueOkResponse {
  action: "startIssue";
  ok: true;
}

export interface StartIssueSwitchResponse {
  action: "startIssue";
  ok: true;
  switchRequired: true;
  currentIssueId: number;
  currentIssueSubject: string;
}

export interface StopCurrentOkResponse {
  action: "stopCurrent";
  ok: true;
}

export interface ErrorResponse {
  action: string;
  ok: false;
  error: string;
}

export type BridgeResponse =
  | GetTimerStateResponse
  | StartIssueOkResponse
  | StartIssueSwitchResponse
  | StopCurrentOkResponse
  | ErrorResponse;
