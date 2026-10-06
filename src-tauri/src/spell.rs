#[cfg(test)]
#[path = "__tests__/spell.rs"]
mod tests;

use std::path::Path;
use std::sync::{Arc, OnceLock};

use serde::Deserialize;
use spellbook::Dictionary;
use tauri::{AppHandle, Manager, Runtime, State};

use crate::error::CommandError;

pub const MAX_SUGGESTIONS: usize = 5;
/// Suggestions for very long words are slow with the Russian morphology and
/// rarely useful, so they are skipped.
pub const MAX_SUGGEST_CHARS: usize = 40;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    Ru,
    En,
}

impl Lang {
    fn file_stem(self) -> &'static str {
        match self {
            Lang::Ru => "ru_RU",
            Lang::En => "en_US",
        }
    }
}

type Loader = dyn Fn(Lang) -> Result<(String, String), String> + Send + Sync;

/// Base dictionaries only: the book dictionary and "Ignore" are a frontend filter.
pub struct SpellService {
    loader: Box<Loader>,
    ru: OnceLock<Result<Dictionary, String>>,
    en: OnceLock<Result<Dictionary, String>>,
}

impl SpellService {
    pub fn new(
        loader: impl Fn(Lang) -> Result<(String, String), String> + Send + Sync + 'static,
    ) -> Self {
        Self {
            loader: Box::new(loader),
            ru: OnceLock::new(),
            en: OnceLock::new(),
        }
    }

    fn dictionary(&self, lang: Lang) -> Result<&Dictionary, CommandError> {
        let cell = match lang {
            Lang::Ru => &self.ru,
            Lang::En => &self.en,
        };
        cell.get_or_init(|| {
            let (aff, dic) = (self.loader)(lang)?;
            Dictionary::new(&aff, &dic).map_err(|error| error.to_string())
        })
        .as_ref()
        .map_err(|message| CommandError::DictionaryLoad {
            lang: lang.file_stem().to_string(),
            message: message.clone(),
        })
    }

    pub fn check(&self, lang: Lang, words: &[String]) -> Result<Vec<String>, CommandError> {
        let dictionary = self.dictionary(lang)?;
        Ok(words
            .iter()
            .filter(|word| !accepts(dictionary, word))
            .cloned()
            .collect())
    }

    pub fn suggest(&self, lang: Lang, word: &str) -> Result<Vec<String>, CommandError> {
        let dictionary = self.dictionary(lang)?;
        let word = normalize(word);
        if word.chars().count() > MAX_SUGGEST_CHARS {
            return Ok(Vec::new());
        }
        let mut out = Vec::new();
        dictionary.suggest(&word, &mut out);
        out.truncate(MAX_SUGGESTIONS);
        Ok(out)
    }
}

fn normalize(word: &str) -> String {
    word.replace('\u{2019}', "'")
}

fn accepts(dictionary: &Dictionary, word: &str) -> bool {
    let word = normalize(word);
    accepts_whole(dictionary, &word)
        || (word.contains('-')
            && word
                .split('-')
                .all(|part| !part.is_empty() && accepts_whole(dictionary, part)))
}

fn accepts_whole(dictionary: &Dictionary, word: &str) -> bool {
    dictionary.check(word)
        || (word.contains(['ё', 'Ё'])
            && dictionary.check(&word.replace('ё', "е").replace('Ё', "Е")))
}

pub fn read_pair(dir: &Path, lang: Lang) -> Result<(String, String), String> {
    let read = |extension: &str| {
        let path = dir.join(format!("{}.{extension}", lang.file_stem()));
        std::fs::read_to_string(&path).map_err(|error| format!("{}: {error}", path.display()))
    };
    Ok((read("aff")?, read("dic")?))
}

pub fn bundled_service<R: Runtime>(app: &AppHandle<R>) -> SpellService {
    let app = app.clone();
    SpellService::new(move |lang| {
        let dir = app
            .path()
            .resolve(
                "resources/dictionaries",
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|error| error.to_string())?;
        let start = std::time::Instant::now();
        let pair = read_pair(&dir, lang);
        log::debug!("spelling dictionary {lang:?} read in {:?}", start.elapsed());
        pair
    })
}

async fn run_blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, CommandError> + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| CommandError::SpellTask {
            message: error.to_string(),
        })?
}

#[tauri::command(rename = "spell_check")]
pub async fn spell_check_command(
    state: State<'_, Arc<SpellService>>,
    lang: Lang,
    words: Vec<String>,
) -> Result<Vec<String>, CommandError> {
    let service = state.inner().clone();
    let count = words.len();
    let start = std::time::Instant::now();
    let result = run_blocking(move || service.check(lang, &words)).await;
    log::debug!(
        "spell_check {lang:?}: {count} words in {:?}",
        start.elapsed()
    );
    if let Err(error) = &result {
        log::error!("spell_check failed: {}", error.code());
    }
    result
}

#[tauri::command(rename = "spell_suggest")]
pub async fn spell_suggest_command(
    state: State<'_, Arc<SpellService>>,
    lang: Lang,
    word: String,
) -> Result<Vec<String>, CommandError> {
    let service = state.inner().clone();
    run_blocking(move || service.suggest(lang, &word)).await
}
