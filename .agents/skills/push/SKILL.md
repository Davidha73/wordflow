---
name: push
description: >-
  Stage, commit, and push the latest workspace changes to the GitHub remote repository.
  Triggered by the /push slash command or when the user asks to quickly push changes to GitHub.
---

# Push Latest Changes to GitHub

Follow these steps when the user invokes `/push` (with or without an optional commit message):

1. **Check Repository Status**:
   - Run `git status --short` to see modified, added, and untracked files.
   - If there are no changes to commit and no unpushed commits (`git status -sb`), inform the user that everything is already up to date and stop.

2. **Stage All Changes**:
   - Run `git add -A` to stage all changes (if `git add` fails in the sandbox due to `.git/index.lock` permissions on Windows, retry with `BypassSandbox: true`).

3. **Commit Changes**:
   - If the user provided a commit message after `/push`, use that message.
   - Otherwise, summarize the changed files into a concise, descriptive commit message.
   - Run `git commit -m "<message>"` (without chaining `&&` in PowerShell).

4. **Push to Remote**:
   - Run `git push` (with `BypassSandbox: true` if SSH/network access requires it).
   - If the branch has no upstream yet, run `git push -u origin HEAD`.

5. **Report Result**:
   - Confirm the commit hash, branch, and remote repository in 1–2 concise sentences.
