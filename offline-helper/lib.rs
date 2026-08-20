use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Component, Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
    thread,
    time::Duration,
};
use tauri::Manager;
use tauri_plugin_autostart::ManagerExt;

const HELPER_VERSION: &str = "1.0.0";
const API_ADDRESS: &str = "127.0.0.1:43128";
const WORKSPACE_PATH: &str = r"C:\TSE\NAIADD";

const PRODUCTION_APP_BASE_URL: &str = "https://naiadd.vercel.app";
const REMOTE_APP_MANIFEST_URL: &str =
    "https://naiadd.vercel.app/offline-app-manifest.json";
const APP_MANIFEST_FILENAME: &str = "offline-app-manifest.json";
const APP_UPDATE_INTERVAL_SECONDS: u64 = 300;
const PRODUCTION_LAUNCH_URL: &str = "https://naiadd.vercel.app/";
const LOCAL_LAUNCH_URL: &str = "http://127.0.0.1:43128/";
const LAUNCH_PROBE_TIMEOUT_SECONDS: u64 = 3;

const SNAPSHOT_FILENAME: &str = "NAIADD_Offline_Snapshot.naiadd";
const SNAPSHOT_META_FILENAME: &str = "NAIADD_Offline_SnapshotMeta.json";
const SNAPSHOT_INDEX_FILENAME: &str = "NAIADD_Offline_SnapshotIndex.naiadd";
const SNAPSHOT_KEY_PATH: &str = "/snapshot-key";
const WINDOWS_SNAPSHOT_KEY_SERVICE: &str = "NAIADD Offline Snapshot";
const WINDOWS_SNAPSHOT_KEY_ACCOUNT: &str = "production-snapshot";
const USER_PROFILE_FILENAME: &str = "NAIADD_Offline_User.json";
const SURVEY_STATE_FILENAME: &str = "NAIADD_Offline_SurveyState.json";
const SAVED_QUERIES_FILENAME: &str = "NAIADD_Offline_SavedQueries.json";
const THEME_STATE_FILENAME: &str = "NAIADD_Offline_Theme.json";
const APP_FOLDER: &str = "app";
const MAX_REQUEST_BYTES: usize = 256 * 1024 * 1024;
const WINDOWS_CREDENTIAL_SERVICE: &str = "NAIADD Offline Workstation";
const WORKSTATION_CREDENTIAL_PATH: &str = "/workstation-credential";
const APP_UPDATE_PATH: &str = "/update-app";

static APP_UPDATE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static LAST_APP_UPDATE_RESULT: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static LAST_APP_UPDATE_ERROR: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static LAST_APP_UPDATE_AT: OnceLock<Mutex<Option<String>>> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HelperStatus {
    ok: bool,
    helper: &'static str,
    version: &'static str,
    workspace_path: String,
    workspace_exists: bool,
    workspace_writable: bool,
    snapshot_exists: bool,
    offline_app_exists: bool,
    offline_app_url: String,
    offline_app_version: Option<String>,
    app_update_in_progress: bool,
    last_app_update_result: Option<String>,
    last_app_update_error: Option<String>,
    last_app_update_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfflineAppManifest {
    format: String,
    version: String,
    built_at: String,
    files: Vec<OfflineAppFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OfflineAppFile {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Debug, Deserialize)]
struct WorkstationCredentialRequest {
    email: String,
    password: String,
}


#[derive(Debug, Deserialize)]
struct SnapshotKeyRequest {
    snapshot_key: String,
}



fn update_status_slot(
    slot: &'static OnceLock<Mutex<Option<String>>>,
    value: Option<String>,
) {
    let mutex = slot.get_or_init(|| Mutex::new(None));

    if let Ok(mut guard) = mutex.lock() {
        *guard = value;
    }
}

fn read_status_slot(
    slot: &'static OnceLock<Mutex<Option<String>>>,
) -> Option<String> {
    slot.get()
        .and_then(|mutex| mutex.lock().ok())
        .and_then(|guard| guard.clone())
}

fn current_update_timestamp() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn mark_app_update_started() {
    update_status_slot(
        &LAST_APP_UPDATE_RESULT,
        Some("checking".to_string()),
    );
    update_status_slot(&LAST_APP_UPDATE_ERROR, None);
    update_status_slot(
        &LAST_APP_UPDATE_AT,
        Some(current_update_timestamp()),
    );
}

fn mark_app_update_finished(result: &str, error: Option<String>) {
    update_status_slot(
        &LAST_APP_UPDATE_RESULT,
        Some(result.to_string()),
    );
    update_status_slot(&LAST_APP_UPDATE_ERROR, error);
    update_status_slot(
        &LAST_APP_UPDATE_AT,
        Some(current_update_timestamp()),
    );
}


fn helper_is_running() -> bool {
    Client::builder()
        .connect_timeout(Duration::from_millis(500))
        .timeout(Duration::from_millis(900))
        .build()
        .ok()
        .and_then(|client| {
            client
                .get(format!("http://{API_ADDRESS}/status"))
                .send()
                .ok()
        })
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

fn ensure_background_helper_running() {
    if helper_is_running() {
        return;
    }

    let executable = match std::env::current_exe() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("Unable to locate NAIADD Offline Helper executable: {error}");
            return;
        }
    };

    if let Err(error) = Command::new(executable).spawn() {
        eprintln!("Unable to start NAIADD Offline Helper background service: {error}");
        return;
    }

    for _ in 0..30 {
        if helper_is_running() {
            return;
        }

        thread::sleep(Duration::from_millis(100));
    }
}

