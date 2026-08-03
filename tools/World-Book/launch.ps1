Remove-Item -LiteralPath "$PSScriptRoot\app\assets\js\app.js" -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$PSScriptRoot\app\assets\js\taxonomy.js" -Force -ErrorAction SilentlyContinue
Set-Location $PSScriptRoot

if (Get-Command py -ErrorAction SilentlyContinue) {
    py .\server.py
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    python .\server.py
} else {
    Write-Host "Python was not found. Install Python 3 and try again."
    Read-Host "Press Enter to close"
}
