use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Listener};

use crate::commands::integration::{IntegrationRequest, IntegrationResponse, SharedTimerState};

pub fn spawn_bridge_server(app: AppHandle, timer_state: SharedTimerState) {
    thread::spawn(move || {
        let server = match tiny_http::Server::http("127.0.0.1:23847") {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[bridge] Failed to bind port 23847: {e}");
                return;
            }
        };

        for mut request in server.incoming_requests() {
            if request.method() != &tiny_http::Method::Post {
                let resp = tiny_http::Response::from_string("{\"ok\":false,\"error\":\"Method not allowed\"}")
                    .with_status_code(405)
                    .with_header(
                        tiny_http::Header::from_bytes(b"Content-Type", b"application/json")
                            .unwrap(),
                    );
                let _ = request.respond(resp);
                continue;
            }

            let mut body = String::new();
            if request.as_reader().read_to_string(&mut body).is_err() {
                let resp = tiny_http::Response::from_string("{\"ok\":false,\"error\":\"Bad body\"}")
                    .with_status_code(400)
                    .with_header(
                        tiny_http::Header::from_bytes(b"Content-Type", b"application/json")
                            .unwrap(),
                    );
                let _ = request.respond(resp);
                continue;
            }

            let msg: serde_json::Value = match serde_json::from_str(&body) {
                Ok(v) => v,
                Err(_) => {
                    let resp = tiny_http::Response::from_string("{\"ok\":false,\"error\":\"Invalid JSON\"}")
                        .with_status_code(400)
                        .with_header(
                            tiny_http::Header::from_bytes(b"Content-Type", b"application/json")
                                .unwrap(),
                        );
                    let _ = request.respond(resp);
                    continue;
                }
            };

            let action = msg
                .get("action")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let request_id = msg
                .get("requestId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let issue_id = msg.get("issueId").and_then(|v| v.as_u64()).map(|v| v as u32);
            let logged_issue_id = msg
                .get("loggedIssueId")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            let open_billing_issue_dialog = msg
                .get("openBillingIssueDialog")
                .and_then(|v| v.as_bool());

            let payload = IntegrationRequest {
                action: action.clone(),
                issue_id,
                logged_issue_id,
                open_billing_issue_dialog,
                request_id: request_id.clone(),
            };

            let _ = app.emit("integration-request", payload);

            let response_holder: Arc<Mutex<Option<IntegrationResponse>>> =
                Arc::new(Mutex::new(None));
            let response_holder_clone = response_holder.clone();
            let rid = request_id.clone();

            let listener_id = app.listen("integration-response", move |event| {
                if let Ok(resp) = serde_json::from_str::<IntegrationResponse>(event.payload()) {
                    if resp.request_id == rid {
                        if let Ok(mut holder) = response_holder_clone.lock() {
                            *holder = Some(resp);
                        }
                    }
                }
            });

            let mut received = false;
            for _ in 0..100 {
                thread::sleep(Duration::from_millis(100));
                if let Ok(holder) = response_holder.lock() {
                    if holder.is_some() {
                        received = true;
                        break;
                    }
                }
            }

            app.unlisten(listener_id);

            let response_json = if received {
                let holder = response_holder.lock().unwrap();
                serde_json::to_string(holder.as_ref().unwrap()).unwrap_or_default()
            } else {
                if action == "getTimerState" {
                    let state = timer_state.lock().map(|s| s.clone());
                    let fallback = match state {
                        Ok(ts) => serde_json::json!({
                            "requestId": request_id,
                            "action": "getTimerState",
                            "ok": true,
                            "state": {
                                "status": ts.status,
                                "issueId": ts.issue_id,
                                "issueSubject": ts.issue_subject,
                                "elapsedSeconds": ts.elapsed_seconds,
                                "redmineUrl": ts.redmine_url,
                            }
                        }),
                        Err(e) => serde_json::json!({
                            "requestId": request_id,
                            "action": "getTimerState",
                            "ok": false,
                            "error": e.to_string(),
                        }),
                    };
                    serde_json::to_string(&fallback).unwrap_or_default()
                } else {
                    serde_json::to_string(&serde_json::json!({
                        "requestId": request_id,
                        "action": action,
                        "ok": false,
                        "error": "Timeout waiting for app response"
                    }))
                    .unwrap_or_default()
                }
            };

            let resp = tiny_http::Response::from_string(response_json).with_header(
                tiny_http::Header::from_bytes(b"Content-Type", b"application/json").unwrap(),
            );
            let _ = request.respond(resp);
        }
    });
}