fn production_app_is_reachable() -> bool {
    Client::builder()
        .connect_timeout(Duration::from_secs(LAUNCH_PROBE_TIMEOUT_SECONDS))
        .timeout(Duration::from_secs(LAUNCH_PROBE_TIMEOUT_SECONDS))
        .user_agent(format!("NAIADD-Offline-Helper/{HELPER_VERSION}"))
        .build()
        .ok()
        .and_then(|client| {
            client
                .get(REMOTE_APP_MANIFEST_URL)
                .send()
                .ok()
        })
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn open_default_browser(url: &str) -> Result<(), String> {
    Command::new("explorer.exe")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "windows"))]
fn open_default_browser(_url: &str) -> Result<(), String> {
    Err("NAIADD workstation launching is only supported on Windows.".to_string())
}

pub fn launch_naiadd() {
    /*
     * The visible desktop shortcut calls the helper with --launch-naiadd.
     * Ensure the invisible background service exists first so the local
     * fallback is immediately available even if Windows autostart was blocked.
     */
    ensure_background_helper_running();

    let launch_url = if production_app_is_reachable() {
        PRODUCTION_LAUNCH_URL
    } else {
        LOCAL_LAUNCH_URL
    };

    if let Err(error) = open_default_browser(launch_url) {
        eprintln!("Unable to open NAIADD at {launch_url}: {error}");
    }
}


fn request_header_value(headers: &str, requested_name: &str) -> Option<String> {
    headers.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;

        if name.trim().eq_ignore_ascii_case(requested_name) {
            Some(value.trim().to_string())
        } else {
            None
        }
    })
}


fn navigator_origin_allowed_for_app_update(headers: &str) -> bool {
    let origin = request_header_value(headers, "origin");
    let host = request_header_value(headers, "host")
        .unwrap_or_default()
        .to_ascii_lowercase();

    match origin.as_deref() {
        Some("https://naiadd.vercel.app") => true,
        Some("http://127.0.0.1:43128") => true,
        Some("http://localhost:43128") => true,
        Some("http://localhost:5173") => true,
        Some("http://localhost:1420") => true,
        Some(_) => false,
        None => {
            host == "127.0.0.1:43128"
                || host == "localhost:43128"
        }
    }
}

fn credential_request_allowed(headers: &str) -> bool {
    let origin = request_header_value(headers, "origin");
    let host = request_header_value(headers, "host")
        .unwrap_or_default()
        .to_ascii_lowercase();

    match origin.as_deref() {
        Some("https://naiadd.vercel.app") => true,
        Some("http://127.0.0.1:43128") => true,
        Some("http://localhost:43128") => true,
        Some("http://localhost:5173") => true,
        Some("http://localhost:1420") => true,
        Some(_) => false,
        None => {
            host == "127.0.0.1:43128"
                || host == "localhost:43128"
        }
    }
}

fn read_offline_profile_email() -> Option<String> {
    let bytes = fs::read(user_profile_path()).ok()?;
    let value = serde_json::from_slice::<serde_json::Value>(&bytes).ok()?;
    value
        .get("email")
        .and_then(|email| email.as_str())
        .map(str::trim)
        .filter(|email| !email.is_empty())
        .map(ToOwned::to_owned)
}

fn credential_entry(email: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(WINDOWS_CREDENTIAL_SERVICE, email)
        .map_err(|error| error.to_string())
}

fn save_windows_workstation_credential(
    email: &str,
    password: &str,
) -> Result<(), String> {
    if email.trim().is_empty() || password.is_empty() {
        return Err("Email and password are required.".to_string());
    }

    credential_entry(email.trim())?
        .set_password(password)
        .map_err(|error| error.to_string())
}

