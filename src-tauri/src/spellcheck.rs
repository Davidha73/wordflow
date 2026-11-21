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
pub fn add_word_to_dictionary(word: String) -> Result<(), String> {
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
