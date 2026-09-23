$ErrorActionPreference = 'Stop'
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
& node (Join-Path $PSScriptRoot 'development-baseline.cjs')
if ($LASTEXITCODE -ne 0) { throw 'The source differs from the reviewed development reference.' }
$releaseRoot = Join-Path $workspaceRoot 'releases'
$zipPath = Join-Path $releaseRoot 'Aalishaan-Studio-Prototype.zip'
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
# Explicit source allowlist prevents caches, old exports and nested ZIPs entering the handoff.
$include = (& node -e "process.stdout.write(JSON.stringify(require('./scripts/source-files.cjs').include))" | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Could not read the source allowlist.' }
$files = @()
foreach ($name in $include) {
 $item = Get-Item -LiteralPath (Join-Path $workspaceRoot $name)
 if ($item.PSIsContainer) { $files += Get-ChildItem -LiteralPath $item.FullName -File -Recurse -Force } else { $files += $item }
}
if (Test-Path -LiteralPath $zipPath) {
 if (-not ([System.IO.Path]::GetFullPath($zipPath)).StartsWith($releaseRoot + '\')) { throw 'Invalid archive path' }
 Remove-Item -LiteralPath $zipPath
}
$archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
 foreach ($file in $files) {
  if (-not $file.FullName.StartsWith($workspaceRoot + '\')) { throw 'Source escapes workspace' }
  $relative = $file.FullName.Substring($workspaceRoot.Length + 1).Replace('\','/')
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
 }
} finally { $archive.Dispose() }
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
 if ($archive.Entries.Count -ne $files.Count) { throw 'Archive count mismatch' }
 foreach ($entry in $archive.Entries) {
  $source = Get-Item -LiteralPath (Join-Path $workspaceRoot $entry.FullName)
  if ($entry.Length -ne $source.Length) { throw "Archive length mismatch: $($entry.FullName)" }
  $sourceHash = (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  $entryStream = $entry.Open()
  try { $archiveHash = [BitConverter]::ToString($hasher.ComputeHash($entryStream)).Replace('-', '') }
  finally { $entryStream.Dispose(); $hasher.Dispose() }
  if ($archiveHash -ne $sourceHash) { throw "Archive content mismatch: $($entry.FullName)" }
 }
} finally { $archive.Dispose() }
Write-Output "Ready: $zipPath"
Write-Output "$($files.Count) source files; $([math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 1)) MB"