fn read_windows_workstation_credential() -> Result<Option<(String, String)>, String> {
    let email = match read_offline_profile_email() {
        Some(email) => email,
        None => return Ok(None),
    };

    let entry = credential_entry(&email)?;

    match entry.get_password() {
        Ok(password) => Ok(Some((email, password))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn delete_windows_workstation_credential() -> Result<(), String> {
    let email = match read_offline_profile_email() {
        Some(email) => email,
        None => return Ok(()),
    };

    let entry = credential_entry(&email)?;

    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}


fn snapshot_key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(
        WINDOWS_SNAPSHOT_KEY_SERVICE,
        WINDOWS_SNAPSHOT_KEY_ACCOUNT,
    )
    .map_err(|error| error.to_string())
}

fn save_windows_snapshot_key(snapshot_key: &str) -> Result<(), String> {
    let key = snapshot_key.trim();

    if key.len() != 128 || !key.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("Snapshot key must be a 128-character hexadecimal key.".to_string());
    }

    snapshot_key_entry()?
        .set_password(key)
        .map_err(|error| error.to_string())
}

fn read_windows_snapshot_key() -> Result<Option<String>, String> {
    let entry = snapshot_key_entry()?;

    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn workspace_path() -> PathBuf {
    PathBuf::from(WORKSPACE_PATH)
}

fn snapshot_path() -> PathBuf {
    workspace_path().join(SNAPSHOT_FILENAME)
}

fn snapshot_meta_path() -> PathBuf {
    workspace_path().join(SNAPSHOT_META_FILENAME)
}

fn snapshot_index_path() -> PathBuf {
    workspace_path().join(SNAPSHOT_INDEX_FILENAME)
}

fn app_path() -> PathBuf {
    workspace_path().join(APP_FOLDER)
}

fn app_manifest_path() -> PathBuf {
    app_path().join(APP_MANIFEST_FILENAME)
}

fn user_profile_path() -> PathBuf {
    workspace_path().join(USER_PROFILE_FILENAME)
}

fn survey_state_path() -> PathBuf {
    workspace_path().join(SURVEY_STATE_FILENAME)
}

fn saved_queries_path() -> PathBuf {
    workspace_path().join(SAVED_QUERIES_FILENAME)
}

fn theme_state_path() -> PathBuf {
    workspace_path().join(THEME_STATE_FILENAME)
}

fn ensure_workspace() -> (bool, bool) {
    let path = workspace_path();

    if fs::create_dir_all(&path).is_err() {
        return (path.exists(), false);
    }

    let probe = path.join(".naiadd_write_test");

    let writable = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&probe)
        .and_then(|mut file| file.write_all(b"NAIADD"))
        .is_ok();

    let _ = fs::remove_file(probe);

    (path.exists(), writable)
}

fn copy_dir_recursive(source: &Path, target: &Path) -> std::io::Result<()> {
    if !source.exists() {
        return Ok(());
    }

    fs::create_dir_all(target)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());

        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)?;
            }

            fs::copy(&source_path, &target_path)?;
        }
    }

    Ok(())
}

fn install_bundled_offline_app(resource_dir: &Path) -> std::io::Result<()> {
    let destination = app_path();

    // Never overwrite a newer app that the background updater already installed.
    if destination.join("index.html").is_file() {
        return Ok(());
    }

    let bundled = resource_dir.join("naiadd-app");

    if !bundled.join("index.html").is_file() {
        eprintln!(
            "Bundled NAIADD app was not found at {}",
            bundled.display()
        );
        return Ok(());
    }

    let staging = workspace_path().join("app.new");
    let old = workspace_path().join("app.old");

    let _ = fs::remove_dir_all(&staging);
    let _ = fs::remove_dir_all(&old);

    copy_dir_recursive(&bundled, &staging)?;

    if destination.exists() {
        fs::rename(&destination, &old)?;
    }

    if let Err(error) = fs::rename(&staging, &destination) {
        if old.exists() && !destination.exists() {
            let _ = fs::rename(&old, &destination);
        }
        return Err(error);
    }

    let _ = fs::remove_dir_all(old);

    Ok(())
}

fn read_local_app_manifest() -> Option<OfflineAppManifest> {
    let bytes = fs::read(app_manifest_path()).ok()?;
    serde_json::from_slice::<OfflineAppManifest>(&bytes).ok()
}

fn safe_manifest_relative_path(value: &str) -> Option<PathBuf> {
    if value.trim().is_empty() {
        return None;
    }

    let path = Path::new(value);

    if path.is_absolute() {
        return None;
    }

    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir
                | Component::RootDir
                | Component::Prefix(_)
        )
    }) {
        return None;
    }

    Some(path.to_path_buf())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn production_file_url(relative_path: &str) -> Result<reqwest::Url, String> {
    let base = reqwest::Url::parse(&format!("{PRODUCTION_APP_BASE_URL}/"))
        .map_err(|error| error.to_string())?;

    base.join(relative_path)
        .map_err(|error| error.to_string())
}


fn local_app_matches_manifest(
    manifest: &OfflineAppManifest,
) -> Result<bool, String> {
    if manifest.files.is_empty() {
        return Ok(false);
    }

    for file in &manifest.files {
        let relative_path = match safe_manifest_relative_path(&file.path) {
            Some(path) => path,
            None => return Ok(false),
        };

        let local_path = app_path().join(relative_path);

        let metadata = match fs::metadata(&local_path) {
            Ok(metadata) => metadata,
            Err(_) => return Ok(false),
        };

        if !metadata.is_file() || metadata.len() != file.size {
            return Ok(false);
        }

        let bytes = match fs::read(&local_path) {
            Ok(bytes) => bytes,
            Err(_) => return Ok(false),
        };

        if sha256_hex(&bytes) != file.sha256.to_lowercase() {
            return Ok(false);
        }
    }

    Ok(true)
}

