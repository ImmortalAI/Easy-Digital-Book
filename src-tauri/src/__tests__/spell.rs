use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;

use crate::spell::{read_pair, Lang, SpellService, MAX_SUGGESTIONS};

fn bundled() -> SpellService {
    SpellService::new(|lang| {
        read_pair(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/dictionaries"),
            lang,
        )
    })
}

fn words(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| item.to_string()).collect()
}

#[test]
fn english_returns_only_misspelled_words_in_order() {
    let spell = bundled();
    let result = spell
        .check(
            Lang::En,
            &words(&["hello", "helo", "World", "wrold", "HELLO"]),
        )
        .unwrap();
    assert_eq!(result, words(&["helo", "wrold"]));
}

#[test]
fn english_accepts_both_apostrophes_and_hyphenated_parts() {
    let spell = bundled();
    let result = spell
        .check(
            Lang::En,
            &words(&["don't", "don\u{2019}t", "well-known", "half-wrold"]),
        )
        .unwrap();
    assert_eq!(result, words(&["half-wrold"]));
}

#[test]
fn russian_accepts_capitalised_yo_and_hyphenated_words() {
    let spell = bundled();
    let result = spell
        .check(
            Lang::Ru,
            &words(&[
                "привет",
                "Привет",
                "превет",
                "ёлка",
                "Ёлка",
                "из-за",
                "кто-нибудь",
                "из-зо",
            ]),
        )
        .unwrap();
    assert_eq!(result, words(&["превет", "из-зо"]));
}

#[test]
fn suggestions_are_limited_and_relevant() {
    let spell = bundled();
    let ru = spell.suggest(Lang::Ru, "превет").unwrap();
    assert!(ru.len() <= MAX_SUGGESTIONS);
    assert!(ru.iter().any(|item| item == "привет"), "{ru:?}");
    let en = spell.suggest(Lang::En, "helo").unwrap();
    assert!(en.len() <= MAX_SUGGESTIONS);
    assert!(en.iter().any(|item| item == "hello"), "{en:?}");
}

#[test]
fn long_words_get_no_suggestions() {
    let spell = bundled();
    let word = "а".repeat(41);
    assert!(spell.suggest(Lang::Ru, &word).unwrap().is_empty());
}

#[test]
fn load_failure_is_reported_with_its_code_and_not_retried() {
    let calls = Arc::new(AtomicUsize::new(0));
    let counter = calls.clone();
    let spell = SpellService::new(move |_| {
        counter.fetch_add(1, Ordering::SeqCst);
        Err("missing".to_string())
    });
    let first = spell.check(Lang::Ru, &words(&["слово"])).unwrap_err();
    assert_eq!(first.code(), "spell.dictionaryLoad");
    let second = spell.suggest(Lang::Ru, "слово").unwrap_err();
    assert_eq!(second.code(), "spell.dictionaryLoad");
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[test]
fn languages_load_independently() {
    let spell = SpellService::new(|lang| match lang {
        Lang::En => read_pair(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/dictionaries"),
            lang,
        ),
        Lang::Ru => Err("missing".to_string()),
    });
    assert!(spell
        .check(Lang::En, &words(&["hello"]))
        .unwrap()
        .is_empty());
    assert!(spell.check(Lang::Ru, &words(&["слово"])).is_err());
}

#[test]
#[ignore = "timing report: cargo test --release spell::tests::load_timing -- --ignored --nocapture"]
fn load_timing() {
    let spell = bundled();
    for lang in [Lang::Ru, Lang::En] {
        let start = Instant::now();
        spell.check(lang, &words(&["x"])).unwrap();
        println!("{lang:?} load: {:?}", start.elapsed());
    }
}
