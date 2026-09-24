#requires -Version 5.1
<#
  launch-fieldmeasure.ps1 - one-click launcher for the Field Measure beta.

  What it does, in order:
    1. Kills any EXISTING Field Measure processes (the preview server on the port, plus
       the app's own dedicated Chrome profile). It never touches your personal Chrome.
    2. Builds the app (npm run build).
    3. Starts `vite preview` on the port, hidden, logging to %LOCALAPPDATA%\FieldMeasure.
    4. Waits for the port to answer HTTP, then opens Chrome.

  WHY IT BUILDS AND NEVER USES `npm run dev`:
  the app ships a strict CSP (`style-src 'self'`, build spec section 2.2) which blocks Vite's
  dev-mode inline styles. `npm run dev` therefore serves UNSTYLED raw HTML - it can never
  render the app correctly (documented as D105 in `playwright.clickthru.config.ts`).
  The only launch path that renders is build + preview.

  WHY A DEDICATED CHROME PROFILE:
  `--user-data-dir` points at its own profile folder, so killing "related" Chrome processes
  can never close your personal browsing tabs. As a bonus it gives a clean window with no
  extensions, and lets Field Measure install as a real PWA in that profile.

  USAGE
    .\tools\launch-fieldmeasure.ps1                 # rebuild, restart, open Chrome
    .\tools\launch-fieldmeasure.ps1 -SkipBuild      # reuse the existing dist (faster)
    .\tools\launch-fieldmeasure.ps1 -Stop           # stop everything, launch nothing
    .\tools\launch-fieldmeasure.ps1 -InstallShortcut  # create the Desktop shortcut too
#>
[CmdletBinding()]
param(
  [int]$Port = 4173,
  [switch]$SkipBuild,
  [switch]$Stop,
  [switch]$InstallShortcut
)

$ErrorActionPreference = 'Stop'

# --- Paths -------------------------------------------------------------------
$Repo = Split-Path -Parent $PSScriptRoot          # script lives in <repo>\tools
$StateDir = Join-Path $env:LOCALAPPDATA 'FieldMeasure'
$ChromeProfile = Join-Path $StateDir 'chrome-profile'
$OutLog = Join-Path $StateDir 'preview.out.log'
$ErrLog = Join-Path $StateDir 'preview.err.log'

if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Path $StateDir -Force | Out-Null }

# npm.ps1 is blocked by execution policy on this machine; npm.cmd must be reachable,
# and PowerShell will not always have the Node directory on PATH.
if (Test-Path 'C:\Program Files\nodejs') {
  $env:Path = 'C:\Program Files\nodejs;' + $env:Path
}

function Write-Step  { param([string]$Text) Write-Host "  $Text" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Text) Write-Host "  OK  $Text" -ForegroundColor Green }
function Write-Warn2 { param([string]$Text) Write-Host "  !!  $Text" -ForegroundColor Yellow }

# --- Kill helpers ------------------------------------------------------------

# taskkill writes diagnostics to stderr ("process not found" when a pid vanished
# between enumeration and the kill). Under $ErrorActionPreference='Stop' PowerShell
# converts native stderr into a TERMINATING NativeCommandError, which would abort the
# whole launch mid-way. This wrapper downgrades the preference for the call and never
# throws. A pid that is already gone is a success, not a failure.
function Invoke-Taskkill {
  param([int]$ProcessId)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & taskkill /PID $ProcessId /T /F 2>&1 | Out-Null
  } catch {
    # deliberately swallowed: the process is already gone
  } finally {
    $ErrorActionPreference = $prev
  }
}

# Kill whatever is listening on the port, WITH its child tree (npm.cmd -> node).
function Stop-PortOwner {
  param([int]$P)
  $conns = Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue
  $killed = 0
  foreach ($c in $conns) {
    $owner = $c.OwningProcess
    if ($owner -and $owner -ne 0) {
      Invoke-Taskkill -ProcessId $owner
      $killed++
    }
  }
  return $killed
}