fn update_offline_app_from_production() -> Result<bool, String> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(30))
        .user_agent(format!("NAIADD-Offline-Helper/{HELPER_VERSION}"))
        .build()
        .map_err(|error| error.to_string())?;

    let manifest_url = format!(
        "{}?naiadd_helper_version={}&ts={}",
        REMOTE_APP_MANIFEST_URL,
        HELPER_VERSION,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default(),
    );

    let remote_manifest = client
        .get(manifest_url)
        .header("Cache-Control", "no-cache, no-store, max-age=0")
        .header("Pragma", "no-cache")
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| error.to_string())?
        .json::<OfflineAppManifest>()
        .map_err(|error| error.to_string())?;

    if remote_manifest.format != "NAIADD_OFFLINE_APP_MANIFEST_V1" {
        return Err("Unsupported NAIADD offline application manifest.".to_string());
    }

    if remote_manifest.files.is_empty() {
        return Err("Production NAIADD application manifest contains no files.".to_string());
    }

    if let Some(local_manifest) = read_local_app_manifest() {
        if local_manifest.version == remote_manifest.version {
            match local_app_matches_manifest(&remote_manifest) {
                Ok(true) => {
                    return Ok(false);
                }
                Ok(false) => {
                    eprintln!(
                        "NAIADD offline app manifest is current, but local files are stale or incomplete. Repairing installation."
                    );
                }
                Err(error) => {
                    eprintln!(
                        "Unable to verify current NAIADD offline app files: {error}. Repairing installation."
                    );
                }
            }
        }
    }

    let staging = workspace_path().join("app.update");
    let destination = app_path();
    let previous = workspace_path().join("app.previous");

    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|error| error.to_string())?;

    for file in &remote_manifest.files {
        let relative_path = safe_manifest_relative_path(&file.path)
            .ok_or_else(|| format!("Unsafe application path: {}", file.path))?;

        let url = production_file_url(&file.path)?;

        let bytes = client
            .get(url)
            .header("Cache-Control", "no-cache")
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|error| {
                format!("Unable to download {}: {error}", file.path)
            })?
            .bytes()
            .map_err(|error| error.to_string())?;

        if bytes.len() as u64 != file.size {
            let _ = fs::remove_dir_all(&staging);
            return Err(format!(
                "Downloaded file size did not match for {}.",
                file.path
            ));
        }

        if sha256_hex(&bytes) != file.sha256.to_lowercase() {
            let _ = fs::remove_dir_all(&staging);
            return Err(format!(
                "Downloaded file checksum did not match for {}.",
                file.path
            ));
        }

        let output_path = staging.join(relative_path);

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        fs::write(output_path, &bytes).map_err(|error| error.to_string())?;
    }

    if !staging.join("index.html").is_file() {
        let _ = fs::remove_dir_all(&staging);
        return Err("Downloaded NAIADD application is missing index.html.".to_string());
    }

    /*
     * Verify the complete staged application before touching the working copy.
     * The manifest is intentionally written LAST, after every production file
     * has been downloaded and validated. This prevents a partial update from
     * ever advertising itself as current.
     */
    for file in &remote_manifest.files {
        let relative_path = safe_manifest_relative_path(&file.path)
            .ok_or_else(|| format!("Unsafe application path: {}", file.path))?;
        let staged_path = staging.join(relative_path);

        let metadata = fs::metadata(&staged_path)
            .map_err(|error| format!("Missing staged file {}: {error}", file.path))?;

        if !metadata.is_file() || metadata.len() != file.size {
            let _ = fs::remove_dir_all(&staging);
            return Err(format!(
                "Staged file size did not match for {}.",
                file.path
            ));
        }

        let bytes = fs::read(&staged_path)
            .map_err(|error| format!("Unable to verify staged file {}: {error}", file.path))?;

        if sha256_hex(&bytes) != file.sha256.to_lowercase() {
            let _ = fs::remove_dir_all(&staging);
            return Err(format!(
                "Staged file checksum did not match for {}.",
                file.path
            ));
        }
    }

    let manifest_bytes =
        serde_json::to_vec_pretty(&remote_manifest).map_err(|error| error.to_string())?;

    fs::write(staging.join(APP_MANIFEST_FILENAME), manifest_bytes)
        .map_err(|error| error.to_string())?;

    let _ = fs::remove_dir_all(&previous);

    if destination.exists() {
        fs::rename(&destination, &previous).map_err(|error| error.to_string())?;
    }

    if let Err(error) = fs::rename(&staging, &destination) {
        if previous.exists() && !destination.exists() {
            let _ = fs::rename(&previous, &destination);
        }

        return Err(error.to_string());
    }

    match local_app_matches_manifest(&remote_manifest) {
        Ok(true) => {
            let _ = fs::remove_dir_all(previous);

            println!(
                "Updated offline NAIADD application to production version {}.",
                remote_manifest.version
            );

            Ok(true)
        }
        Ok(false) => {
            let _ = fs::remove_dir_all(&destination);

            if previous.exists() {
                let _ = fs::rename(&previous, &destination);
            }

            Err(
                "Updated NAIADD application failed final integrity verification; previous version restored."
                    .to_string(),
            )
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&destination);

            if previous.exists() {
                let _ = fs::rename(&previous, &destination);
            }

            Err(format!(
                "Unable to verify updated NAIADD application: {error}. Previous version restored."
            ))
        }
    }
}


fn trigger_app_update() -> bool {
    if APP_UPDATE_IN_PROGRESS
        .compare_exchange(
            false,
            true,
            Ordering::SeqCst,
            Ordering::SeqCst,
        )
        .is_err()
    {
        return false;
    }

    mark_app_update_started();

    thread::spawn(|| {
        match update_offline_app_from_production() {
            Ok(true) => {
                mark_app_update_finished("updated", None);
            }
            Ok(false) => {
                mark_app_update_finished("current", None);
            }
            Err(error) => {
                eprintln!(
                    "Immediate NAIADD production app update failed: {error}"
                );
                mark_app_update_finished(
                    "failed",
                    Some(error),
                );
            }
        }

        APP_UPDATE_IN_PROGRESS.store(false, Ordering::SeqCst);
    });

    true
}

