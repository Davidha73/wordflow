use std::sync::{Arc, OnceLock};

use harper_core::linting::{LintGroup, LintKind, Linter, Suggestion};
use harper_core::parsers::PlainEnglish;
use harper_core::spell::FstDictionary;
use harper_core::Document;
use serde::Serialize;

static CURATED_DICT: OnceLock<Arc<FstDictionary>> = OnceLock::new();

fn get_curated_dict() -> Arc<FstDictionary> {
    CURATED_DICT.get_or_init(FstDictionary::curated).clone()
}

#[derive(Serialize)]
pub struct GrammarIssue {
    pub start: usize,
    pub end: usize,
    pub kind: String,
    pub message: String,
    pub problem_text: String,
    pub suggestions: Vec<String>,
}

fn check_grammar_sync(app: &tauri::AppHandle, text: String) -> Vec<GrammarIssue> {
    if text.trim().is_empty() {
        return Vec::new();
    }

    let parser = PlainEnglish;
    let dict = get_curated_dict();
    let mut linter = LintGroup::new_curated(dict);
    let mut issues = Vec::new();
    let mut line_char_offset: usize = 0;

    for raw_line in text.split('\n') {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        let line_char_len = raw_line.chars().count();

        if !line.trim().is_empty() {
            let document = Document::new_curated(line, &parser);
            let line_chars: Vec<char> = line.chars().collect();

            for lint in linter.lint(&document) {
                if issues.len() >= 40 {
                    return issues;
                }
                if matches!(lint.lint_kind, LintKind::Readability) {
                    continue;
                }
                let start = lint.span.start.min(line_chars.len());
                let end = lint.span.end.min(line_chars.len());
                if start >= end || (end - start) > 60 {
                    continue;
                }

                let problem_text: String = line_chars[start..end].iter().collect();
                if matches!(lint.lint_kind, LintKind::Spelling)
                    && crate::spellcheck::is_word_learned(app, &problem_text)
                {
                    continue;
                }
                let suggestions: Vec<String> = lint
                    .suggestions
                    .iter()
                    .take(4)
                    .map(|s| match s {
                        Suggestion::ReplaceWith(chars) => chars.iter().collect(),
                        Suggestion::Remove => String::new(),
                        Suggestion::InsertAfter(chars) => {
                            let suffix: String = chars.iter().collect();
                            format!("{problem_text}{suffix}")
                        }
                    })
                    .collect();

                issues.push(GrammarIssue {
                    start: line_char_offset + start,
                    end: line_char_offset + end,
                    kind: format!("{:?}", lint.lint_kind),
                    message: lint.message,
                    problem_text,
                    suggestions,
                });
            }
        }

        line_char_offset += line_char_len + 1;
    }

    issues
}

#[tauri::command]
pub async fn check_grammar(app: tauri::AppHandle, text: String) -> Vec<GrammarIssue> {
    tauri::async_runtime::spawn_blocking(move || check_grammar_sync(&app, text))
        .await
        .unwrap_or_default()
}
