use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use rusqlite::Connection;
use serde::Serialize;
use thiserror::Error;

const MIGRATION_001: &str = include_str!("../../migrations/intelligence/001_initial.sql");

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("file system error: {0}")]
    Io(#[from] std::io::Error),
    #[error("database error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[cfg(test)]
    #[error("initialization failed: {0}")]
    Initialization(String),
    #[allow(dead_code)] // Reserved for the next intelligence commands that use the ready connection.
    #[error("intelligence database is not ready")]
    NotReady,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntelligenceHealth {
    pub ready: bool,
    pub schema_version: i64,
    pub data_dir: PathBuf,
}

struct ReadyDatabase {
    #[allow(dead_code)] // Accessed through with_connection by subsequent intelligence commands.
    connection: Connection,
    health: IntelligenceHealth,
}

#[derive(Default)]
pub struct DatabaseState {
    ready: Mutex<Option<ReadyDatabase>>,
    initialization: Mutex<()>,
}

pub fn migrate(connection: &Connection) -> Result<(), DatabaseError> {
    connection.execute_batch(MIGRATION_001)?;
    Ok(())
}

fn recover_lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl DatabaseState {
    fn current_health(&self) -> Option<IntelligenceHealth> {
        recover_lock(&self.ready)
            .as_ref()
            .map(|database| database.health.clone())
    }

    fn initialize_with<F>(
        &self,
        data_dir: &Path,
        initializer: &F,
    ) -> Result<IntelligenceHealth, DatabaseError>
    where
        F: Fn(&Path) -> Result<Connection, DatabaseError>,
    {
        self.initialize_with_observer(data_dir, initializer, &|| {})
    }

    fn initialize_with_observer<F, O>(
        &self,
        data_dir: &Path,
        initializer: &F,
        before_initialization_lock: &O,
    ) -> Result<IntelligenceHealth, DatabaseError>
    where
        F: Fn(&Path) -> Result<Connection, DatabaseError>,
        O: Fn(),
    {
        if let Some(health) = self.current_health() {
            return Ok(health);
        }

        before_initialization_lock();
        let _initialization = recover_lock(&self.initialization);

        if let Some(health) = self.current_health() {
            return Ok(health);
        }

        let connection = initializer(data_dir)?;
        let schema_version = connection.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )?;
        let health = IntelligenceHealth {
            ready: true,
            schema_version,
            data_dir: data_dir.to_path_buf(),
        };

        *recover_lock(&self.ready) = Some(ReadyDatabase {
            connection,
            health: health.clone(),
        });

        Ok(health)
    }

    pub(crate) fn initialize(&self, data_dir: &Path) -> Result<IntelligenceHealth, DatabaseError> {
        self.initialize_with(data_dir, &open_and_migrate)
    }

    #[allow(dead_code)] // Used by subsequent intelligence commands, kept locked for the closure.
    pub(crate) fn with_connection<T>(
        &self,
        operation: impl FnOnce(&Connection) -> Result<T, DatabaseError>,
    ) -> Result<T, DatabaseError> {
        let ready = recover_lock(&self.ready);
        let database = ready.as_ref().ok_or(DatabaseError::NotReady)?;
        operation(&database.connection)
    }
}