fn start_app_update_watcher() {
    thread::spawn(|| loop {
        let _ = trigger_app_update();

        thread::sleep(Duration::from_secs(
            APP_UPDATE_INTERVAL_SECONDS,
        ));
    });
}

fn status() -> HelperStatus {
    let (workspace_exists, workspace_writable) = ensure_workspace();

    HelperStatus {
        ok: true,
        helper: "NAIADD Offline Helper",
        version: HELPER_VERSION,
        workspace_path: WORKSPACE_PATH.to_string(),
        workspace_exists,
        workspace_writable,
        snapshot_exists: snapshot_path().is_file(),
        offline_app_exists: app_path().join("index.html").is_file(),
        offline_app_url: format!("http://{API_ADDRESS}/"),
        offline_app_version: read_local_app_manifest()
            .map(|manifest| manifest.version),
        app_update_in_progress: APP_UPDATE_IN_PROGRESS.load(Ordering::SeqCst),
        last_app_update_result: read_status_slot(&LAST_APP_UPDATE_RESULT),
        last_app_update_error: read_status_slot(&LAST_APP_UPDATE_ERROR),
        last_app_update_at: read_status_slot(&LAST_APP_UPDATE_AT),
    }
}

fn write_response(
    mut stream: TcpStream,
    status_line: &str,
    content_type: &str,
    body: &[u8],
) {
    let headers = format!(
        "{status_line}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {}\r\n\
         Cache-Control: no-store\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, PUT, POST, DELETE, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type\r\n\
         Connection: close\r\n\
         \r\n",
        body.len()
    );

    let _ = stream.write_all(headers.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn write_json_response(
    stream: TcpStream,
    status_line: &str,
    body: &str,
) {
    write_response(
        stream,
        status_line,
        "application/json; charset=utf-8",
        body.as_bytes(),
    );
}

fn content_length(headers: &str) -> usize {
    headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;

            if name.trim().eq_ignore_ascii_case("content-length") {
                value.trim().parse::<usize>().ok()
            } else {
                None
            }
        })
        .unwrap_or(0)
}

fn read_http_request(
    stream: &mut TcpStream,
) -> Result<Vec<u8>, String> {
    let mut request = Vec::<u8>::new();
    let mut buffer = [0_u8; 8192];
    let mut expected_total: Option<usize> = None;

    loop {
        let bytes_read = stream
            .read(&mut buffer)
            .map_err(|error| {
                format!("Unable to read request: {error}")
            })?;

        if bytes_read == 0 {
            break;
        }

        request.extend_from_slice(&buffer[..bytes_read]);

        if request.len() > MAX_REQUEST_BYTES {
            return Err("Request is too large.".to_string());
        }

        if expected_total.is_none() {
            if let Some(position) = request
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
            {
                let end = position + 4;
                let headers =
                    String::from_utf8_lossy(&request[..end]);

                expected_total = Some(
                    end.saturating_add(
                        content_length(&headers),
                    ),
                );
            }
        }

        if let Some(total) = expected_total {
            if request.len() >= total {
                request.truncate(total);
                break;
            }
        }
    }

    Ok(request)
}

fn request_body(request: &[u8]) -> &[u8] {
    if let Some(position) = request
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
    {
        &request[(position + 4)..]
    } else {
        &[]
    }
}

fn content_type_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
    {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "webmanifest" => {
            "application/json; charset=utf-8"
        }
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "wasm" => "application/wasm",
        "map" => "application/json; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn safe_app_file(url_path: &str) -> PathBuf {
    let relative = url_path
        .trim_start_matches('/')
        .split('?')
        .next()
        .unwrap_or("");

    if relative.is_empty() {
        return app_path().join("index.html");
    }

    let candidate = app_path().join(relative);

    if candidate.is_file() {
        candidate
    } else {
        app_path().join("index.html")
    }
}

fn serve_app(stream: TcpStream, url_path: &str) {
    let file = safe_app_file(url_path);

    if !file.is_file() {
        write_json_response(
            stream,
            "HTTP/1.1 404 Not Found",
            r#"{"ok":false,"error":"Offline NAIADD application is not installed."}"#,
        );
        return;
    }

    match fs::read(&file) {
        Ok(bytes) => write_response(
            stream,
            "HTTP/1.1 200 OK",
            content_type_for(&file),
            &bytes,
        ),
        Err(error) => write_json_response(
            stream,
            "HTTP/1.1 500 Internal Server Error",
            &format!(
                r#"{{"ok":false,"error":{}}}"#,
                serde_json::to_string(&error.to_string()).unwrap()
            ),
        ),
    }
}

