# ЧГУ.Ассистент — установка: копирует программу в C:\ChGU-Assistant,
# включает автозапуск с правами администратора (без запросов Windows при каждом входе)
# Языковая модель Qwen3.5-0.8B уже лежит в папке llm (llama.cpp) — ставить ничего не нужно.
# Если папки llm нет — по желанию ставит Ollama и модель из интернета.

# --- запуск от имени администратора ---
$me = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'ЧГУ.Ассистент — установка'
$src = $PSScriptRoot
$dst = 'C:\ChGU-Assistant'
$task = 'ChGU-Assistant'

function Say([string]$t, [string]$c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Ask([string]$q) { (Read-Host "$q (Д/Н)").Trim().ToLower() -in 'д', 'да', 'y', 'yes', 'l' }

try {
    Say ''
    Say '  ЧГУ.Ассистент — установка' 'Green'
    Say '  ─────────────────────────' 'Green'
    Say ''

    # 1. Останавливаем запущенную копию
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*assistant.ps1*' } |
        ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate -ErrorAction SilentlyContinue | Out-Null }
    # и встроенную модель (иначе файлы в папке llm заняты)
    Get-Process llama-server -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$dst\*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500

    # 2. Копируем файлы
    Say "Шаг 1/4. Копирую программу в $dst …"
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    if ((Resolve-Path $src).Path.TrimEnd('\') -ne $dst) {
        Get-ChildItem -LiteralPath $src -Force | Where-Object { $_.Name -notin 'logs', 'tickets' } |
            Copy-Item -Destination $dst -Recurse -Force
    }
    Get-ChildItem -LiteralPath $dst -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
    # пользователи без прав администратора тоже смогут писать журнал и заявки
    icacls $dst /grant '*S-1-5-32-545:(OI)(CI)M' /T /Q | Out-Null
    Say '         готово' 'Green'

    # 3. Автозапуск при входе в Windows с наивысшими правами
    Say 'Шаг 2/4. Включаю автозапуск с правами администратора…'
    $user = "$env:USERDOMAIN\$env:USERNAME"
    $act = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $dst `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dst\assistant.ps1`" -NoElevate"
    $trg = New-ScheduledTaskTrigger -AtLogOn -User $user
    $prn = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
    $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $task -Action $act -Trigger $trg -Principal $prn -Settings $set -Force | Out-Null
    Say "         готово (для пользователя $user)" 'Green'

    # 4. Ярлык на рабочем столе
    Say 'Шаг 3/4. Создаю ярлык «ЧГУ.Ассистент» на рабочем столе…'
    $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ЧГУ.Ассистент.lnk'
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($lnk)
    $sc.TargetPath = "$env:SystemRoot\System32\schtasks.exe"
    $sc.Arguments = "/run /tn `"$task`""
    $sc.WindowStyle = 7
    $sc.IconLocation = "$dst\assistant.ico,0"
    $sc.Description = 'Запустить ЧГУ.Ассистент'
    $sc.Save()
    Say '         готово' 'Green'

    # 5. Языковая модель (по желанию)
    Say 'Шаг 4/4. Языковая модель — для свободных вопросов и презентаций по любой теме.'
    Say '         Исправление неполадок работает и без неё.' 'DarkGray'
    $ollama = (Get-Command ollama -ErrorAction SilentlyContinue).Source
    if (-not $ollama -and (Test-Path "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe")) { $ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" }
    $ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
    $model = if ($ramGB -ge 16) { 'qwen3:8b' } else { 'qwen3:4b' }
    $sizeTxt = if ($model -eq 'qwen3:8b') { '5,2 ГБ' } else { '2,5 ГБ' }

    $bundled = (Test-Path "$dst\llm\llama-server.exe") -and @(Get-ChildItem "$dst\llm" -Filter '*.gguf' -ErrorAction SilentlyContinue).Count
    if ($bundled) {
        $gg = (Get-ChildItem "$dst\llm" -Filter '*.gguf' | Sort-Object Length -Descending | Select-Object -First 1).Name
        Say "         Встроенная модель уже в комплекте ($gg) — интернет и Ollama не нужны." 'Green'
        $wantModel = $false
    } else {
        $wantModel = Ask "         Установить Ollama и модель $model (нужен интернет, скачается около $sizeTxt + 1 ГБ)?"
    }
    if ($wantModel) { try {
        if (-not $ollama) {
            Say '         Скачиваю Ollama…'
            $setup = Join-Path $env:TEMP 'OllamaSetup.exe'
            $winget = Get-Command winget -ErrorAction SilentlyContinue
            $ok = $false
            if ($winget) {
                & winget install -e --id Ollama.Ollama --accept-package-agreements --accept-source-agreements --silent
                $ok = ($LASTEXITCODE -eq 0)
            }
            if (-not $ok) {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile $setup -UseBasicParsing
                Start-Process $setup -ArgumentList '/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES' -Wait
            }
            $ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
            if (-not (Test-Path $ollama)) { $ollama = (Get-Command ollama -ErrorAction SilentlyContinue).Source }
        }
        if ($ollama -and (Test-Path $ollama)) {
            $up = $false
            try { Invoke-RestMethod 'http://localhost:11434/api/tags' -TimeoutSec 3 | Out-Null; $up = $true } catch { }
            if (-not $up) { Start-Process $ollama -ArgumentList 'serve' -WindowStyle Hidden; Start-Sleep -Seconds 5 }
            Say "         Скачиваю модель $model — это может занять 5–30 минут…"
            & $ollama pull $model
            if ($LASTEXITCODE -eq 0) {
                $cfg = Join-Path $dst 'settings.json'
                $s = @{ ollama_url = 'http://localhost:11434'; model = $model; tickets_dir = ''; x = -1; y = -1 }
                if (Test-Path $cfg) { try { (Get-Content $cfg -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $s[$_.Name] = $_.Value }; $s.model = $model } catch { } }
                [IO.File]::WriteAllText($cfg, ($s | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
                Say '         модель установлена' 'Green'
            } else { Say '         Не удалось скачать модель. Ассистент будет работать без неё.' 'Yellow' }
        } else { Say '         Ollama не установилась. Ассистент будет работать без неё.' 'Yellow' }
    } catch { Say "         Не получилось установить модель: $($_.Exception.Message). Ассистент будет работать без неё." 'Yellow' } }
    elseif (-not $bundled) { Say '         пропущено' 'DarkGray' }

    # 6. Запуск
    Start-ScheduledTask -TaskName $task
    Say ''
    Say '  Готово! Зелёный значок-смайлик появится в правом нижнем углу экрана.' 'Green'
    Say '  Нажмите на него, чтобы открыть чат. Его можно перетащить мышью в любое место.' 'Green'
    Say '  Ассистент будет запускаться сам при каждом входе в Windows.' 'Green'
} catch {
    Say ''
    Say "  Ошибка установки: $($_.Exception.Message)" 'Red'
    Say '  Сфотографируйте это сообщение и пришлите его.' 'Red'
}
Say ''
Read-Host '  Нажмите Enter, чтобы закрыть окно'