# Belt-and-braces: a stray vite preview for THIS repo whose port bind already dropped.
# Matches on the repo path AND vite, so it cannot catch an unrelated project's server.
function Stop-StrayViteForRepo {
  $killed = 0
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    if (-not $p) { continue }
    $cmd = [string]$p.CommandLine
    if ($cmd -and ($cmd -like "*$Repo*") -and ($cmd -match 'vite')) {
      Invoke-Taskkill -ProcessId $p.ProcessId
      $killed++
    }
  }
  return $killed
}

# Chrome processes bound to the app's dedicated profile. Personal Chrome processes use a
# different --user-data-dir and are never matched. Edge is matched too (the fallback browser).
function Get-AppBrowserProcs {
  $all = @()
  foreach ($exe in @('chrome.exe', 'msedge.exe')) {
    $procs = Get-CimInstance Win32_Process -Filter "Name='$exe'" -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
      $cmd = [string]$p.CommandLine
      if ($p -and $cmd -and ($cmd -like "*$ChromeProfile*")) { $all += $p }
    }
  }
  return $all
}

# Close the app browser GRACEFULLY first, then force only what is left.
#
# WHY: the folder permission ("Allow on every visit") and other site settings live in the
# profile's Preferences file, which Chrome writes lazily and on a clean exit. A `taskkill /F`
# on every launch can throw that write away, so the next launch comes up asking for the
# projects folder again. CloseMainWindow() is the same as clicking the window's X.
function Stop-AppChrome {
  $procs = @(Get-AppBrowserProcs)
  if ($procs.Count -eq 0) { return 0 }
  foreach ($p in $procs) {
    try {
      $gp = Get-Process -Id $p.ProcessId -ErrorAction Stop
      if ($gp.MainWindowHandle -ne [IntPtr]::Zero) { [void]$gp.CloseMainWindow() }
    } catch {
      # already gone
    }
  }
  $deadline = (Get-Date).AddSeconds(8)
  while ((Get-Date) -lt $deadline -and @(Get-AppBrowserProcs).Count -gt 0) {
    Start-Sleep -Milliseconds 250
  }
  # Anything still alive after the grace period (a hung window, a headless helper) is forced.
  foreach ($p in @(Get-AppBrowserProcs)) {
    if ($p) { Invoke-Taskkill -ProcessId $p.ProcessId }
  }
  return $procs.Count
}

# --- Browser resolution ------------------------------------------------------
function Resolve-Browser {
  $candidates = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  )
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  # Fallback: Edge ships on every Surface; the same profile-isolation flags apply.
  foreach ($c in @(
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
  )) { if (Test-Path $c) { return $c } }
  return $null
}

Write-Host ''
Write-Host 'Field Measure - launcher' -ForegroundColor White
Write-Host "  repo   $Repo"
Write-Host "  state  $StateDir"
Write-Host ''

# --- 1. stop the existing instance -------------------------------------------
Write-Step 'Stopping any existing Field Measure processes...'
$n = Stop-PortOwner -P $Port
if ($n -gt 0) { Write-Ok "stopped $n process(es) listening on port $Port" }
else { Write-Ok "nothing listening on port $Port" }

$n = Stop-StrayViteForRepo
if ($n -gt 0) { Write-Ok "stopped $n stray vite process(es) for this repo" }

$n = Stop-AppChrome
if ($n -gt 0) { Write-Ok "stopped $n app Chrome process(es) (dedicated profile only)" }
else { Write-Ok 'no app Chrome processes were running' }

# Give Windows a moment to release the port and the profile lock.
Start-Sleep -Milliseconds 700

if ($Stop) {
  Write-Host ''
  Write-Host 'Stopped. Nothing launched (-Stop).' -ForegroundColor White
  Write-Host ''
  exit 0
}

# --- 2. build ----------------------------------------------------------------
if ($SkipBuild) {
  Write-Step 'Skipping build (-SkipBuild).'
  if (-not (Test-Path (Join-Path $Repo 'dist\index.html'))) {
    Write-Warn2 'dist\index.html is missing - a full build is required this time.'
    $SkipBuild = $false
  }
}

