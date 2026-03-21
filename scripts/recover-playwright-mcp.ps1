param(
  [string]$ProfileDir = "$env:LOCALAPPDATA\ms-playwright\mcp-chrome"
)

$ErrorActionPreference = 'Stop'

function Get-McpChromeProcesses {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq 'chrome.exe' -and
      $_.CommandLine -like "*$ProfileDir*"
    }
}

Write-Output "Playwright MCP profile: $ProfileDir"

if (-not (Test-Path $ProfileDir)) {
  Write-Output 'Profile directory does not exist. Nothing to recover.'
  exit 0
}

$processes = @(Get-McpChromeProcesses)
if ($processes.Count -gt 0) {
  $processIds = $processes | Select-Object -ExpandProperty ProcessId
  Write-Output ("Stopping mcp-chrome processes: " + ($processIds -join ', '))
  foreach ($processId in $processIds) {
    cmd /c "taskkill /PID $processId /F >nul 2>nul" | Out-Null
  }
  Start-Sleep -Milliseconds 750
} else {
  Write-Output 'No active mcp-chrome processes found.'
}

$lockFiles = @(
  'lockfile',
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket'
) | ForEach-Object { Join-Path $ProfileDir $_ } | Where-Object { Test-Path $_ }

if ($lockFiles.Count -gt 0) {
  Write-Output ("Removing stale lock files: " + ($lockFiles -join ', '))
  foreach ($lockFile in $lockFiles) {
    Remove-Item $lockFile -Force
  }
} else {
  Write-Output 'No stale lock files found.'
}

$remaining = @(Get-McpChromeProcesses | Select-Object -ExpandProperty ProcessId)
if ($remaining.Count -gt 0) {
  Write-Output ("Recovery incomplete. Remaining mcp-chrome processes: " + ($remaining -join ', '))
  exit 1
}

Write-Output 'Playwright MCP profile is clear.'
