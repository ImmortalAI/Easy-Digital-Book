use std::io;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CommandError {
    #[error("path is not in the filesystem scope: {path}")]
    PermissionDenied { path: String },
    #[error("filesystem operation failed: {source}")]
    Io {
        #[source]
        source: io::Error,
    },
    #[error("filesystem scope operation failed: {message}")]
    Scope { message: String },
    #[error("spelling dictionary {lang} could not be loaded: {message}")]
    DictionaryLoad { lang: String, message: String },
    #[error("spelling task failed: {message}")]
    SpellTask { message: String },
}

impl CommandError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::PermissionDenied { .. } => "fs.permissionDenied",
            Self::Io { .. } => "fs.ioError",
            Self::Scope { .. } => "fs.scopeError",
            Self::DictionaryLoad { .. } => "spell.dictionaryLoad",
            Self::SpellTask { .. } => "spell.task",
        }
    }

    pub fn permission_denied(path: &std::path::Path) -> Self {
        Self::PermissionDenied {
            path: path.display().to_string(),
        }
    }
}

impl Serialize for CommandError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        #[derive(Serialize)]
        struct Wire<'a> {
            code: &'a str,
            message: String,
        }
        Wire {
            code: self.code(),
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

impl From<io::Error> for CommandError {
    fn from(source: io::Error) -> Self {
        Self::Io { source }
    }
}
