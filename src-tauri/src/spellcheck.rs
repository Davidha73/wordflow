use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};
use tauri::Manager;

static LEARNED_WORDS: OnceLock<RwLock<Option<HashSet<String>>>> = OnceLock::new();

fn dictionary_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let data_dir = app.path().app_data_dir().ok()?;
    let suite_dir = data_dir.parent().unwrap_or(&data_dir).join("FlowSuite");
    let shared_path = suite_dir.join("custom_dictionary.txt");
    if !shared_path.exists() {
        if let Some(legacy_path) = app.path().app_config_dir().ok().map(|d| d.join("custom_dictionary.txt")) {
            if legacy_path.exists() {
                let _ = fs::create_dir_all(&suite_dir);
                let _ = fs::copy(&legacy_path, &shared_path);
            }
        }
    }
    Some(shared_path)
}

fn ensure_loaded(app: &tauri::AppHandle) -> &'static RwLock<Option<HashSet<String>>> {
    let lock = LEARNED_WORDS.get_or_init(|| RwLock::new(None));
    let needs_load = lock.read().map(|guard| guard.is_none()).unwrap_or(false);
    if needs_load {
        let mut set = HashSet::new();
        if let Some(path) = dictionary_path(app) {
            if let Ok(contents) = fs::read_to_string(path) {
                for line in contents.lines() {
                    let w = line.trim().to_lowercase();
                    if !w.is_empty() {
                        set.insert(w);
                    }
                }
            }
        }
        if let Ok(mut guard) = lock.write() {
            if guard.is_none() {
                *guard = Some(set);
            }
        }
    }
    lock
}

fn persist_learned_words(app: &tauri::AppHandle, set: &HashSet<String>) {
    if let Some(path) = dictionary_path(app) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let mut words: Vec<&String> = set.iter().collect();
        words.sort();
        let body: String = words.into_iter().cloned().collect::<Vec<_>>().join("\n");
        let _ = fs::write(path, body);
    }
}

fn record_learned_word(app: &tauri::AppHandle, word: &str) {
    let normalized = word.trim().to_lowercase();
    if normalized.is_empty() {
        return;
    }
    let lock = ensure_loaded(app);
    if let Ok(mut guard) = lock.write() {
        let set = guard.get_or_insert_with(HashSet::new);
        if set.insert(normalized) {
            persist_learned_words(app, set);
        }
    }
}

fn sorted_learned_words(app: &tauri::AppHandle) -> Vec<String> {
    let lock = ensure_loaded(app);
    if let Ok(guard) = lock.read() {
        if let Some(set) = guard.as_ref() {
            let mut words: Vec<String> = set.iter().cloned().collect();
            words.sort();
            return words;
        }
    }
    Vec::new()
}

pub fn is_word_learned(app: &tauri::AppHandle, word: &str) -> bool {
    let normalized = word.trim().to_lowercase();
    if normalized.is_empty() {
        return false;
    }
    let lock = ensure_loaded(app);
    if let Ok(guard) = lock.read() {
        if guard.as_ref().is_some_and(|set| set.contains(&normalized)) {
            return true;
        }
    }
    #[cfg(target_os = "macos")]
    {
        if mac_spell::has_learned_word(word) {
            return true;
        }
    }
    false
}

#[cfg(target_os = "windows")]
mod win_spell {
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::Globalization::{ISpellChecker, ISpellCheckerFactory, SpellCheckerFactory};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };

    fn create_checker() -> Result<ISpellChecker, String> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let factory: ISpellCheckerFactory =
                CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER)
                    .map_err(|e| format!("SpellCheckerFactory error: {e}"))?;

            for lang in ["en-US", "en-GB"] {
                let hlang = HSTRING::from(lang);
                if factory.IsSupported(&hlang).map(|b| b.as_bool()).unwrap_or(false) {
                    if let Ok(checker) = factory.CreateSpellChecker(&hlang) {
                        return Ok(checker);
                    }
                }
            }
            Err("No supported English spellchecker found".to_string())
        }
    }

    pub fn check_word(word: &str) -> Vec<String> {
        let trimmed = word.trim();
        if trimmed.is_empty() {
            return Vec::new();
        }
        let Ok(checker) = create_checker() else {
            return Vec::new();
        };

        unsafe {
            let hword = HSTRING::from(trimmed);
            let Ok(errors) = checker.Check(&hword) else {
                return Vec::new();
            };
            let mut err = None;
            if errors.Next(&mut err).is_err() || err.is_none() {
                return Vec::new();
            }

            let Ok(suggestions) = checker.Suggest(&hword) else {
                return Vec::new();
            };

            let mut results = Vec::new();
            let mut raw = [PWSTR::null(); 6];
            let mut fetched: u32 = 0;
            let _ = suggestions.Next(&mut raw, Some(&mut fetched));
            for ptr in raw.into_iter().take(fetched as usize) {
                if !ptr.is_null() {
                    if let Ok(s) = ptr.to_string() {
                        if !s.is_empty() {
                            results.push(s);
                        }
                    }
                    CoTaskMemFree(Some(ptr.0 as *const _));
                }
            }
            results
        }
    }

    pub fn add_word(word: &str) -> Result<(), String> {
        let trimmed = word.trim();
        if trimmed.is_empty() {
            return Ok(());
        }
        let checker = create_checker()?;
        unsafe {
            checker
                .Add(&HSTRING::from(trimmed))
                .map_err(|e| format!("Failed to add word to dictionary: {e}"))
        }
    }
}

