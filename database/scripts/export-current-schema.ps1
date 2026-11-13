# F00 Stage 2: READ-ONLY schema export. Does not modify the source database.
# Requirements: PostgreSQL pg_dump in PATH, DATABASE_URL in this PowerShell session.
# Usage from repo root: .\database\scripts\export-current-schema.ps1
# Never commit a URL/password or paste them into terminal logs.
[CmdletBinding()]
param([string]$Output = 'database/schema/current_public_schema.sql')
$ErrorActionPreference = 'Stop'
if (-not $env:DATABASE_URL) { throw 'DATABASE_URL is not set. Load your private local configuration into this PowerShell session.' }
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) { throw 'pg_dump not found. Install PostgreSQL client tools (matching or newer than the database server version) and add bin to PATH.' }
$path = [IO.Path]::GetFullPath((Join-Path (Get-Location) $Output))
$parent = Split-Path -Parent $path
New-Item -ItemType Directory -Force -Path $parent | Out-Null
# Dump schema only, public only. Suppresses owner and role-specific GRANT statements.
# Supabase-managed schemas (auth/storage/etc.) are intentionally not exported.
& $pgDump.Source --dbname="$env:DATABASE_URL" --schema=public --schema-only --no-owner --no-privileges --file="$path"
if ($LASTEXITCODE -ne 0) { throw "pg_dump exited with code $LASTEXITCODE" }
Write-Host "Schema exported to $path"
Write-Host 'NEXT: inspect for project-specific extensions, Supabase-auth dependencies and unexpected objects.'
Write-Host 'This is a candidate baseline, NOT an executable migration chain yet.'
