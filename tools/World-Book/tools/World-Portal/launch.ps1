$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

try {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3 server.py
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python server.py
    }
    else {
        throw "Python 3 was not found. Install Python 3, then run launch.bat again."
    }

    if ($LASTEXITCODE -ne 0) {
        throw "World Portal exited with code $LASTEXITCODE."
    }
}
catch {
    Write-Host ""
    Write-Host "World Portal could not start:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}
