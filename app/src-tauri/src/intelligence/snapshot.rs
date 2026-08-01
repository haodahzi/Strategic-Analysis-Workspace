use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process,
    sync::atomic::{AtomicU64, Ordering},
};

use flate2::{write::GzEncoder, Compression};
use sha2::{Digest, Sha256};

static NEXT_TEMP_FILE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, thiserror::Error)]
pub enum SnapshotError {
    #[error("snapshot file error: {0}")]
    Io(#[from] std::io::Error),
}

pub struct StoredSnapshot {
    pub content_hash: String,
    pub relative_path: String,
    pub absolute_path: PathBuf,
}

pub fn store_snapshot(data_dir: &Path, bytes: &[u8]) -> Result<StoredSnapshot, SnapshotError> {
    let content_hash = hex::encode(Sha256::digest(bytes));
    let relative_path = format!("snapshots/{content_hash}.html.gz");
    let snapshot_dir = data_dir.join("snapshots");
    let absolute_path = data_dir.join(&relative_path);
    fs::create_dir_all(&snapshot_dir)?;

    let temp_path = snapshot_dir.join(format!(
        ".{content_hash}.{}-{}.tmp",
        process::id(),
        NEXT_TEMP_FILE.fetch_add(1, Ordering::Relaxed)
    ));
    let write_result = (|| {
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)?;
        let mut encoder = GzEncoder::new(file, Compression::default());
        encoder.write_all(bytes)?;
        let file = encoder.finish()?;
        file.sync_all()?;

        match fs::hard_link(&temp_path, &absolute_path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
            Err(error) => Err(error),
        }
    })();
    let cleanup_result = fs::remove_file(&temp_path);
    write_result?;
    if let Err(error) = cleanup_result {
        if error.kind() != std::io::ErrorKind::NotFound {
            return Err(error.into());
        }
    }

    Ok(StoredSnapshot {
        content_hash,
        relative_path,
        absolute_path,
    })
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::Read,
        path::PathBuf,
        process,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc, Barrier,
        },
        thread,
    };

    use flate2::read::GzDecoder;
    use sha2::{Digest, Sha256};

    use super::store_snapshot;

    static NEXT: AtomicUsize = AtomicUsize::new(0);

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!(
            "strategic-analysis-task4-snapshot-{}-{}",
            process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ))
    }

    fn safe_remove_temp_directory(path: &std::path::Path) {
        let temp_root = fs::canonicalize(std::env::temp_dir()).unwrap();
        let resolved = fs::canonicalize(path).unwrap();
        assert_eq!(resolved.parent(), Some(temp_root.as_path()));
        assert!(resolved
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("strategic-analysis-task4-snapshot-")));
        fs::remove_dir_all(resolved).unwrap();
    }

    #[test]
    fn stores_content_addressed_gzip_without_rewriting_duplicate() {
        let data_dir = temp_dir();
        let bytes = b"<html>immutable intelligence</html>";
        let expected_hash = hex::encode(Sha256::digest(bytes));

        let first = store_snapshot(&data_dir, bytes).unwrap();
        let first_modified = fs::metadata(&first.absolute_path)
            .unwrap()
            .modified()
            .unwrap();
        let second = store_snapshot(&data_dir, bytes).unwrap();
        let second_modified = fs::metadata(&second.absolute_path)
            .unwrap()
            .modified()
            .unwrap();

        assert_eq!(first.content_hash, expected_hash);
        assert_eq!(
            first.relative_path,
            format!("snapshots/{expected_hash}.html.gz")
        );
        assert_eq!(first.absolute_path, second.absolute_path);
        assert_eq!(first_modified, second_modified);
        assert_eq!(fs::read_dir(data_dir.join("snapshots")).unwrap().count(), 1);

        let mut decoded = Vec::new();
        GzDecoder::new(fs::File::open(&first.absolute_path).unwrap())
            .read_to_end(&mut decoded)
            .unwrap();
        assert_eq!(decoded, bytes);

        safe_remove_temp_directory(&data_dir);
    }

    #[test]
    fn concurrent_identical_writes_publish_exactly_one_snapshot() {
        let data_dir = Arc::new(temp_dir());
        let barrier = Arc::new(Barrier::new(3));
        let handles = (0..2)
            .map(|_| {
                let data_dir = Arc::clone(&data_dir);
                let barrier = Arc::clone(&barrier);
                thread::spawn(move || {
                    barrier.wait();
                    store_snapshot(&data_dir, b"same concurrent bytes").unwrap()
                })
            })
            .collect::<Vec<_>>();
        barrier.wait();
        let results = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(results[0].absolute_path, results[1].absolute_path);
        assert_eq!(fs::read_dir(data_dir.join("snapshots")).unwrap().count(), 1);
        let mut decoded = Vec::new();
        GzDecoder::new(fs::File::open(&results[0].absolute_path).unwrap())
            .read_to_end(&mut decoded)
            .unwrap();
        assert_eq!(decoded, b"same concurrent bytes");
        safe_remove_temp_directory(data_dir.as_ref());
    }
}
