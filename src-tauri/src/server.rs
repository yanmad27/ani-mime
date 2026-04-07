use std::sync::{Arc, Mutex};
use tauri::Emitter;

use crate::helpers::{get_port, get_query_param, now_secs};
use crate::state::{emit_if_changed, AppState, Session, TaskCompleted};

pub fn start_http_server(app_handle: tauri::AppHandle, app_state: Arc<Mutex<AppState>>) {
    std::thread::spawn(move || {
        let port = get_port();
        let addr = format!("127.0.0.1:{}", port);
        let server = match tiny_http::Server::http(&addr) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[http] failed to bind :{port}: {e}");
                return;
            }
        };
        eprintln!("[http] listening on {}", addr);

        let cors: tiny_http::Header = "Access-Control-Allow-Origin: *".parse().unwrap();

        for mut req in server.incoming_requests() {
            let url = req.url().to_string();
            let now = now_secs();

            if url.starts_with("/status") {
                if let Some(pid_str) = get_query_param(&url, "pid") {
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        let mut st = app_state.lock().unwrap();

                        let session = st
                            .sessions
                            .entry(pid)
                            .or_insert_with(|| Session::new_idle(now));
                        session.last_seen = now;

                        if url.contains("state=busy") {
                            let cmd_type = get_query_param(&url, "type").unwrap_or("task");
                            session.busy_type = cmd_type.to_string();

                            if cmd_type == "service" {
                                session.ui_state = "service".to_string();
                                session.service_since = now;
                                session.busy_since = 0;
                            } else {
                                session.ui_state = "busy".to_string();
                                session.service_since = 0;
                                session.busy_since = now;
                            }

                            emit_if_changed(&app_handle, &mut st);
                        } else if url.contains("state=idle") {
                            // Emit task-completed if this session was busy
                            let busy_since = session.busy_since;
                            if busy_since > 0 {
                                let duration = now.saturating_sub(busy_since);
                                let _ = app_handle.emit("task-completed", TaskCompleted { duration_secs: duration });
                            }

                            session.busy_type.clear();
                            session.ui_state = "idle".to_string();
                            session.service_since = 0;
                            session.busy_since = 0;
                            emit_if_changed(&app_handle, &mut st);
                        }
                    }
                }
            } else if url.starts_with("/heartbeat") {
                if let Some(pid_str) = get_query_param(&url, "pid") {
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        let mut st = app_state.lock().unwrap();
                        let session = st
                            .sessions
                            .entry(pid)
                            .or_insert_with(|| Session::new_idle(now));
                        session.last_seen = now;

                        emit_if_changed(&app_handle, &mut st);
                    }
                }
            }

            // --- Visit routes ---
            if url.starts_with("/visit") && !url.starts_with("/visit-end") {
                // Another dog is visiting us
                let mut body = String::new();
                let reader = req.as_reader();
                let _ = reader.read_to_string(&mut body);

                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&body) {
                    let pet = payload["pet"].as_str().unwrap_or("rottweiler").to_string();
                    let nickname = payload["nickname"].as_str().unwrap_or("Unknown").to_string();
                    let duration_secs = payload["duration_secs"].as_u64().unwrap_or(15);

                    let mut st = app_state.lock().unwrap();
                    st.visitors.push(crate::state::VisitingDog {
                        pet: pet.clone(),
                        nickname: nickname.clone(),
                        arrived_at: now,
                        duration_secs,
                    });
                    drop(st);

                    let _ = app_handle.emit("visitor-arrived", serde_json::json!({
                        "pet": pet,
                        "nickname": nickname,
                        "duration_secs": duration_secs,
                    }));
                    eprintln!("[visit] {} ({}) arrived for {}s", nickname, pet, duration_secs);
                }

                let resp = tiny_http::Response::from_string("ok")
                    .with_status_code(200)
                    .with_header(cors.clone());
                let _ = req.respond(resp);
                continue;
            }

            if url.starts_with("/visit-end") {
                // A visiting dog is leaving
                let mut body = String::new();
                let reader = req.as_reader();
                let _ = reader.read_to_string(&mut body);

                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&body) {
                    let nickname = payload["nickname"].as_str().unwrap_or("").to_string();

                    let mut st = app_state.lock().unwrap();
                    st.visitors.retain(|v| v.nickname != nickname);
                    drop(st);

                    let _ = app_handle.emit("visitor-left", serde_json::json!({
                        "nickname": nickname,
                    }));
                    eprintln!("[visit] {} left", nickname);
                }

                let resp = tiny_http::Response::from_string("ok")
                    .with_status_code(200)
                    .with_header(cors.clone());
                let _ = req.respond(resp);
                continue;
            }

            // Debug endpoint: GET /debug → show all sessions
            if url.starts_with("/debug") {
                let st = app_state.lock().unwrap();
                let mut lines = Vec::new();
                lines.push(format!("current_ui: {}", st.current_ui));
                lines.push(format!("sessions: {}", st.sessions.len()));
                for (pid, s) in &st.sessions {
                    lines.push(format!(
                        "  pid={} ui={} type={} last_seen={}s_ago",
                        pid,
                        s.ui_state,
                        s.busy_type,
                        now - s.last_seen
                    ));
                }
                let body = lines.join("\n");
                let resp = tiny_http::Response::from_string(body)
                    .with_status_code(200)
                    .with_header(cors.clone());
                let _ = req.respond(resp);
                continue;
            }

            let resp = tiny_http::Response::from_string("ok")
                .with_status_code(200)
                .with_header(cors.clone());
            let _ = req.respond(resp);
        }
    });
}
