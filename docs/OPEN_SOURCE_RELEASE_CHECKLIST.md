# Open Source Release Checklist

Use this checklist before every public release.

## 1) Secret Scan

- [ ] Run secret scan on full git history and working tree
- [ ] Confirm no API key/token/cookie appears in tracked files
- [ ] Confirm `.env*` and local credential files are ignored

Suggested tools:

- `gitleaks detect --source .`
- `trufflehog filesystem --directory .`

## 2) Branch Protection

- [ ] Protect `main` branch in GitHub settings
- [ ] Require PR reviews
- [ ] Require all required CI checks
- [ ] Disable force-push and delete on protected branch

## 3) Signed Releases

- [ ] Sign commits (GPG/SSH) for release PR
- [ ] Sign release tag (`git tag -s`)
- [ ] Sign release artifacts or update metadata

## 4) Licensing and Notices

- [ ] `LICENSE` present and correct
- [ ] `THIRD_PARTY_NOTICES.md` updated
- [ ] `package.json` and `Cargo.toml` contain explicit license fields

## 5) Security Policy

- [ ] `docs/SECURITY.md` has disclosure instructions
- [ ] Response SLA is documented
- [ ] Update-signing status is documented

## 6) Issue / PR Templates

- [ ] Bug template requires reproducible steps + environment
- [ ] PR template requires validation + security impact review

## 7) Docs Reproducibility

- [ ] Fresh machine install follows README successfully
- [ ] Build instructions are up to date
- [ ] Provider setup guide is up to date

## 8) Versioning

- [ ] Version bump consistent: `package.json`, `Cargo.toml`, `tauri.conf.json`
- [ ] Changelog/release notes prepared

## 9) Dependency Hygiene

- [ ] Dependabot enabled (`npm`, `cargo`, `github-actions`)
- [ ] `pnpm audit --audit-level=high` reviewed
- [ ] `cargo audit` reviewed

## 10) Provenance and Backup

- [ ] Create backup tag before publication
- [ ] Keep signed provenance notes (commit/tag/hash mapping)
- [ ] Publish with immutable release tag

## Preflight Command

Run automated baseline checks:

```bash
pnpm release:oss-check
```

Then complete the remaining manual checklist items above (for example branch protection and signed tag verification).
