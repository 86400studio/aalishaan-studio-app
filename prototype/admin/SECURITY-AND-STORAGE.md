# Security and storage boundaries

## Private print originals and approval evidence
Contents are encrypted before they enter the local private-file store. The implementation uses WebCrypto AES-GCM with random per-file IVs and a passphrase-derived key; file ID, product, category and version are authenticated with the ciphertext. Original-file SHA-256 is checked after decryption and before download. Original bytes are not resized or compressed.

The key is kept in memory while unlocked. Sign-out/page exit and 15 minutes without private-file activity lock the vault. There is no passphrase reset that recovers encrypted contents. Keep original files and the passphrase independently.

Filenames, product associations, versions, dates, sizes, notes and verification fingerprints are metadata, not encrypted content. This vault is not a server login, a multi-user security boundary, or protection from malicious scripts executing in the same site origin. Do not treat a publicly hosted static prototype as production authentication.

The private store is not included in product image slots or shared-image exports. Full backups do include encrypted private contents; the passphrase/key is not placed in the backup.

## Local persistence
Records use the existing A1 localStorage key. Uploaded files use the A2 IndexedDB database. Browser storage is profile- and origin-specific and is not a shared/durable business database. Site-data deletion, private browsing, storage pressure, device loss or an origin change can make data unavailable. Requesting persistent storage is a browser request, not a guarantee.

Use one active admin editing tab. Original record revision checks block stale saves, but this local prototype is not a multi-user transactional file service. Keep source masters externally; take backups regularly. Never commit backups or print files to the public static site.

Limits: 100 MB per private upload; 25 MB per public image; 512 MB per combined backup/restore. This is intended for prototype review and a small local reference library, not a production archival system.

## Public images
Only PNG, JPEG and WebP are accepted. Public uploads are explicitly confirmed as public. The image must decode successfully and meet the minimum dimensions. Canvas creates a compressed preview; the original is retained separately. Shared replacements are written only to the allowlisted existing asset filenames.

General-image replacement files are public. Apply them by merging the exported assets into the repo and redeploying deliberately. Installing the admin folder alone does not apply image overrides or change public pages.

## Backups and restore
A full backup contains fictional admin records, public-image originals, metadata, vault configuration and encrypted private contents. Only the private contents are encrypted. Store the complete archive outside the website; never upload it to a public asset folder.

Restore validates the expected format, entry paths, CRCs, core records, price/identity fields and file sizes before replacement. A rollback snapshot is prepared; the local vault is locked after restoring. IndexedDB and localStorage are separate storage systems, so this remains best-effort local recovery rather than a production database transaction. Always retain a downloaded backup of the current workspace before restoring.

Use an unmodified backup produced by this release. The ZIP reader intentionally does not accept arbitrary third-party ZIP packages. A retained source original is still the best fallback for a damaged archive or forgotten passphrase.

## Live integrations
Never enter provider secrets, real payment data or confidential customer information. All provider outcomes, account permissions and catalogue publication in this build are demonstrations. Contact buttons open an external composer and record that attempt; no sent/delivered state is inferred from opening it.
