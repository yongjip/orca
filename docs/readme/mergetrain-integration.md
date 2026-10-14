# Mergetrain queue in Source Control

Expand **Mergetrain** in Source Control to view the selected repository's queue.
**Register branch** adds the current clean, committed branch with a task description.
**Validate queue** runs the configured checks against an assembled integration worktree.
Results distinguish complete, partial, and failed validation; failed jobs retain their reason.
Deployment approval remains in the mergetrain CLI.

## Setup

Install mergetrain 3.5 or newer on each execution host and put it on that host's PATH.
The adapter supports machine contract 5 and refuses an unsupported contract.
Run `mergetrain init --write` in the primary checkout, configure meaningful gates,
and commit `.mergetrain.yaml` before creating task worktrees.
A repository with missing or degraded configuration shows its diagnostic and disables actions.

Invocation always passes `--repo` with the selected worktree path and `--json`.
Mergetrain resolves the primary checkout's configuration and shared queue.
Orca inherits the host's CLI environment and uses fixed executable/argument calls.
It does not choose a GitHub account or supply deployment authorization.

## Execution and compatibility

The existing workspace host resolver owns routing. Paired hosts run commands in
that host's runtime; an older host must advertise `mergetrain.queue.v1` before
the renderer sends a request. Direct SSH routes that this runtime does not serve
are refused through the existing host dispatcher. They never execute locally.
WSL calls reuse the captured login-shell command and process-group termination APIs.
Folder workspaces retain the existing Git-only Source Control message.

Mutations return a request receipt immediately. The execution host keeps recent
receipts and one running operation per Git common directory and WSL distro;
the mergetrain CLI remains the queue and lease authority. Status polling only
runs while the section is expanded. Returning to a linked worktree reads the
same operation. Dropped contact means its execution cannot be observed; refresh
on the owning host before retrying. Process output is bounded, and raw malformed
output is not displayed because a wrapper may have printed secrets.

## Verification

```sh
ORCA_BACKGROUND_LAUNCH=1 pnpm test src/main/mergetrain src/renderer/src/components/right-sidebar/mergetrain
ORCA_BACKGROUND_LAUNCH=1 ORCA_REAL_MERGETRAIN_TEST=1 pnpm exec playwright test --config tests/playwright.config.ts --project electron-headless --workers=1 mergetrain.spec.ts
```

The real-CLI test creates a disposable repository, two linked task worktrees,
a meaningful failing gate, and a local bare remote. It registers through the UI,
switches worktrees during validation, checks the partial result, and verifies
exact queued commit pins, manual queue policy, and untouched local/remote main refs.
Electron stays hidden; Playwright controls the renderer through CDP.
