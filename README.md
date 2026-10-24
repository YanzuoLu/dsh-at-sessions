# dsh-at-sessions

A sessions-only `@` menu for DeepSeek Harness Web.

## Behavior

- `@` suggestions contain only native session references. File/folder items and other `@` provider categories are not shown.
- Archived sessions are excluded **before** the native result limit. They cannot fill the result page and crowd out unarchived sessions.
- Active means **unarchived**, not only currently running. Idle sessions remain eligible. Native self exclusion, title matching, workspace-affinity ranking and subagent grouping are preserved. No extra origin-based exclusions are added.
- An archive or unarchive update refreshes an already-open `@` menu. Old rows immediately become unavailable while the replacement query is pending. Aborted or late results cannot restore them.
- Labels, keyboard selection, insertion, localization and appearance remain native DSH behavior. No extra button or model instruction is added.

This is an autocomplete preference, not an access-control policy. Existing reference chips, manually typed file/session references and their native serialization/preview behavior remain intact. Slash commands and slash-based skills are not changed. The plugin does not archive, delete, modify or resume any session.

## Implementation boundary

The host decorates `sessionReferenceResolver.listCandidates`, asks its original implementation for the complete matching list, filters the current archive set, and reapplies the original cap. It preserves native matching, labels and mention formatting without replacing the reference resolver or modifying global session lists.

The client adapts the current input-trigger registry in place. It preserves each source's identity and registration lifecycle, wrapping only `@` candidate lookup. The native reference lookup still performs its ordinary file RPC before its returned file rows are filtered. No global file-reference API is patched. This is a menu-only change, not a promise to eliminate all native autocomplete I/O.

Existing sources, late registrations and native source reloads are covered. Uninstall restores native lookup and refreshes open menus. Wrappers retained by a later plugin become pass-through instead of overwriting that plugin.

## Install

```sh
dsh plugin --profile web add github:YanzuoLu/dsh-at-sessions
```

Tested with **DSH 0.2.0-rc.2**. The input-trigger source roster and open-menu refresh adapter are narrow version-specific compatibility seams. No DSH core files are patched.

The stable bootstrap can load versioned host filters without restarting DSH. It waits for candidate calls to finish and checks again after importing a release. Client changes may require a browser refresh. Bootstrap or host-version changes require separate compatibility review.

## Development

```sh
npm run build
```

Commit the generated host implementation and release manifest together. Tests and intermediate artifacts remain in the ignored `.cache/` directory.