fn serve_json_file(
    stream: TcpStream,
    path: PathBuf,
    missing_message: &str,
) {
    if !path.is_file() {
        write_json_response(
            stream,
            "HTTP/1.1 404 Not Found",
            &format!(
                r#"{{"ok":false,"error":{}}}"#,
                serde_json::to_string(missing_message).unwrap()
            ),
        );
        return;
    }

    match fs::read(&path) {
        Ok(bytes) => write_response(
            stream,
            "HTTP/1.1 200 OK",
            "application/json; charset=utf-8",
            &bytes,
        ),
        Err(error) => write_json_response(
            stream,
            "HTTP/1.1 500 Internal Server Error",
            &format!(
                r#"{{"ok":false,"error":{}}}"#,
                serde_json::to_string(&error.to_string()).unwrap()
            ),
        ),
    }
}

fn save_json_file(
    stream: TcpStream,
    request: &[u8],
    final_path: PathBuf,
    file_name: &str,
) {
    let (_, writable) = ensure_workspace();

    if !writable {
        write_json_response(
            stream,
            "HTTP/1.1 500 Internal Server Error",
            r#"{"ok":false,"error":"C:\\TSE\\NAIADD2 is not writable."}"#,
        );
        return;
    }

    let body = request_body(request);

    if body.is_empty() {
        write_json_response(
            stream,
            "HTTP/1.1 400 Bad Request",
            r#"{"ok":false,"error":"Request body is empty."}"#,
        );
        return;
    }

    if serde_json::from_slice::<serde_json::Value>(body).is_err() {
        write_json_response(
            stream,
            "HTTP/1.1 400 Bad Request",
            r#"{"ok":false,"error":"Payload is not valid JSON."}"#,
        );
        return;
    }

    let temp_path = workspace_path().join(format!("{file_name}.tmp"));

    let save_result = fs::write(&temp_path, body).and_then(|_| {
        if final_path.exists() {
            fs::remove_file(&final_path)?;
        }

        fs::rename(&temp_path, &final_path)
    });

    match save_result {
        Ok(_) => write_json_response(
            stream,
            "HTTP/1.1 200 OK",
            r#"{"ok":true,"saved":true}"#,
        ),
        Err(error) => {
            let _ = fs::remove_file(&temp_path);

            write_json_response(
                stream,
                "HTTP/1.1 500 Internal Server Error",
                &format!(
                    r#"{{"ok":false,"error":{}}}"#,
                    serde_json::to_string(&error.to_string()).unwrap()
                ),
            );
        }
    }
}


fn serve_binary_file(stream: TcpStream, path: PathBuf, missing_message: &str) {
    if !path.is_file() {
        write_json_response(
            stream,
            "HTTP/1.1 404 Not Found",
            &serde_json::json!({"ok":false,"error":missing_message}).to_string(),
        );
        return;
    }

    match fs::read(&path) {
        Ok(bytes) => write_response(
            stream,
            "HTTP/1.1 200 OK",
            "application/octet-stream",
            &bytes,
        ),
        Err(error) => write_json_response(
            stream,
            "HTTP/1.1 500 Internal Server Error",
            &serde_json::json!({"ok":false,"error":error.to_string()}).to_string(),
        ),
    }
}

fn save_binary_file(stream: TcpStream, request: &[u8], final_path: PathBuf, file_name: &str) {
    let (_, writable) = ensure_workspace();

    if !writable {
        write_json_response(
            stream,
            "HTTP/1.1 500 Internal Server Error",
            r#"{"ok":false,"error":"C:\\TSE\\NAIADD is not writable."}"#,
        );
        return;
    }

    let body = request_body(request);
    if body.is_empty() {
        write_json_response(
            stream,
            "HTTP/1.1 400 Bad Request",
            r#"{"ok":false,"error":"Request body is empty."}"#,
        );
        return;
    }

    let temp_path = workspace_path().join(format!("{file_name}.tmp"));
    let save_result = fs::write(&temp_path, body).and_then(|_| {
        if final_path.exists() {
            fs::remove_file(&final_path)?;
        }
        fs::rename(&temp_path, &final_path)
    });

    match save_result {
        Ok(_) => write_json_response(
            stream,
            "HTTP/1.1 200 OK",
            r#"{"ok":true,"saved":true}"#,
        ),
        Err(error) => {
            let _ = fs::remove_file(&temp_path);
            write_json_response(
                stream,
                "HTTP/1.1 500 Internal Server Error",
                &serde_json::json!({"ok":false,"error":error.to_string()}).to_string(),
            );
        }
    }
}