fn open_and_migrate(data_dir: &Path) -> Result<Connection, DatabaseError> {
    fs::create_dir_all(data_dir.join("snapshots"))?;
    fs::create_dir_all(data_dir.join("backups"))?;
    let connection = Connection::open(data_dir.join("competitive-intelligence.db"))?;
    migrate(&connection)?;
    Ok(connection)
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashSet,
        env, fs,
        panic::{catch_unwind, AssertUnwindSafe},
        path::{Path, PathBuf},
        process,
        sync::{
            atomic::{AtomicUsize, Ordering},
            mpsc, Arc, Barrier,
        },
        thread,
    };

    use rusqlite::Connection;

    use super::{migrate, DatabaseError, DatabaseState};

    static NEXT_TEMP_DIRECTORY: AtomicUsize = AtomicUsize::new(0);

    fn unique_temp_directory() -> PathBuf {
        let temp_root = fs::canonicalize(env::temp_dir()).unwrap();
        let name = format!(
            "strategic-analysis-task3-{}-{}",
            process::id(),
            NEXT_TEMP_DIRECTORY.fetch_add(1, Ordering::SeqCst)
        );
        let path = temp_root.join(name);
        assert_eq!(path.parent(), Some(temp_root.as_path()));
        assert!(!path.exists(), "test directory already exists: {path:?}");
        path
    }

    fn remove_temp_directory(path: &Path) {
        let temp_root = fs::canonicalize(env::temp_dir()).unwrap();
        let resolved = fs::canonicalize(path).unwrap();
        assert_eq!(resolved.parent(), Some(temp_root.as_path()));
        assert!(
            resolved
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("strategic-analysis-task3-")),
            "refusing to remove unexpected path: {resolved:?}"
        );
        fs::remove_dir_all(resolved).unwrap();
    }

    #[test]
    fn migration_creates_core_tables() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();

        let mut statement = connection
            .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
            .unwrap();
        let actual = statement
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<HashSet<_>, _>>()
            .unwrap();
        let expected = [
            "schema_migrations",
            "business_units",
            "companies",
            "company_business_units",
            "company_aliases",
            "sources",
            "collection_runs",
            "raw_documents",
            "events",
            "event_sources",
            "evidence_spans",
            "event_analysis_versions",
            "app_checkpoints",
            "read_states",
            "bookmarks",
            "feedback",
            "intelligence_fts",
        ];

        for table in expected {
            assert!(actual.contains(table), "missing table {table}");
        }
        assert_eq!(
            connection
                .query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row("PRAGMA busy_timeout", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            5_000
        );
    }

    #[test]
    fn migration_is_idempotent_and_records_version_one() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        migrate(&connection).unwrap();

        let versions = connection
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = 1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap();
        assert_eq!(versions, 1);
    }

    #[test]
    fn failed_initialization_can_be_retried() {
        let state = DatabaseState::default();
        let attempts = AtomicUsize::new(0);
        let initializer = |_data_dir: &Path| {
            let attempt = attempts.fetch_add(1, Ordering::SeqCst);
            if attempt == 0 {
                return Err(DatabaseError::Initialization("planned failure".into()));
            }
            let connection = Connection::open_in_memory()?;
            migrate(&connection)?;
            Ok(connection)
        };

        assert!(state
            .initialize_with(Path::new("retry-data"), &initializer)
            .is_err());
        assert!(
            state
                .initialize_with(Path::new("retry-data"), &initializer)
                .unwrap()
                .ready
        );
        assert!(
            state
                .initialize_with(Path::new("retry-data"), &initializer)
                .unwrap()
                .ready
        );
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn initialization_panic_does_not_prevent_retry() {
        let state = DatabaseState::default();
        let panicking_initializer = |_data_dir: &Path| -> Result<Connection, DatabaseError> {
            panic!("planned initializer panic")
        };

        let panic = catch_unwind(AssertUnwindSafe(|| {
            let _ = state.initialize_with(Path::new("panic-retry-data"), &panicking_initializer);
        }));
        assert!(panic.is_err());

        let successful_initializer = |_data_dir: &Path| {
            let connection = Connection::open_in_memory()?;
            migrate(&connection)?;
            Ok(connection)
        };
        let health = state
            .initialize_with(Path::new("panic-retry-data"), &successful_initializer)
            .unwrap();

        assert!(health.ready);
        assert_eq!(health.schema_version, 1);
    }

    #[test]
    fn health_reports_schema_version_and_data_directory() {
        let state = DatabaseState::default();
        let initializer = |_data_dir: &Path| {
            let connection = Connection::open_in_memory()?;
            migrate(&connection)?;
            Ok(connection)
        };

        let health = state
            .initialize_with(Path::new("expected-data"), &initializer)
            .unwrap();

        assert!(health.ready);
        assert_eq!(health.schema_version, 1);
        assert_eq!(health.data_dir, Path::new("expected-data"));
    }

    #[test]
    fn ready_connection_is_available_under_lock() {
        let state = DatabaseState::default();
        assert!(matches!(
            state.with_connection(|_| Ok(())),
            Err(DatabaseError::NotReady)
        ));
        let initializer = |_data_dir: &Path| {
            let connection = Connection::open_in_memory()?;
            migrate(&connection)?;
            Ok(connection)
        };
        state
            .initialize_with(Path::new("connection-data"), &initializer)
            .unwrap();

        let version = state
            .with_connection(|connection| {
                Ok(connection.query_row(
                    "SELECT MAX(version) FROM schema_migrations",
                    [],
                    |row| row.get::<_, i64>(0),
                )?)
            })
            .unwrap();

        assert_eq!(version, 1);
    }

    #[test]
    fn connection_operation_panic_does_not_poison_ready_state() {
        let state = DatabaseState::default();
        let initializer = |_data_dir: &Path| {
            let connection = Connection::open_in_memory()?;
            migrate(&connection)?;
            Ok(connection)
        };
        let expected_health = state
            .initialize_with(Path::new("connection-panic-data"), &initializer)
            .unwrap();

        let panic = catch_unwind(AssertUnwindSafe(|| {
            let _: Result<(), DatabaseError> =
                state.with_connection(|_| panic!("planned connection operation panic"));
        }));
        assert!(panic.is_err());

        let health = state
            .initialize_with(Path::new("connection-panic-data"), &initializer)
            .unwrap();
        let version = state
            .with_connection(|connection| {
                Ok(connection.query_row(
                    "SELECT MAX(version) FROM schema_migrations",
                    [],
                    |row| row.get::<_, i64>(0),
                )?)
            })
            .unwrap();

        assert_eq!(health, expected_health);
        assert_eq!(version, 1);
    }

    #[test]
    fn production_initialization_creates_disk_layout_and_wal_database() {
        let data_dir = unique_temp_directory();
        let state = DatabaseState::default();

        let health = state.initialize(&data_dir).unwrap();

        assert_eq!(health.schema_version, 1);
        assert_eq!(health.data_dir, data_dir);
        assert!(data_dir.join("snapshots").is_dir());
        assert!(data_dir.join("backups").is_dir());
        assert!(data_dir.join("competitive-intelligence.db").is_file());
        let journal_mode = state
            .with_connection(|connection| {
                Ok(connection
                    .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))?)
            })
            .unwrap();
        assert_eq!(journal_mode, "wal");

        drop(state);
        remove_temp_directory(&data_dir);
    }

    #[test]
    fn concurrent_health_calls_share_one_initialization() {
        let state = Arc::new(DatabaseState::default());
        let initialize_count = Arc::new(AtomicUsize::new(0));
        let release_first = Arc::new(Barrier::new(2));
        let (first_entered_tx, first_entered_rx) = mpsc::channel();

        let first_state = Arc::clone(&state);
        let first_count = Arc::clone(&initialize_count);
        let first_release = Arc::clone(&release_first);
        let first = thread::spawn(move || {
            let initializer = move |_data_dir: &Path| {
                first_count.fetch_add(1, Ordering::SeqCst);
                first_entered_tx.send(()).unwrap();
                first_release.wait();
                let connection = Connection::open_in_memory()?;
                migrate(&connection)?;
                Ok(connection)
            };
            first_state.initialize_with(Path::new("shared-data"), &initializer)
        });

        first_entered_rx.recv().unwrap();
        let (second_waiting_tx, second_waiting_rx) = mpsc::channel();
        let second_state = Arc::clone(&state);
        let second_count = Arc::clone(&initialize_count);
        let second = thread::spawn(move || {
            let initializer = move |_data_dir: &Path| {
                second_count.fetch_add(1, Ordering::SeqCst);
                let connection = Connection::open_in_memory()?;
                migrate(&connection)?;
                Ok(connection)
            };
            let before_lock = move || second_waiting_tx.send(()).unwrap();
            second_state.initialize_with_observer(
                Path::new("shared-data"),
                &initializer,
                &before_lock,
            )
        });

        second_waiting_rx.recv().unwrap();
        release_first.wait();

        let first_health = first.join().unwrap().unwrap();
        let second_health = second.join().unwrap().unwrap();
        assert_eq!(initialize_count.load(Ordering::SeqCst), 1);
        assert_eq!(first_health, second_health);
        assert!(first_health.ready);
    }
}
