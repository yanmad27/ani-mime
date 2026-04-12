use std::path::Path;

/// Copy the MCP server script to ~/.ani-mime/mcp/ so Claude Code can run it.
/// Called on every startup to keep the server up-to-date.
pub fn install_mcp_server(resource_dir: &Path, home: &Path) {
    let mcp_dir = home.join(".ani-mime/mcp");
    if let Err(e) = std::fs::create_dir_all(&mcp_dir) {
        crate::app_error!("[mcp] failed to create {}: {}", mcp_dir.display(), e);
        return;
    }

    let source = resource_dir.join("mcp-server/server.mjs");
    let dest = mcp_dir.join("server.mjs");

    if source.exists() {
        match std::fs::copy(&source, &dest) {
            Ok(_) => crate::app_log!("[mcp] installed server to {}", dest.display()),
            Err(e) => crate::app_error!("[mcp] failed to copy server: {}", e),
        }
    } else {
        crate::app_warn!("[mcp] source not found: {}", source.display());
    }
}

/// Register the MCP server in ~/.claude.json so Claude Code discovers it automatically.
pub fn register_mcp_server(home: &Path) {
    let server_path = home.join(".ani-mime/mcp/server.mjs");
    if !server_path.exists() {
        crate::app_warn!("[mcp] server not installed, skipping registration");
        return;
    }

    let config_path = home.join(".claude.json");
    let mut config: serde_json::Value = if config_path.exists() {
        match std::fs::read_to_string(&config_path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or(serde_json::json!({})),
            Err(e) => {
                crate::app_error!("[mcp] failed to read {}: {}", config_path.display(), e);
                serde_json::json!({})
            }
        }
    } else {
        serde_json::json!({})
    };

    let servers = config
        .as_object_mut()
        .unwrap()
        .entry("mcpServers")
        .or_insert(serde_json::json!({}));

    // Never overwrite an existing registration — the user may have customized it
    if servers.get("ani-mime").is_some() {
        crate::app_log!("[mcp] already registered in {}, skipping", config_path.display());
        return;
    }

    servers.as_object_mut().unwrap().insert(
        "ani-mime".to_string(),
        serde_json::json!({
            "command": "node",
            "args": [server_path.to_string_lossy()]
        }),
    );

    match serde_json::to_string_pretty(&config) {
        Ok(json_str) => {
            if let Err(e) = std::fs::write(&config_path, &json_str) {
                crate::app_error!("[mcp] failed to write {}: {}", config_path.display(), e);
            } else {
                crate::app_log!("[mcp] registered in {}", config_path.display());
            }
        }
        Err(e) => crate::app_error!("[mcp] failed to serialize config: {}", e),
    }
}