fn handle_client(mut stream: TcpStream) {
    let request = match read_http_request(&mut stream) {
        Ok(request) => request,
        Err(error) => {
            write_json_response(
                stream,
                "HTTP/1.1 413 Payload Too Large",
                &format!(
                    r#"{{"ok":false,"error":{}}}"#,
                    serde_json::to_string(&error).unwrap()
                ),
            );
            return;
        }
    };

    let header_end = request
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .unwrap_or(request.len());

    let headers =
        String::from_utf8_lossy(&request[..header_end]);

    let request_line =
        headers.lines().next().unwrap_or_default();

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let url_path = parts.next().unwrap_or_default();

    if method == "OPTIONS" {
        if url_path == WORKSTATION_CREDENTIAL_PATH
            && !credential_request_allowed(&headers)
        {
            write_json_response(
                stream,
                "HTTP/1.1 403 Forbidden",
                r#"{"ok":false,"error":"Credential access is not allowed from this origin."}"#,
            );
            return;
        }

        if url_path == SNAPSHOT_KEY_PATH
            && !credential_request_allowed(&headers)
        {
            write_json_response(
                stream,
                "HTTP/1.1 403 Forbidden",
                r#"{"ok":false,"error":"Snapshot-key access is not allowed from this origin."}"#,
            );
            return;
        }

        if url_path == APP_UPDATE_PATH
            && !navigator_origin_allowed_for_app_update(&headers)
        {
            write_json_response(
                stream,
                "HTTP/1.1 403 Forbidden",
                r#"{"ok":false,"error":"App update access is not allowed from this origin."}"#,
            );
            return;
        }

        write_response(
            stream,
            "HTTP/1.1 204 No Content",
            "text/plain",
            b"",
        );
        return;
    }

    if method == "GET" && url_path == "/status" {
        match serde_json::to_string(&status()) {
            Ok(body) => {
                write_json_response(
                    stream,
                    "HTTP/1.1 200 OK",
                    &body,
                );
            }
            Err(_) => {
                write_json_response(
                    stream,
                    "HTTP/1.1 500 Internal Server Error",
                    r#"{"ok":false}"#,
                );
            }
        }

        return;
    }

    if method == "POST" && url_path == APP_UPDATE_PATH {
        if !navigator_origin_allowed_for_app_update(&headers) {
            write_json_response(
                stream,
                "HTTP/1.1 403 Forbidden",
                r#"{"ok":false,"error":"App update access is not allowed from this origin."}"#,
            );
            return;
        }

        let started = trigger_app_update();

        let body = serde_json::json!({
            "ok": true,
            "started": started,
            "alreadyRunning": !started,
        });

        write_json_response(
            stream,
            "HTTP/1.1 202 Accepted",
            &body.to_string(),
        );
        return;
    }

    if url_path == WORKSTATION_CREDENTIAL_PATH {
        if !credential_request_allowed(&headers) {
            write_json_response(
                stream,
                "HTTP/1.1 403 Forbidden",
                r#"{"ok":false,"error":"Credential access is not allowed from this origin."}"#,
            );
            return;
        }

        if method == "GET" {
            match read_windows_workstation_credential() {
                Ok(Some((email, password))) => {
                    let body = serde_json::json!({
                        "ok": true,
                        "email": email,
                        "password": password,
                    });

                    write_json_response(
                        stream,
                        "HTTP/1.1 200 OK",
                        &body.to_string(),
                    );
                }
                Ok(None) => {
                    write_json_response(
                        stream,
                        "HTTP/1.1 404 Not Found",
                        r#"{"ok":false,"error":"No saved workstation credential is available."}"#,
                    );
                }
                Err(error) => {
                    write_json_response(
                        stream,
                        "HTTP/1.1 500 Internal Server Error",
                        &serde_json::json!({
                            "ok": false,
                            "error": error,
                        })
                        .to_string(),
                    );
                }
            }

            return;
        }

        if method == "PUT" {
            let body = request_body(&request);

            let payload = match serde_json::from_slice::<
                WorkstationCredentialRequest,
            >(body)
            {
                Ok(payload) => payload,
                Err(_) => {
                    write_json_response(
                        stream,
                        "HTTP/1.1 400 Bad Request",
                        r#"{"ok":false,"error":"Credential payload is invalid."}"#,
                    );
                    return;
                }
            };

            match save_windows_workstation_credential(
                payload.email.trim(),
                &payload.password,
            ) {
                Ok(()) => {
                    write_json_response(
                        stream,
                        "HTTP/1.1 200 OK",
                        r#"{"ok":true,"saved":true}"#,
                    );
                }
                Err(error) => {
                    write_json_response(
                        stream,
                        "HTTP/1.1 500 Internal Server Error",
                        &serde_json::json!({
                            "ok": false,
                            "error": error,
                        })
                        .to_string(),
                    );
                }
            }

            return;
        }

        if method == "DELETE" {
            match delete_windows_workstation_credential() {
                Ok(()) => {
                    write_json_response(
                        stream,
                        "HTTP/1.1 200 OK",
                        r#"{"ok":true,"deleted":true}"#,
                    );
                }
                Err(error) => {
                    write_json_response(
                        stream,
                        "HTTP/1.1 500 Internal Server Error",
                        &serde_json::json!({
                            "ok": false,
                            "error": error,
                        })
                        .to_string(),
                    );
                }
            }

            return;
        }
    }

    if url_path == SNAPSHOT_KEY_PATH {
        if !credential_request_allowed(&headers) {
            write_json_response(
                stream,
                "HTTP/1.1 403 Forbidden",
                r#"{"ok":false,"error":"Snapshot-key access is not allowed from this origin."}"#,
            );
            return;
        }

        if method == "GET" {
            match read_windows_snapshot_key() {
                Ok(Some(snapshot_key)) => {
                    write_json_response(
                        stream,
                        "HTTP/1.1 200 OK",
                        &serde_json::json!({
                            "ok": true,
                            "snapshotKey": snapshot_key,
                        }).to_string(),
                    );
                }
                Ok(None) => {
                    write_json_response(
                        stream,
                        "HTTP/1.1 404 Not Found",
                        r#"{"ok":false,"error":"No saved snapshot key is available."}"#,
                    );
                }
                Err(error) => {
                    write_json_response(
                        stream,
                        "HTTP/1.1 500 Internal Server Error",
                        &serde_json::json!({
                            "ok": false,
                            "error": error,
                        }).to_string(),
                    );
                }
            }
            return;
        }

        if method == "PUT" {
            let payload = match serde_json::from_slice::<SnapshotKeyRequest>(
                request_body(&request),
            ) {
                Ok(payload) => payload,
                Err(_) => {
                    write_json_response(
                        stream,
                        "HTTP/1.1 400 Bad Request",
                        r#"{"ok":false,"error":"Snapshot-key payload is invalid."}"#,
                    );
                    return;
                }
            };

            match save_windows_snapshot_key(&payload.snapshot_key) {
                Ok(()) => write_json_response(
                    stream,
                    "HTTP/1.1 200 OK",
                    r#"{"ok":true,"saved":true}"#,
                ),
                Err(error) => write_json_response(
                    stream,
                    "HTTP/1.1 500 Internal Server Error",
                    &serde_json::json!({
                        "ok": false,
                        "error": error,
                    }).to_string(),
                ),
            }
            return;
        }
    }

    if method == "GET" && url_path == "/user-profile" {
        serve_json_file(
            stream,
            user_profile_path(),
            "No offline user profile has been saved yet.",
        );
        return;
    }

    if method == "PUT" && url_path == "/user-profile" {
        save_json_file(
            stream,
            &request,
            user_profile_path(),
            USER_PROFILE_FILENAME,
        );
        return;
    }

    if method == "GET" && url_path == "/survey-state" {
        serve_json_file(
            stream,
            survey_state_path(),
            "No offline survey state has been saved yet.",
        );
        return;
    }

    if method == "PUT" && url_path == "/survey-state" {
        save_json_file(
            stream,
            &request,
            survey_state_path(),
            SURVEY_STATE_FILENAME,
        );
        return;
    }

    if method == "GET" && url_path == "/saved-queries" {
        serve_json_file(
            stream,
            saved_queries_path(),
            "No offline saved queries have been saved yet.",
        );
        return;
    }

    if method == "PUT" && url_path == "/saved-queries" {
        save_json_file(
            stream,
            &request,
            saved_queries_path(),
            SAVED_QUERIES_FILENAME,
        );
        return;
    }

    if method == "GET" && url_path == "/theme-state" {
        serve_json_file(
            stream,
            theme_state_path(),
            "No offline theme state has been saved yet.",
        );
        return;
    }

    if method == "PUT" && url_path == "/theme-state" {
        save_json_file(
            stream,
            &request,
            theme_state_path(),
            THEME_STATE_FILENAME,
        );
        return;
    }

    if method == "GET" && url_path == "/snapshot" {
        serve_binary_file(stream, snapshot_path(), "No offline snapshot has been saved yet.");
        return;
    }

    if method == "PUT" && url_path == "/snapshot" {
        save_binary_file(stream, &request, snapshot_path(), SNAPSHOT_FILENAME);
        return;
    }

    if method == "GET" && url_path == "/snapshot-meta" {
        serve_json_file(stream, snapshot_meta_path(), "No offline snapshot metadata has been saved yet.");
        return;
    }

    if method == "PUT" && url_path == "/snapshot-meta" {
        save_json_file(stream, &request, snapshot_meta_path(), SNAPSHOT_META_FILENAME);
        return;
    }

    if method == "GET" && url_path == "/snapshot-index" {
        serve_binary_file(stream, snapshot_index_path(), "No offline snapshot index has been saved yet.");
        return;
    }

    if method == "PUT" && url_path == "/snapshot-index" {
        save_binary_file(stream, &request, snapshot_index_path(), SNAPSHOT_INDEX_FILENAME);
        return;
    }

    if method == "GET" {
        serve_app(stream, url_path);
        return;
    }

    write_json_response(
        stream,
        "HTTP/1.1 404 Not Found",
        r#"{"error":"Not found"}"#,
    );
}

