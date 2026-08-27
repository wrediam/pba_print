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
# Use Invoke-WebRequest + ConvertFrom-Json rather than Invoke-RestMethod:
# on Windows PowerShell 5.1 the latter can hand back an HTML DOM object (or
# choke) depending on proxy/content-type, which is the likely cause of the
# "empty list". This path is explicit and predictable.
$depts = @()
try {
	$resp = Invoke-WebRequest -Uri "$base/api/departments" -UseBasicParsing -TimeoutSec 15
	$depts = @($resp.Content | ConvertFrom-Json)
} catch {
	Fail "Couldn't fetch the department list from $DashboardHost. ($($_.Exception.Message))"
}
if (-not $depts -or $depts.Count -eq 0 -or -not $depts[0].code) {
	Write-Host 'Server response (first 300 chars):' -ForegroundColor Yellow
	Write-Host ("$($resp.Content)".Substring(0, [Math]::Min(300, "$($resp.Content)".Length)))
	Fail 'No departments were returned by the server.'
}
Write-Host "Loaded $($depts.Count) departments." -ForegroundColor Green

# Numbered console selection is the reliable primary path (Out-GridView
# isn't present on every Windows and was the likely cause of the blank
# list). Optionally filter first, since there are many departments.
$filter = Read-Host 'Type part of a department name/code to narrow the list, or press Enter to see them all'
$shown = if ($filter.Trim()) {
	@($depts | Where-Object { "$($_.code) $($_.label)" -like "*$($filter.Trim())*" })
} else { $depts }
if ($shown.Count -eq 0) { $shown = $depts }

Write-Host ''
for ($i = 0; $i -lt $shown.Count; $i++) {
	'{0,3}: {1,-6} {2}' -f ($i + 1), $shown[$i].code, $shown[$i].label | Write-Host
}
$pick = Read-Host 'Enter the number(s) you print for, comma-separated (e.g. 1,4,7)'
$idx = $pick -split '[,\s]+' | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ - 1 }
$selected = @($idx | Where-Object { $_ -ge 0 -and $_ -lt $shown.Count } | ForEach-Object { $shown[$_] })
if (-not $selected -or $selected.Count -eq 0) { Fail 'No departments selected, so nothing was changed.' }

# 4. Remove any existing church queues on this PC ----------------------------
Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'Church_*' } | ForEach-Object {
	try {
		Remove-Printer -Name $_.Name -ErrorAction Stop
		Write-Host "Removed old queue: $($_.Name)"
	} catch { }
}

# 5. Provision + add each selected queue ------------------------------------
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
		if (Get-Printer -Name $name -ErrorAction SilentlyContinue) {
			Remove-Printer -Name $name -ErrorAction SilentlyContinue
		}
		# -IppURL (NOT -PortName/-DriverName) is what makes Windows actually
		# perform IPP "directed discovery" -- a real handshake with the
		# gateway to fetch its real capabilities (duplex, finishings,
		# copies) before creating the queue. -PortName + -DriverName (the
		# previous approach here) just registers the URL as a bare port
		# without ever querying it, so the class driver fell back to a
		# capability-less default and the print dialog showed no options
		# at all -- confirmed on a real install.
		#
		# -IppURL doesn't accept -Name, so Windows names the printer
		# itself (usually after whatever name the gateway's queue reports
		# over IPP) -- diff Get-Printer before/after to find the one that
		# just appeared, then rename it to our own convention.
		$before = @(Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
		Add-Printer -IppURL $portUrl -ErrorAction Stop
		Start-Sleep -Milliseconds 500
		$added = Get-Printer -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Name } | Select-Object -First 1
		if ($added -and $added.Name -ne $name) {
			if (Get-Printer -Name $name -ErrorAction SilentlyContinue) { Remove-Printer -Name $name -ErrorAction SilentlyContinue }
			Rename-Printer -Name $added.Name -NewName $name
		}
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
