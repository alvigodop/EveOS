param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8766,
    [switch]$NoBrowser
)

Remove-Item -LiteralPath "$PSScriptRoot\app\assets\js\app.js" -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$PSScriptRoot\app\assets\js\taxonomy.js" -Force -ErrorAction SilentlyContinue
Set-Location $PSScriptRoot

$serverArguments = @(".\server.py", "--port", [string]$Port)
if ($NoBrowser) {
    $serverArguments += "--no-browser"
}

if (Get-Command py -ErrorAction SilentlyContinue) {
    & py @serverArguments
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python @serverArguments
} else {
    Write-Host "Python was not found. Install Python 3 and try again."
    Read-Host "Press Enter to close"
    exit 1
}

exit $LASTEXITCODE
