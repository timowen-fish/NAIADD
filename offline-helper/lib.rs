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
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const HELPER_VERSION: &str = "1.0.0";
const API_ADDRESS: &str = "127.0.0.1:43128";
const WORKSPACE_PATH: &str = r"C:\TSE\NAIADD";

const PRODUCTION_APP_BASE_URL: &str = "https://naiadd.vercel.app";
const REMOTE_APP_MANIFEST_URL: &str =
    "https://naiadd.vercel.app/offline-app-manifest.json";
const APP_MANIFEST_FILENAME: &str = "offline-app-manifest.json";
const PRODUCTION_LAUNCH_URL: &str = "https://naiadd.vercel.app/";
const LOCAL_LAUNCH_URL: &str = "http://127.0.0.1:43128/?session=offline";
const SESSION_CHOOSER_URL: &str = "http://127.0.0.1:43128/session";

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
const HELPER_SHUTDOWN_PATH: &str = "/shutdown";
const HELPER_IDLE_TIMEOUT: Duration = Duration::from_secs(90 * 60);
const HELPER_IDLE_CHECK_INTERVAL: Duration = Duration::from_secs(30);

static APP_UPDATE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static LAST_HELPER_ACTIVITY_MS: OnceLock<std::sync::atomic::AtomicU64> = OnceLock::new();
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

#[derive(Debug, Deserialize)]
struct HelperProbeStatus {
    ok: bool,
    version: String,
}

fn current_unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn helper_activity_slot() -> &'static std::sync::atomic::AtomicU64 {
    LAST_HELPER_ACTIVITY_MS.get_or_init(|| {
        std::sync::atomic::AtomicU64::new(current_unix_millis())
    })
}

fn mark_helper_activity() {
    helper_activity_slot().store(current_unix_millis(), Ordering::SeqCst);
}

