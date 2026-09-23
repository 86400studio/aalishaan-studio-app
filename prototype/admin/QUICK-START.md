# Aalishaan Admin - 86400 UI edition - Start here

## Replace the folder
1. Keep a backup of your current repository, including its current `admin` folder.
2. Extract `Aalishaan_Admin_86400_Final.zip`. It contains one top-level folder: `admin`.
3. Replace the existing `admin` folder in your repository with this extracted folder. The result is `your-repo/admin/index.html`, NOT `your-repo/admin/admin/index.html`.
4. Open the repository using its existing local server or deployment, then open `/admin/`. For a plain static-file preview, you can run `python -m http.server 8000` from the folder containing both `admin` and your website assets, then open `http://localhost:8000/admin/`. Use your normal project server when the website requires one.
5. Hard-refresh the admin page with Ctrl+Shift+R. Use HTTPS or the local server above for the private vault; do not double-click the HTML file.

Nothing outside the admin folder needs changing to install this release. No new package, build step, API key or database is required for this prototype. Do not run a public rebuild merely to review the new admin.

## Test one ordinary order
1. Open **Help & demo > Start normal order**, then confirm the scenario reset.
2. You will see one order, AS-1001. Select it; its workspace opens below the table.
3. Verify its demo payment. Open Ready to make, then reserve materials and release the job.
4. Open Printing. Start printing, then mark printing complete.
5. Open Quality check. Complete the five checks and record a sample evidence reference.
6. Open Packed. Complete the packing checks, measurements and sample evidence reference.
7. Open Pickup booked. Confirm serviceability and book the sample pickup.
8. Open Shipped. Record the sample physical handover evidence.
9. Open Out for delivery, then Delivered. Use the clearly labelled demo tracking actions.

A new browser starts with this one-order scenario. An existing A1 browser keeps its existing records on first load; use Help & demo to deliberately start the one-order walkthrough. The scenario reset retains your catalogue, uploaded files and staff records, but replaces demonstration orders, customers, cases and messages. It does not reset public bag or wishlist data.

## Upload and use private print files
1. Open **Products**, select the artwork, then open **Private files**.
2. Choose **Create passphrase** and keep that passphrase safely. There is no forgotten-passphrase recovery for encrypted contents.
3. Choose **Upload print file**, select the original, enter its version and save it. Keep the original outside this browser too.
4. Use **Download original** to retrieve the unchanged file for printing. PDF, TIFF, PSD/PSB, AI/EPS, ZIP, PNG, JPEG and WebP are supported, up to 100 MB per file.
5. Use **Add approval evidence** for rights or sample approvals. This is also private, not a public image slot.
6. Record the file/sample review under **Version approvals** before releasing production.
7. Open **Staff & Access > Download backup** after important uploads. Keep the backup outside your website repository.

New print versions are retained separately. Orders already released to production keep their pinned print version, rather than silently switching to the latest file. The order's Printing step offers the relevant original when present in this browser.

IMPORTANT: Files are stored in this browser's local database, not in the downloaded admin folder or a shared cloud drive. The same browser profile and website address are required to see them. Clearing site data, changing browser/device or changing the site's origin can make them unavailable. Use backup/restore to move your workspace. Keep both source files and backups. Large production libraries need a separately implemented protected storage service.

## Upload general/shared images without editing code
1. Open **Products > General images**.
2. Upload the final public image into its named size, material or frame/craft-reference slot.
3. Choose **Download replacement assets**.
4. Back up the repo. Extract that download and merge its `assets` folder into the repository root, allowing replacement of the matching images. Do not replace the whole existing assets folder.
5. Redeploy using your existing process when ready.

The download uses the existing approved asset filenames. No HTML, CSS or JavaScript editing is needed. Uploading alone previews the image locally; it does not automatically update the hosted website. This deliberate image-application step is separate from installing the admin replacement. Private files and product drafts are excluded from this export.

## What remains a prototype
Orders, refunds, courier events, provider tests, staff access and product publication are demonstrations. Contact buttons open your email/WhatsApp/SMS app; they do not verify sending. Product edits and Publish in demo do not change public pages or deploy a catalogue. Real protected login, shared records, provider integrations and automatic publication remain separate work, as agreed.

Only fictional customer/financial information should be entered here. Private print contents are encrypted locally, but this static admin is not an authenticated production business system.

## One-time check on your own browser
Before adding important print references, use a disposable sample file:
1. Upload it privately and download the original once.
2. Refresh the admin page, unlock the vault and confirm that the sample is still present and downloadable.
3. Download a full local backup. Restore that backup through Staff & Access, unlock again and check the sample.
4. Keep the original and backup even after this succeeds. Do not clear browser data as part of this check.

These checks confirm the normally served browser/storage behaviour that could not be certified in the offline test environment.