if (-not $SkipBuild) {
  Write-Step 'Building (vite build)...'
  $buildLog = Join-Path $StateDir 'build.log'
  $buildErr = Join-Path $StateDir 'build.err.log'
  # Start-Process, not `& npm.cmd`: vite writes progress/warnings to stderr, and under
  # $ErrorActionPreference='Stop' PowerShell turns a native command's stderr into a
  # terminating NativeCommandError even when the build SUCCEEDED. Redirecting to files
  # and reading $bp.ExitCode is the reliable way to judge a build.
  $bp = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'build') `
    -WorkingDirectory $Repo -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $buildLog -RedirectStandardError $buildErr
  if ($bp.ExitCode -ne 0) {
    Write-Warn2 "build failed (exit $($bp.ExitCode)). Tail of $buildLog :"
    if (Test-Path $buildLog) { Get-Content $buildLog -Tail 25 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray } }
    if (Test-Path $buildErr) { Get-Content $buildErr -Tail 25 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray } }
    Write-Host ''
    Write-Host 'Press Enter to close.' -ForegroundColor White
    Read-Host | Out-Null
    exit 1
  }
  Write-Ok 'build complete'
}

# --- 3. start the preview server ---------------------------------------------
Write-Step "Starting preview server on port $Port..."
Start-Process -FilePath 'npm.cmd' `
  -ArgumentList @('run', 'preview', '--', '--port', "$Port", '--strictPort', '--host') `
  -WorkingDirectory $Repo `
  -WindowStyle Hidden `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog | Out-Null

# Wait for the port to actually bind (server boot ~0.5-3 s).
$url = "http://localhost:$Port/"
$ready = $false
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 400
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
}

if (-not $ready) {
  Write-Warn2 "the server did not bind port $Port within 45 s."
  Write-Warn2 "check the log: $OutLog"
  if (Test-Path $ErrLog) { Get-Content $ErrLog -Tail 20 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray } }
  if (Test-Path $OutLog) { Get-Content $OutLog -Tail 20 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray } }
  Write-Host ''
  Write-Host 'Press Enter to close.' -ForegroundColor White
  Read-Host | Out-Null
  exit 1
}

# Confirm it actually answers HTTP, not merely that the socket is open.
$httpOk = $false
for ($i = 0; $i -lt 20; $i++) {
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    if ($resp.StatusCode -eq 200) { $httpOk = $true; break }
  } catch { Start-Sleep -Milliseconds 400 }
}
if ($httpOk) { Write-Ok "server is up: $url" }
else { Write-Warn2 'port is bound but HTTP did not answer 200 - opening anyway.' }

# --- 4. open the browser -----------------------------------------------------
$browser = Resolve-Browser
if (-not $browser) {
  Write-Warn2 'Neither Chrome nor Edge was found. Open this URL manually:'
  Write-Host "    $url" -ForegroundColor White
} else {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($browser)
  Write-Step "Opening in $name (dedicated app profile)..."
  Start-Process -FilePath $browser -ArgumentList @(
    "--user-data-dir=$ChromeProfile",
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate',
    $url
  ) | Out-Null
  Write-Ok "browser opened; profile: $ChromeProfile"
}

# LAN address, so the Surface can reach the same server for the hardware pass.
$lan = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress -First 1
if ($lan) {
  Write-Host ''
  Write-Host "  On the Surface, open:  http://${lan}:$Port/" -ForegroundColor White
  Write-Host '  (emulation only - the clickthru harness still never promotes a [Surface] row)'
}

# --- optional: install the Desktop shortcut ----------------------------------
if ($InstallShortcut) {
  Write-Host ''
  Write-Step 'Installing the Desktop shortcut...'
  $desktop = [Environment]::GetFolderPath('Desktop')
  $lnkPath = Join-Path $desktop 'Field Measure.lnk'
  $scriptPath = Join-Path $PSScriptRoot 'launch-fieldmeasure.ps1'
  $iconSource = if ($browser) { $browser } else { 'shell32.dll' }

  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut($lnkPath)
  $lnk.TargetPath = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
  $lnk.WorkingDirectory = $Repo
  $lnk.IconLocation = "$iconSource,0"
  $lnk.Description = 'Launch Field Measure (rebuild, restart the server, open in Chrome)'
  $lnk.Save()
  Write-Ok "shortcut created: $lnkPath"
}

Write-Host ''
Write-Host 'Field Measure is running.' -ForegroundColor Green
Write-Host "  $url"
Write-Host ''