fn helper_idle_for() -> Duration {
    let now = current_unix_millis();
    let last = helper_activity_slot().load(Ordering::SeqCst);
    Duration::from_millis(now.saturating_sub(last))
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


fn probe_running_helper() -> Option<HelperProbeStatus> {
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
        .and_then(|response| {
            if response.status().is_success() {
                response.json::<HelperProbeStatus>().ok()
            } else {
                None
            }
        })
        .filter(|status| status.ok)
}

fn helper_is_running() -> bool {
    probe_running_helper().is_some()
}

fn request_running_helper_shutdown() -> bool {
    Client::builder()
        .connect_timeout(Duration::from_millis(500))
        .timeout(Duration::from_millis(1200))
        .build()
        .ok()
        .and_then(|client| {
            client
                .post(format!("http://{API_ADDRESS}{HELPER_SHUTDOWN_PATH}"))
                .send()
                .ok()
        })
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

fn ensure_background_helper_running() {
    if let Some(status) = probe_running_helper() {
        if status.version == HELPER_VERSION {
            return;
        }

        eprintln!(
            "A different NAIADD Offline Helper version is running ({}). Requesting shutdown before launching version {}.",
            status.version,
            HELPER_VERSION
        );

        if request_running_helper_shutdown() {
            for _ in 0..30 {
                if !helper_is_running() {
                    break;
                }

                thread::sleep(Duration::from_millis(100));
            }
        }

        if helper_is_running() {
            eprintln!(
                "The older NAIADD Offline Helper is still running and must be closed before the new helper can start."
            );
            return;
        }
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
        if let Some(status) = probe_running_helper() {
            if status.version == HELPER_VERSION {
                return;
            }
        }

        thread::sleep(Duration::from_millis(100));
    }
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
    ensure_background_helper_running();

    if let Err(error) = open_default_browser(SESSION_CHOOSER_URL) {
        eprintln!(
            "Unable to open the NAIADD session chooser at {SESSION_CHOOSER_URL}: {error}"
        );
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
        Some("http://localhost:1421") => true,
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
        Some("http://localhost:1421") => true,
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

    /*
     * NAIADD stores the durable workstation user as:
     *
     * {
     *   "format": "NAIADD_OFFLINE_USER_PROFILE_V1",
     *   "uid": "...",
     *   "updatedAt": "...",
     *   "profile": {
     *     "email": "user@example.com",
     *     ...
     *   }
     * }
     *
     * The original helper looked only for a top-level "email", which meant it
     * could SAVE a Windows credential after login but could never determine
     * which Credential Manager entry to READ on the next launch.
     *
     * Support the current nested NAIADD format and retain the top-level lookup
     * as a compatibility fallback for any older workstation profile files.
     */
    let email = value
        .get("profile")
        .and_then(|profile| profile.get("email"))
        .and_then(|email| email.as_str())
        .or_else(|| value.get("email").and_then(|email| email.as_str()))?;

    let email = email.trim();

    if email.is_empty() {
        None
    } else {
        Some(email.to_owned())
    }
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
    let bundled = resource_dir.join("naiadd-app");

    if destination.join("index.html").is_file() {
        let local_manifest = read_local_app_manifest();

        let bundled_manifest = fs::read(bundled.join(APP_MANIFEST_FILENAME))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<OfflineAppManifest>(&bytes).ok());

        if let (Some(local), Some(bundled_info)) = (&local_manifest, &bundled_manifest) {
            if local.version == bundled_info.version {
                return Ok(());
            }
        }
    }

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
        "avif" => "image/avif",
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


fn naiadd_shield_url() -> String {
    let assets = app_path().join("assets");

    if let Ok(entries) = fs::read_dir(assets) {
        for entry in entries.flatten() {
            let path = entry.path();

            if !path.is_file() {
                continue;
            }

            let file_name = match path.file_name().and_then(|value| value.to_str()) {
                Some(value) => value,
                None => continue,
            };

            let lower = file_name.to_ascii_lowercase();

            if lower.starts_with("naiadd-shield-")
                && (lower.ends_with(".png")
                    || lower.ends_with(".webp")
                    || lower.ends_with(".jpg")
                    || lower.ends_with(".jpeg"))
            {
                return format!("/assets/{file_name}");
            }
        }
    }

    "/apple-touch-icon.png".to_string()
}

fn naiadd_login_background_urls() -> Vec<String> {
    let assets = app_path().join("assets");
    let mut backgrounds = Vec::new();

    if let Ok(entries) = fs::read_dir(assets) {
        for entry in entries.flatten() {
            let path = entry.path();

            if !path.is_file() {
                continue;
            }

            let file_name = match path.file_name().and_then(|value| value.to_str()) {
                Some(value) => value,
                None => continue,
            };

            let lower = file_name.to_ascii_lowercase();
            let is_image = lower.ends_with(".jpg")
                || lower.ends_with(".jpeg")
                || lower.ends_with(".png")
                || lower.ends_with(".webp")
                || lower.ends_with(".avif");

            if !is_image || lower.contains("naiadd-shield") {
                continue;
            }

            let large_enough = fs::metadata(&path)
                .map(|metadata| metadata.len() >= 150_000)
                .unwrap_or(false);

            if large_enough {
                backgrounds.push(format!("/assets/{file_name}"));
            }
        }
    }

    backgrounds.sort();
    backgrounds
}

fn serve_session_chooser(stream: TcpStream) {
    let offline_available = app_path().join("index.html").is_file();
    let shield_url = naiadd_shield_url();
    let backgrounds_json =
        serde_json::to_string(&naiadd_login_background_urls()).unwrap_or_else(|_| "[]".to_string());

    let offline_note = if offline_available {
        "Server is not contacted. Drafts will need to be submitted during an online session."
    } else {
        "The offline application is not installed on this workstation yet."
    };

    let offline_class = if offline_available {
        "session-choice offline"
    } else {
        "session-choice offline disabled"
    };

    let offline_aria = if offline_available { "false" } else { "true" };

    let body = format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>NAIADD — Choose Session</title>
  <style>
    * {{ box-sizing: border-box; }}
    html, body {{
      margin: 0;
      min-height: 100%;
      font-family: Arial, Helvetica, sans-serif;
    }}
    body {{
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 34px;
      position: relative;
      overflow: hidden;
      color: white;
      background-color: #00121f;
      background-size: cover;
      background-position: 64% 40%;
      background-repeat: no-repeat;
    }}
    body::before {{
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(
          90deg,
          rgba(0, 18, 32, 0.94) 0%,
          rgba(0, 18, 32, 0.88) 9%,
          rgba(0, 18, 32, 0.68) 20%,
          rgba(0, 18, 32, 0.34) 42%,
          rgba(0, 18, 32, 0.12) 72%,
          rgba(0, 18, 32, 0.02) 100%
        ),
        radial-gradient(circle at 10% 50%, rgba(0, 0, 0, 0.18), transparent 30rem);
      pointer-events: none;
    }}
    .session-shell {{
      position: relative;
      z-index: 1;
      width: min(1420px, 100%);
      min-height: min(760px, calc(100vh - 68px));
      display: grid;
      grid-template-columns: minmax(0, 1fr) 470px;
      gap: 38px;
      align-items: center;
    }}
    .session-brand-panel {{
      display: grid;
      grid-template-columns: 347px minmax(0, 1fr);
      gap: 44px;
      align-items: center;
      min-width: 0;
    }}
    .session-shield-column {{
      display: flex;
      align-items: center;
      justify-content: center;
    }}
    .session-shield {{
      width: min(347px, 33vw);
      height: auto;
      object-fit: contain;
      filter:
        drop-shadow(0 24px 42px rgba(0, 0, 0, 0.62))
        drop-shadow(0 0 28px rgba(255, 130, 0, 0.18));
    }}
    .session-brand-copy {{ min-width: 0; color: white; }}
    .session-kicker {{
      margin: 0 0 0.8rem;
      color: #fb923c;
      font-size: 0.78rem;
      font-weight: 950;
      text-transform: uppercase;
      letter-spacing: 0.16em;
    }}
    .session-brand-copy h1 {{
      margin: 0;
      max-width: 560px;
      font-size: clamp(1.85rem, 2.65vw, 3.35rem);
      line-height: 1.08;
      font-weight: 900;
      letter-spacing: -0.025em;
      text-shadow: 0 10px 24px rgba(0, 0, 0, 0.48);
    }}
    .session-brand-copy > p:last-of-type {{
      margin: 22px 0 0;
      max-width: 560px;
      color: rgba(255, 255, 255, 0.92);
      font-size: clamp(0.98rem, 1.25vw, 1.2rem);
      font-weight: 650;
      line-height: 1.52;
      text-shadow: 0 8px 24px rgba(0, 0, 0, 0.48);
    }}
    .session-feature-list {{
      margin-top: 32px;
      display: grid;
      grid-template-columns: repeat(2, minmax(180px, max-content));
      gap: 13px 18px;
      align-items: center;
    }}
    .session-feature-pill {{
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 45px;
      padding: 10px 20px;
      border-radius: 999px;
      color: white;
      font-size: 1rem;
      font-weight: 850;
      background: rgba(2, 6, 23, 0.28);
      border: 1.5px solid rgba(125, 211, 252, 0.72);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
      backdrop-filter: blur(9px);
    }}
    .session-feature-pill:nth-child(1) {{ border-color: rgba(52, 211, 153, 0.86); }}
    .session-feature-pill:nth-child(2) {{ border-color: rgba(125, 211, 252, 0.82); }}
    .session-feature-pill:nth-child(3) {{
      border-color: rgba(251, 146, 60, 0.9);
      grid-column: 1 / span 2;
      width: fit-content;
    }}
    .session-panel {{
      border-radius: 26px;
      padding: 36px;
      background: linear-gradient(180deg, rgba(10, 18, 32, 0.52), rgba(15, 23, 42, 0.38));
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 34px 90px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
    }}
    .session-panel-heading {{ margin-bottom: 22px; }}
    .session-panel-heading p {{
      margin: 0 0 8px;
      color: #fb923c;
      font-size: 0.76rem;
      font-weight: 950;
      letter-spacing: 0.15em;
    }}
    .session-panel-heading h2 {{
      margin: 0;
      font-size: 1.8rem;
      font-weight: 950;
      letter-spacing: -0.025em;
    }}
    .session-panel-heading span {{
      display: block;
      margin-top: 8px;
      color: rgba(255, 255, 255, 0.7);
      line-height: 1.45;
    }}
    .session-choices {{ display: grid; gap: 14px; }}
    .session-choice {{
      display: block;
      width: 100%;
      border-radius: 14px;
      padding: 20px;
      color: white;
      text-decoration: none;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 12px 26px rgba(15, 23, 42, 0.18);
      backdrop-filter: blur(10px);
      transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
    }}
    .session-choice:hover {{
      transform: translateY(-2px);
      border-color: rgba(96, 165, 250, 0.72);
      background: rgba(59, 130, 246, 0.15);
    }}
    .session-choice.offline {{ border-color: rgba(52, 211, 153, 0.38); }}
    .session-choice.offline:hover {{
      border-color: rgba(52, 211, 153, 0.82);
      background: rgba(16, 185, 129, 0.12);
    }}
    .session-choice.disabled {{ opacity: 0.48; pointer-events: none; }}
    .choice-kicker {{
      display: block;
      margin-bottom: 8px;
      color: #93c5fd;
      font-size: 0.74rem;
      font-weight: 950;
      text-transform: uppercase;
      letter-spacing: 0.13em;
    }}
    .offline .choice-kicker {{ color: #86efac; }}
    .session-choice h3 {{ margin: 0; font-size: 1.32rem; font-weight: 950; }}
    .session-choice p {{
      margin: 9px 0 0;
      color: rgba(255, 255, 255, 0.78);
      font-size: 0.93rem;
      font-weight: 650;
      line-height: 1.48;
    }}
    .choice-action {{ display: block; margin-top: 16px; font-weight: 900; }}
    .session-footnote {{
      margin: 22px auto 0;
      max-width: 360px;
      color: rgba(255, 255, 255, 0.72);
      font-size: 0.92rem;
      font-weight: 650;
      line-height: 1.45;
      text-align: center;
    }}
    @media (max-width: 1180px) {{
      .session-shell {{ grid-template-columns: 1fr; gap: 24px; }}
      .session-brand-panel {{ grid-template-columns: 270px minmax(0, 1fr); }}
      .session-shield {{ width: 270px; }}
      .session-panel {{ width: min(520px, 100%); justify-self: center; }}
    }}
    @media (max-width: 760px) {{
      body {{ padding: 16px; background-position: 60% 38%; overflow: auto; }}
      .session-shell {{ min-height: auto; }}
      .session-brand-panel {{ grid-template-columns: 1fr; gap: 18px; text-align: center; }}
      .session-shield {{ width: 198px; max-width: 62vw; }}
      .session-brand-copy h1 {{ margin: 0 auto; font-size: clamp(1.8rem, 7.7vw, 2.75rem); }}
      .session-brand-copy > p:last-of-type {{ margin: 16px auto 0; font-size: 0.94rem; }}
      .session-feature-list {{ grid-template-columns: 1fr; justify-items: center; margin-top: 22px; }}
      .session-feature-pill, .session-feature-pill:nth-child(3) {{
        grid-column: auto;
        width: min(280px, 100%);
        justify-content: center;
      }}
      .session-panel {{ padding: 22px; border-radius: 22px; }}
    }}
    @media (max-width: 460px) {{
      .session-feature-list {{ display: none; }}
      .session-panel {{ padding: 18px; }}
    }}
  </style>
</head>
<body>
  <main class="session-shell">
    <section class="session-brand-panel">
      <div class="session-shield-column">
        <img class="session-shield" src="{shield}" alt="NAIADD shield">
      </div>
      <div class="session-brand-copy">
        <p class="session-kicker">NAIADD</p>
        <h1>Nongame Aquatic Invertebrate Assessment and Distribution Database</h1>
        <p>
          A Virginia Department of Wildlife Resources platform for the
          collection, management, analysis, and distribution of nongame aquatic
          invertebrate observations.
        </p>
        <div class="session-feature-list">
          <div class="session-feature-pill">Offline Drafts</div>
          <div class="session-feature-pill">Field Collection</div>
          <div class="session-feature-pill">Choose Your Session</div>
        </div>
      </div>
    </section>

    <section class="session-panel">
      <div class="session-panel-heading">
        <p>SESSION MODE</p>
        <h2>Open NAIADD</h2>
        <span>Choose how you want to work on this workstation.</span>
      </div>
      <div class="session-choices">
        <a class="session-choice" href="{online}">
          <span class="choice-kicker">Connected</span>
          <h3>Online Session</h3>
          <p>Open the current production application with server authentication and connected services.</p>
          <span class="choice-action">Open Online NAIADD →</span>
        </a>
        <a class="{offline_class}" href="{offline}" aria-disabled="{offline_aria}">
          <span class="choice-kicker">Workstation</span>
          <h3>Offline Session</h3>
          <p>{offline_note}</p>
          <span class="choice-action">Open Offline NAIADD →</span>
        </a>
      </div>
      <p class="session-footnote">
        Offline Session stays isolated from the server even when this computer has an internet connection.
      </p>
    </section>
  </main>

  <script>
    const backgrounds = {backgrounds};
    if (backgrounds.length > 0) {{
      const selected = backgrounds[Math.floor(Math.random() * backgrounds.length)];
      const preload = new Image();
      preload.onload = () => {{
        document.body.style.backgroundImage = `url("${{selected}}")`;
      }};
      preload.src = selected;
    }}
  </script>
</body>
</html>"#,
        online = PRODUCTION_LAUNCH_URL,
        offline = LOCAL_LAUNCH_URL,
        offline_class = offline_class,
        offline_aria = offline_aria,
        offline_note = offline_note,
        shield = shield_url,
        backgrounds = backgrounds_json,
    );

    write_response(
        stream,
        "HTTP/1.1 200 OK",
        "text/html; charset=utf-8",
        body.as_bytes(),
    );
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
    mark_helper_activity();

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

    if method == "GET" && (url_path == "/session" || url_path == "/session/") {
        serve_session_chooser(stream);
        return;
    }

    if method == "POST" && url_path == HELPER_SHUTDOWN_PATH {
        write_json_response(
            stream,
            "HTTP/1.1 200 OK",
            r#"{"ok":true,"shuttingDown":true}"#,
        );

        thread::spawn(|| {
            thread::sleep(Duration::from_millis(150));
            std::process::exit(0);
        });

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

fn start_idle_shutdown_monitor() {
    mark_helper_activity();

    thread::spawn(|| loop {
        thread::sleep(HELPER_IDLE_CHECK_INTERVAL);

        if APP_UPDATE_IN_PROGRESS.load(Ordering::SeqCst) {
            mark_helper_activity();
            continue;
        }

        if helper_idle_for() >= HELPER_IDLE_TIMEOUT {
            println!(
                "NAIADD Offline Helper has been idle for {} minutes and will exit.",
                HELPER_IDLE_TIMEOUT.as_secs() / 60
            );
            std::process::exit(0);
        }
    });
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
        .setup(|app| {
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
            start_idle_shutdown_monitor();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect(
            "error while running NAIADD Offline Helper",
        );
}
