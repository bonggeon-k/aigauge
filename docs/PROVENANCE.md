# Provenance and Authorship Verification

This file documents how to verify that an AIGauge release originates from the maintainer repository and signed source history.

## 1) Verify Git Remote

```bash
git remote -v
```

Expected origin:

- `https://github.com/bonggeon-k/aigauge.git`

## 2) Verify Commit Integrity

If signed commits are enabled:

```bash
git log --show-signature -n 20
```

Check that recent release commits show valid signatures from the maintainer key.

## 3) Verify Signed Tag

```bash
git tag -v v1.1.0
```

Tag verification should succeed and map to the intended release commit.

## 4) Verify Release Mapping

```bash
git rev-parse v1.1.0
git show --oneline --no-patch v1.1.0
```

Keep the release notes and tag hash in sync.

## 5) Verify Build Metadata

At minimum record:

- release tag
- commit SHA
- build date (UTC)
- CI workflow run URL

## 6) Backup Tag Convention

Before public push, create a local backup tag:

```bash
git tag backup/local-save-$(date +%Y%m%d-%H%M%S)
```

For public backup tags:

```bash
git tag pre-public-backup-YYYYMMDD
git push origin pre-public-backup-YYYYMMDD
```

## 7) Artifact Verification (Recommended)

When artifact signing is enabled, publish checksums/signatures and verify locally:

```bash
sha256sum <artifact>
```

Compare against published checksum/signature files.
