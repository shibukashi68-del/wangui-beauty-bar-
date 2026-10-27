$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

Push-Location $projectRoot
try {
  if (-not [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    throw 'DATABASE_URL is set in this terminal. Clear it before starting locally so the app does not connect to a hosted database.'
  }

  if ([string]::IsNullOrWhiteSpace($env:PGHOST)) { $env:PGHOST = '127.0.0.1' }
  if ([string]::IsNullOrWhiteSpace($env:PGPORT)) { $env:PGPORT = '5432' }
  if ([string]::IsNullOrWhiteSpace($env:PGUSER)) { $env:PGUSER = 'postgres' }
  if ([string]::IsNullOrWhiteSpace($env:PGDATABASE)) { $env:PGDATABASE = 'wangui_beauty_bar' }

  $port = 0
  if (-not [int]::TryParse($env:PGPORT, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
    throw 'PGPORT must be a number between 1 and 65535. In PowerShell, run $env:PGPORT = $null and try again.'
  }
  $env:PGPORT = $port.ToString()

  Write-Host "Using PostgreSQL at $($env:PGHOST):$($env:PGPORT)"
  Write-Host "Database: $($env:PGDATABASE); user: $($env:PGUSER)"
  Write-Host 'These values come from this terminal or the local defaults. The next prompt is only for the PostgreSQL password.'

  $securePgPassword = Read-Host 'PostgreSQL password' -AsSecureString
  $env:PGPASSWORD = (New-Object System.Net.NetworkCredential('', $securePgPassword)).Password
  if ([string]::IsNullOrEmpty($env:PGPASSWORD)) {
    throw 'A PostgreSQL password is required.'
  }

  Write-Host 'Applying database migrations...'
  & npm.cmd run migrate
  if ($LASTEXITCODE -ne 0) {
    throw 'Database migrations failed. Check the PostgreSQL error above and confirm the database exists and this user can create tables.'
  }

  Write-Host 'Starting Wangui Beauty Bar. Open http://localhost:3000; press Ctrl+C to stop.'
  & npm.cmd start
  if ($LASTEXITCODE -ne 0) {
    throw "The website stopped with exit code $LASTEXITCODE."
  }
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Pop-Location
}
