# Builds web/ into dist/. node_modules lives outside OneDrive, in the build folder.
$ErrorActionPreference = 'Stop'
$b = Join-Path $env:LOCALAPPDATA 'rnd-cc-build'

robocopy "$PSScriptRoot\web" $b /MIR /XD node_modules dist | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy web failed ($LASTEXITCODE)" }

Push-Location $b
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed ($LASTEXITCODE)" }
} finally { Pop-Location }

Copy-Item "$b\package-lock.json" "$PSScriptRoot\web\package-lock.json" -Force

robocopy "$b\dist" "$PSScriptRoot\dist" /MIR | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy dist failed ($LASTEXITCODE)" }

Write-Host "Build OK: $PSScriptRoot\dist"
exit 0
