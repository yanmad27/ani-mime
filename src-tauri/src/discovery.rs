use std::sync::{Arc, Mutex};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use tauri::Emitter;

use crate::state::{AppState, PeerInfo};

const SERVICE_TYPE: &str = "_ani-mime._tcp.local.";
const VISIT_PORT: u16 = 1234;

/// Register this instance on the network and browse for peers.
pub fn start_discovery(
    app_handle: tauri::AppHandle,
    app_state: Arc<Mutex<AppState>>,
    nickname: String,
    pet: String,
) {
    std::thread::spawn(move || {
        let mdns = ServiceDaemon::new().expect("Failed to create mDNS daemon");

        // Register our service
        let host_name = hostname::get()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let instance_name = format!("{}-{}", nickname, std::process::id());

        let properties = [
            ("nickname", nickname.as_str()),
            ("pet", pet.as_str()),
        ];

        let service_info = ServiceInfo::new(
            SERVICE_TYPE,
            &instance_name,
            &format!("{}.", host_name),
            "",
            VISIT_PORT,
            &properties[..],
        ).expect("Failed to create ServiceInfo");

        mdns.register(service_info.clone())
            .expect("Failed to register mDNS service");
        eprintln!("[discovery] registered as {}", instance_name);

        // Browse for peers
        let receiver = mdns.browse(SERVICE_TYPE)
            .expect("Failed to browse mDNS");

        let my_instance = instance_name.clone();

        loop {
            match receiver.recv() {
                Ok(event) => match event {
                    ServiceEvent::ServiceResolved(info) => {
                        let peer_instance = info.get_fullname().to_string();
                        // Skip ourselves
                        if peer_instance.contains(&my_instance) {
                            continue;
                        }

                        let nickname = info.get_property_val_str("nickname")
                            .unwrap_or("Unknown")
                            .to_string();
                        let pet = info.get_property_val_str("pet")
                            .unwrap_or("rottweiler")
                            .to_string();
                        let ip = info.get_addresses().iter()
                            .next()
                            .map(|a| a.to_string())
                            .unwrap_or_default();
                        let port = info.get_port();

                        let peer = PeerInfo {
                            instance_name: peer_instance.clone(),
                            nickname,
                            pet,
                            ip,
                            port,
                        };

                        eprintln!("[discovery] found peer: {} at {}:{}", peer.nickname, peer.ip, peer.port);

                        let mut st = app_state.lock().unwrap();
                        st.peers.insert(peer_instance, peer);
                        let peers: Vec<PeerInfo> = st.peers.values().cloned().collect();
                        drop(st);

                        let _ = app_handle.emit("peers-changed", &peers);
                    }
                    ServiceEvent::ServiceRemoved(_, fullname) => {
                        eprintln!("[discovery] peer removed: {}", fullname);

                        let mut st = app_state.lock().unwrap();
                        st.peers.remove(&fullname);
                        let peers: Vec<PeerInfo> = st.peers.values().cloned().collect();
                        drop(st);

                        let _ = app_handle.emit("peers-changed", &peers);
                    }
                    _ => {}
                },
                Err(_) => break,
            }
        }
    });
}
