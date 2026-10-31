# ЧГУ.Ассистент — удаление
$me = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}
Write-Host ''
Write-Host '  ЧГУ.Ассистент — удаление' -ForegroundColor Yellow
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*assistant.ps1*' } |
    ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null }
Get-Process llama-server -ErrorAction SilentlyContinue | Where-Object { $_.Path -like 'C:\ChGU-Assistant\*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'ChGU-Assistant' -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ЧГУ.Ассистент.lnk') -Force -ErrorAction SilentlyContinue
Write-Host '  Автозапуск и ярлык удалены.' -ForegroundColor Green
if ((Read-Host '  Удалить и папку C:\ChGU-Assistant (вместе со встроенной моделью, журналом и заявками)? (Д/Н)').Trim().ToLower() -in 'д', 'да', 'y') {
    Set-Location $env:TEMP
    Remove-Item 'C:\ChGU-Assistant' -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '  Папка удалена.' -ForegroundColor Green
}
Write-Host '  Ollama и модель (если ставились) удаляются отдельно: Параметры → Приложения → Ollama.' -ForegroundColor DarkGray
Read-Host '  Нажмите Enter, чтобы закрыть окно'
