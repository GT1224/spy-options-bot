# Agent guidance

## HIVE workflow

### HIVE COMMIT-CLOSE PROTOCOL (required for every approved HIVE lane)

1) Stage only approved files/paths.
2) Revert or unstage everything else.
3) Remove temp/junk/untracked noise.
4) Commit immediately.
5) Push immediately to origin/main.
6) Report:
   - exact commit SHA
   - exact commit message
   - included files
   - excluded files
   - whether push succeeded
7) Final `git status --short` must be empty.
8) Final `git status -sb` must NOT show the branch ahead of origin/main unless push failed.
9) If `git push origin main` fails, explicitly report the failure and stop the lane in FAILED state (do not silently hand off as complete).
10) A HIVE lane is not considered complete until the commit is pushed or push failure is explicitly reported.

**HIVE-specific discipline**

- Do not stop at “ahead by 1”.
- Do not hand off for manual push unless `git push origin main` actually fails.
- Prefer production-closure discipline: local commit is not enough.
- Keep HIVE-only boundaries: no EXCALIBUR contamination.
- Existing-code-first, smallest safe patch, one approved lane at a time.

**Recommended**

- After push succeeds, include the final `git status -sb` output in the lane report so branch sync is visible.
- Docs-only rule changes (e.g. updates to this file) must still follow the same HIVE COMMIT-CLOSE PROTOCOL.