fn start_local_api() {
    thread::spawn(|| {
        let listener =
            match TcpListener::bind(API_ADDRESS) {
                Ok(listener) => listener,
                Err(error) => {
                    eprintln!(
                        "Unable to start NAIADD helper API on {API_ADDRESS}: {error}"
                    );
                    return;
                }
            };

        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    thread::spawn(|| {
                        handle_client(stream)
                    });
                }
                Err(error) => {
                    eprintln!(
                        "NAIADD helper connection failed: {error}"
                    );
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = ensure_workspace();

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            #[cfg(desktop)]
            {
                if let Err(error) = app.autolaunch().enable() {
                    eprintln!(
                        "Unable to enable NAIADD Offline Helper autostart: {error}"
                    );
                }
            }

            match app.path().resource_dir() {
                Ok(resource_dir) => {
                    if let Err(error) =
                        install_bundled_offline_app(
                            &resource_dir,
                        )
                    {
                        eprintln!(
                            "Unable to install bundled NAIADD offline app: {error}"
                        );
                    }
                }
                Err(error) => {
                    eprintln!(
                        "Unable to locate NAIADD helper resource directory: {error}"
                    );
                }
            }

            start_local_api();
            start_app_update_watcher();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect(
            "error while running NAIADD Offline Helper",
        );
}
