# SKILL.md

| name | git-sync |
| --- | --- |
| description | Synchronize local branch with remote tracking branch (fetch, rebase, push). |
| disable-model-invocation | true |
| allowed-tools | Read, Bash, Glob, Grep |

Synchronize the current branch with its remote tracking branch.

Arguments: $ARGUMENTS (Optional remote/branch name, e.g., "origin/main". If omitted, uses current tracking branch.)

Behavior:

• No arguments: uses the current branch's upstream tracking branch.
• "remote/branch": syncs specifically with the provided remote and branch.

Steps:

1. Check for local changes with `git status --porcelain`:
   ◦ If the working tree has changes, stash them with `git stash push --include-untracked -m "copilot git-sync"`.
   ◦ Remember if a stash was created.
2. Determine target:
   ◦ If args provided → target is `args`.
   ◦ If no args → run `git rev-parse --abbrev-ref @{u}` to find the upstream branch. If no upstream is configured, stop and ask the user.
3. Synchronize:
   ◦ Run `git fetch <remote>` (extract remote from target).
   ◦ Run `git rebase <target>` to integrate remote changes while keeping local commits on top.
4. Push:
   ◦ Run `git push` to update the remote with the now-synchronized local branch.
5. Restore local changes:
   ◦ If a stash was created in step 1, restore it with `git stash pop --index`.
   ◦ If restoration conflicts, report and leave files for manual resolution.

Conflict Handling:

• If `git rebase` conflicts:
   ◦ Stop immediately.
   ◦ Provide the list of conflicting files.
   ◦ Ask the user to resolve them or provide guidance on how to proceed.
   ◦ Once resolved, the user can call `git rebase --continue` (or the agent can do so if instructed).
• If `git push` fails (e.g., due to remote changes that happened during the sync), repeat the rebase step.
