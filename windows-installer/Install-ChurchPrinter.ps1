<#
  Install-ChurchPrinter.ps1

  Windows equivalent of the "Fix Church Printer" macOS app. Sets up church
  copier print queues that go through the print GATEWAY (see
  docs/GATEWAY_MIGRATION.md in the pba_print repo).

  It mirrors the Mac installer step for step:
    1. Ask for the person's own printer code and VERIFY it against the
       dashboard (so an unknown/mistyped code is caught up front).
    2. Fetch the department list and let the user pick which they print for.
    3. For each, ask the dashboard to provision a gateway queue and add a
       local Windows printer pointed at the URI it returns.

  The account code and color/finishing policy live on the gateway queue,
  never on this PC -- same design as the Mac side. This PC just gets a
  driverless IPP printer pointed at the gateway.

  Requires Windows 10 1809+ (for the built-in "Microsoft IPP Class
  Driver") and administrator rights to add printers (the .bat launcher
  elevates automatically).
#>

[CmdletBinding()]
param(
	# The dashboard that fronts the gateway -- same host the Mac scripts use.
	[string]$DashboardHost = '192.168.8.235:3000',
	[string]$PersonalCode
)

$ErrorActionPreference = 'Stop'
$base = "http://$DashboardHost"

function Fail($msg) {
	Write-Host ''
	Write-Host "ERROR: $msg" -ForegroundColor Red
	Read-Host 'Press Enter to close'
	exit 1
}

Write-Host 'Church Copier Setup (Windows)' -ForegroundColor Cyan
Write-Host '-----------------------------'

# 1. Personal code -----------------------------------------------------------
if (-not $PersonalCode) {
	$PersonalCode = Read-Host 'Enter your personal printer code (just your number, e.g. 598 -- not a department code)'
}
$PersonalCode = "$PersonalCode".Trim()
if (-not $PersonalCode) { Fail 'No personal code entered, so nothing was changed.' }

# 2. Verify the code against the dashboard's people list ---------------------
try {
	$v = Invoke-RestMethod -Uri "$base/api/people/verify?code=$PersonalCode" -TimeoutSec 10
} catch {
	Fail "Couldn't reach the printer server ($DashboardHost) to check your code. Connect to the church network and try again."
}
if (-not $v.valid) {
	Fail "That personal code ($PersonalCode) isn't recognized. Please check it with the church office and try again."
}
Write-Host "Setting up the copier for: $($v.name)" -ForegroundColor Green
$ans = Read-Host "If that's not you, type N to cancel. Continue? [Y/n]"
if ($ans -match '^[Nn]') { exit 0 }

# 3. Departments -------------------------------------------------------------
try {
	$depts = @(Invoke-RestMethod -Uri "$base/api/departments" -TimeoutSec 10)
} catch {
	Fail "Couldn't fetch the department list from $DashboardHost."
}
if (-not $depts -or $depts.Count -eq 0) { Fail 'No departments were returned by the server.' }

$selected = $null
if (Get-Command Out-GridView -ErrorAction SilentlyContinue) {
	$selected = @($depts | Select-Object code, label |
		Out-GridView -Title 'Select every department you print for (Ctrl-click for more than one), then click OK' -PassThru)
}
if (-not $selected -or $selected.Count -eq 0) {
	# Fallback for Server Core / no Out-GridView: numbered console prompt.
	Write-Host ''
	Write-Host 'Departments:'
	for ($i = 0; $i -lt $depts.Count; $i++) {
		'{0,3}: {1} - {2}' -f ($i + 1), $depts[$i].code, $depts[$i].label
	}
	$pick = Read-Host 'Enter the numbers you print for, comma-separated (e.g. 1,4,7)'
	$idx = $pick -split '[,\s]+' | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ - 1 }
	$selected = @($idx | Where-Object { $_ -ge 0 -and $_ -lt $depts.Count } | ForEach-Object { $depts[$_] })
}
if (-not $selected -or $selected.Count -eq 0) { Fail 'No departments selected, so nothing was changed.' }

# 4. Remove any existing church queues on this PC ----------------------------
Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'Church_*' } | ForEach-Object {
	try {
		Remove-Printer -Name $_.Name -ErrorAction Stop
		Write-Host "Removed old queue: $($_.Name)"
	} catch { }
}

# 5. Provision + add each selected queue ------------------------------------
$driver = 'Microsoft IPP Class Driver'
$results = @()
foreach ($d in $selected) {
	$deptCode = "$($d.code)"
	$body = @{ personCode = $PersonalCode; departmentCode = $deptCode } | ConvertTo-Json -Compress
	try {
		$r = Invoke-RestMethod -Uri "$base/api/gateway/provision" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 25
	} catch {
		$results += "FAILED  $($d.label): the gateway couldn't provision a queue ($($_.Exception.Message))"
		continue
	}
	if (-not $r.uri) { $results += "FAILED  $($d.label): server returned no print URI"; continue }

	# Windows Internet Printing uses an http:// port on 631 (IPP is HTTP).
	$portUrl = $r.uri -replace '^ipp://', 'http://'

	$safe = ($d.label -replace '[^A-Za-z0-9]+', '_').Trim('_')
	if ($safe.Length -gt 40) { $safe = $safe.Substring(0, 40) }
	$name = "Church_${deptCode}_$safe"

	try {
		if (-not (Get-PrinterPort -Name $portUrl -ErrorAction SilentlyContinue)) {
			Add-PrinterPort -Name $portUrl -ErrorAction Stop
		}
		if (Get-Printer -Name $name -ErrorAction SilentlyContinue) {
			Remove-Printer -Name $name -ErrorAction SilentlyContinue
		}
		Add-Printer -Name $name -DriverName $driver -PortName $portUrl -ErrorAction Stop
		$results += "OK      $($d.label)  ->  $name"
	} catch {
		$results += "FAILED  $($d.label): $($_.Exception.Message)"
	}
}

Write-Host ''
Write-Host '==== Setup complete ====' -ForegroundColor Cyan
$results | ForEach-Object {
	if ($_ -like 'OK*') { Write-Host $_ -ForegroundColor Green } else { Write-Host $_ -ForegroundColor Yellow }
}
Write-Host ''
Read-Host 'Press Enter to close'