#[cfg(target_os = "macos")]
mod mac_spell {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    use objc2_foundation::{NSArray, NSNotFound, NSRange, NSString};

    fn shared_checker() -> Option<Retained<AnyObject>> {
        unsafe { msg_send![class!(NSSpellChecker), sharedSpellChecker] }
    }

    pub fn check_word(word: &str) -> Vec<String> {
        let trimmed = word.trim();
        if trimmed.is_empty() {
            return Vec::new();
        }
        let Some(checker) = shared_checker() else {
            return Vec::new();
        };

        let ns_word = NSString::from_str(trimmed);
        let range: NSRange = unsafe {
            msg_send![&*checker, checkSpellingOfString: &*ns_word, startingAt: 0isize]
        };
        if range.location == NSNotFound as usize || range.length == 0 {
            return Vec::new();
        }

        let guesses: Option<Retained<NSArray<NSString>>> = unsafe {
            msg_send![
                &*checker,
                guessesForWordRange: range,
                inString: &*ns_word,
                language: std::ptr::null::<NSString>(),
                inSpellDocumentWithTag: 0isize
            ]
        };

        let Some(guesses) = guesses else {
            return Vec::new();
        };

        guesses
            .iter()
            .take(6)
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
            .collect()
    }

    pub fn add_word(word: &str) -> Result<(), String> {
        let trimmed = word.trim();
        if trimmed.is_empty() {
            return Ok(());
        }
        let checker = shared_checker().ok_or_else(|| "NSSpellChecker unavailable".to_string())?;
        let ns_word = NSString::from_str(trimmed);
        unsafe {
            let _: () = msg_send![&*checker, learnWord: &*ns_word];
        }
        Ok(())
    }

    pub fn has_learned_word(word: &str) -> bool {
        let trimmed = word.trim();
        if trimmed.is_empty() {
            return false;
        }
        let Some(checker) = shared_checker() else {
            return false;
        };
        let ns_word = NSString::from_str(trimmed);
        unsafe { msg_send![&*checker, hasLearnedWord: &*ns_word] }
    }

    pub fn unlearn_word(word: &str) {
        let trimmed = word.trim();
        if trimmed.is_empty() {
            return;
        }
        if let Some(checker) = shared_checker() {
            let ns_word = NSString::from_str(trimmed);
            unsafe {
                let _: () = msg_send![&*checker, unlearnWord: &*ns_word];
            }
        }
    }
}

#[tauri::command]
pub fn check_word_spelling(word: String) -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        win_spell::check_word(&word)
    }
    #[cfg(target_os = "macos")]
    {
        mac_spell::check_word(&word)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = word;
        Vec::new()
    }
}

#[tauri::command]
pub fn add_word_to_dictionary(app: tauri::AppHandle, word: String) -> Result<(), String> {
    record_learned_word(&app, &word);
    #[cfg(target_os = "windows")]
    {
        win_spell::add_word(&word)
    }
    #[cfg(target_os = "macos")]
    {
        mac_spell::add_word(&word)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = word;
        Ok(())
    }
}

#[tauri::command]
pub fn get_custom_dictionary(app: tauri::AppHandle) -> Vec<String> {
    sorted_learned_words(&app)
}

#[tauri::command]
pub fn remove_word_from_dictionary(app: tauri::AppHandle, word: String) -> Result<Vec<String>, String> {
    let normalized = word.trim().to_lowercase();
    if !normalized.is_empty() {
        let lock = ensure_loaded(&app);
        if let Ok(mut guard) = lock.write() {
            if let Some(set) = guard.as_mut() {
                set.remove(&normalized);
                persist_learned_words(&app, set);
            }
        }
        #[cfg(target_os = "macos")]
        {
            mac_spell::unlearn_word(&normalized);
        }
    }
    Ok(sorted_learned_words(&app))
}

#[tauri::command]
pub fn clear_custom_dictionary(app: tauri::AppHandle) -> Result<(), String> {
    let existing = sorted_learned_words(&app);
    let lock = ensure_loaded(&app);
    if let Ok(mut guard) = lock.write() {
        if let Some(set) = guard.as_mut() {
            set.clear();
            persist_learned_words(&app, set);
        }
    }
    #[cfg(target_os = "macos")]
    {
        for w in existing {
            mac_spell::unlearn_word(&w);
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = existing;
    }
    Ok(())
}
