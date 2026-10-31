# ЧГУ.Ассистент — движок действий.
# Выполняется в фоновом потоке; общается с окном через $sync (передаётся из assistant.ps1).
# Каждый сценарий: диагностика -> исправление -> повторная проверка -> честный итог.

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$script:Outcome = 'idle'
$RU = [Globalization.CultureInfo]::GetCultureInfo('ru-RU')

# ---------- связь с окном ----------
function Post([string]$t, [hashtable]$data = @{}) { $data['t'] = $t; $sync.Q.Enqueue($data) }
function Say([string]$text, [string]$kind = 'bot') { Post 'msg' @{ text = $text; kind = $kind } }
function Step([string]$text) { Say $text 'step' }
# Кнопки: 'Подпись=команда'; подпись с '!' в начале — опасное действие (красная кнопка)
function Offer([string[]]$items) { Post 'buttons' @{ items = $items } }
function Set-Outcome([string]$o) { $script:Outcome = $o }

function Ask-Confirm([string]$text) {
    $sync.Answer = $null
    Post 'confirm' @{ text = $text }
    while ($null -eq $sync.Answer) { Start-Sleep -Milliseconds 100 }
    $a = $sync.Answer; $sync.Answer = $null
    return [bool]$a
}
function Ask-Input([string]$text, [string]$default = '') {
    $sync.Answer = $null
    Post 'input' @{ text = $text; default = $default }
    while ($null -eq $sync.Answer) { Start-Sleep -Milliseconds 100 }
    $a = [string]$sync.Answer; $sync.Answer = $null
    return $a.Trim()
}

function Write-Log([string]$action, [string]$result = 'ok') {
    try {
        $line = [ordered]@{ time = (Get-Date).ToString('s'); pc = $env:COMPUTERNAME; user = $env:USERNAME; action = $action; result = $result } | ConvertTo-Json -Compress
        [IO.File]::AppendAllText($sync.LogPath, $line + "`r`n", (New-Object Text.UTF8Encoding($false)))
    } catch { }
}

function Test-Admin {
    if ($sync.IsAdmin) { return $true }
    Say 'Для этого исправления нужны права администратора. Закройте меня (правый клик по значку → «Выход») и запустите через «Запустить.bat», разрешив доступ.' 'warn'
    Set-Outcome 'alert'
    return $false
}

function N1([double]$v) { $v.ToString('0.#', $RU) }
function Open-Uri([string]$u) { try { Start-Process explorer.exe $u } catch { } }

# =====================================================================
#  ПРИНТЕР
# =====================================================================
function Get-PrintState {
    $sp = "$((Get-Service Spooler -ErrorAction SilentlyContinue).Status)"
    $list = @()
    if ($sp -eq 'Running') {
        $wmi = @{}
        foreach ($w in @(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue)) { $wmi[$w.Name] = $w }
        foreach ($p in @(Get-Printer -ErrorAction SilentlyContinue)) {
            $jobs = @(Get-PrintJob -PrinterName $p.Name -ErrorAction SilentlyContinue)
            $w = $wmi[$p.Name]
            $st = "$($p.PrinterStatus)"
            $list += [pscustomobject]@{
                Name    = $p.Name
                Status  = $st
                Offline = ([bool]($w -and $w.WorkOffline)) -or ($st -match 'Offline')
                Jobs    = $jobs.Count
                Default = [bool]($w -and $w.Default)
                Virtual = ($p.Name -match 'PDF|XPS|OneNote|Fax|Факс|Send To|Snagit|AnyDesk')
            }
        }
    }
    [pscustomobject]@{ Spooler = $sp; Printers = $list }
}

function PrinterStatusRu($p) {
    if ($p.Offline) { return 'не в сети' }
    switch -regex ($p.Status) {
        'Normal|Idle|^$' { return 'готов' }
        'Printing'       { return 'печатает' }
        'PaperJam'       { return 'замятие бумаги' }
        'PaperOut|NoPaper' { return 'нет бумаги' }
        'NoToner'        { return 'нет тонера' }
        'TonerLow'       { return 'мало тонера' }
        'DoorOpen'       { return 'открыта крышка' }
        'Paused'         { return 'приостановлен' }
        'Error'          { return 'ошибка' }
        default          { return $p.Status }
    }
}

function Repair-PrintQueue {
    Step 'Останавливаю службу печати, удаляю зависшие задания и запускаю службу заново…'
    Stop-Service Spooler -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Remove-Item "$env:SystemRoot\System32\spool\PRINTERS\*" -Force -ErrorAction SilentlyContinue
    Set-Service Spooler -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service Spooler -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    foreach ($w in @(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.WorkOffline })) {
        Set-CimInstance -InputObject $w -Property @{ WorkOffline = $false } -ErrorAction SilentlyContinue
    }
    Write-Log 'clear_print_queue'
}

function Scn-Printer([switch]$Force) {
    Step 'Проверяю службу печати, принтеры и очередь заданий…'
    $st = Get-PrintState
    $real = @($st.Printers | Where-Object { -not $_.Virtual })

    if ($st.Spooler -ne 'Running') {
        Say 'Служба печати Windows (Spooler) остановлена — без неё компьютер не печатает вообще.' 'warn'
    } else {
        if ($real.Count -eq 0) {
            $virt = (@($st.Printers | ForEach-Object { $_.Name }) -join ', ')
            Say ("На этом компьютере не установлен ни один настоящий принтер" + $(if ($virt) { " (есть только виртуальные: $virt)" } else { '' }) + ".`nПодключите принтер кабелем USB или добавьте сетевой принтер в «Принтеры и сканеры».") 'warn'
            Offer 'Принтеры и сканеры=open:ms-settings:printers', 'Создать заявку=ticket'
            Set-Outcome 'alert'; return
        }
        $lines = foreach ($p in $real) {
            "• $($p.Name)" + $(if ($p.Default) { ' (по умолчанию)' } else { '' }) + " — $(PrinterStatusRu $p), в очереди: $($p.Jobs)"
        }
        Say ("Нашёл принтеры:`n" + ($lines -join "`n"))
    }

    $needQueue = $Force -or ($st.Spooler -ne 'Running') -or (@($real | Where-Object { $_.Jobs -gt 0 -or $_.Offline }).Count -gt 0)
    $defOk = @($real | Where-Object { $_.Default }).Count -gt 0

    if (-not $needQueue -and $defOk) {
        Say 'Со стороны компьютера всё в порядке: служба печати работает, очередь пуста. Проверьте, что принтер включён, в нём есть бумага и нет мигающих ошибок.' 'ok'
        Offer 'Пробная страница=printer_test', 'Очистить очередь всё равно=printer_fix'
        Set-Outcome 'ok'; return
    }
    if (-not (Test-Admin)) { return }

    $done = @()
    if ($needQueue) {
        $jobs = 0; foreach ($p in $real) { $jobs += $p.Jobs }
        Repair-PrintQueue
        $done += $(if ($jobs -gt 0) { "удалил зависшие задания ($jobs)" } else { 'перезапустил службу печати' })
    }

    $st2 = Get-PrintState
    $real2 = @($st2.Printers | Where-Object { -not $_.Virtual })
    if ($real2.Count -gt 0 -and @($real2 | Where-Object { $_.Default }).Count -eq 0) {
        $target = @($real2 | Where-Object { -not $_.Offline })[0]
        if (-not $target) { $target = $real2[0] }
        Step "Принтер по умолчанию был виртуальный — назначаю «$($target.Name)»…"
        Set-ItemProperty 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows' -Name LegacyDefaultPrinterMode -Value 1 -Type DWord -ErrorAction SilentlyContinue
        $w = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $target.Name }
        if ($w) { [void](Invoke-CimMethod -InputObject $w -MethodName SetDefaultPrinter -ErrorAction SilentlyContinue) }
        $done += "сделал «$($target.Name)» принтером по умолчанию"
        Write-Log 'set_default_printer' $target.Name
        $st2 = Get-PrintState
        $real2 = @($st2.Printers | Where-Object { -not $_.Virtual })
    }

    if ($st2.Spooler -ne 'Running') {
        Say 'Служба печати не запускается даже после перезапуска — нужна помощь ИТ-специалиста.' 'err'
        Offer 'Создать заявку=ticket'
        Set-Outcome 'alert'; return
    }
    $left = 0; foreach ($p in $real2) { $left += $p.Jobs }
    $off = @($real2 | Where-Object { $_.Offline })
    $summary = 'Сделано: ' + ($done -join '; ') + '.'
    if ($off.Count -gt 0) {
        Say ($summary + "`nНо принтер «$($off[0].Name)» не отвечает. Проверьте: он включён, кабель USB или сетевой вставлен, на экране принтера нет ошибки. Потом нажмите «Проверить снова».") 'warn'
        Offer 'Проверить снова=printer', 'Пробная страница=printer_test', 'Создать заявку=ticket'
        Set-Outcome 'alert'
    } elseif ($left -gt 0) {
        Say ($summary + "`nВ очереди всё ещё $left задание(й) — возможно, они только что отправлены. Если печать не идёт — создайте заявку.") 'warn'
        Offer 'Проверить снова=printer', 'Создать заявку=ticket'
        Set-Outcome 'alert'
    } else {
        Say ($summary + "`nПроверил ещё раз: служба печати работает, очередь пуста. Отправьте документ на печать снова.") 'ok'
        Offer 'Пробная страница=printer_test'
        Set-Outcome 'ok'
    }
}

function Print-TestPage {
    $w = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Default } | Select-Object -First 1
    if (-not $w) { Say 'Принтер по умолчанию не выбран.' 'warn'; return }
    Start-Process rundll32.exe -ArgumentList ('printui.dll,PrintUIEntry /k /n "' + $w.Name + '"')
    Say "Отправил пробную страницу на «$($w.Name)»." 'ok'
    Write-Log 'test_page' $w.Name
}

# =====================================================================
#  ИНТЕРНЕТ
# =====================================================================
function Test-Tcp([string]$hostName, [int]$port, [int]$ms = 2500) {
    $c = New-Object Net.Sockets.TcpClient
    try { return ($c.ConnectAsync($hostName, $port).Wait($ms) -and $c.Connected) } catch { return $false } finally { $c.Close() }
}
function Test-Web {
    foreach ($u in 'http://www.msftconnecttest.com/connecttest.txt', 'http://ya.ru') {
        try {
            $req = [Net.HttpWebRequest]::Create($u); $req.Timeout = 6000; $req.AllowAutoRedirect = $false; $req.Method = 'HEAD'
            $resp = $req.GetResponse(); $resp.Close(); return $true
        } catch [Net.WebException] {
            if ($_.Exception.Response) { return $true }
        } catch { }
    }
    return $false
}
function Get-NetState {
    $ad = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue)
    $up = @($ad | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { $_.Name })
    $off = @($ad | Where-Object { $_.Status -eq 'Disabled' } | ForEach-Object { $_.Name })
    $ip = ''; $gw = ''
    foreach ($c in @(Get-NetIPConfiguration -ErrorAction SilentlyContinue)) {
        if (-not $c.IPv4Address) { continue }
        if ($c.NetAdapter -and $c.NetAdapter.Status -ne 'Up') { continue }
        $a = @($c.IPv4Address)[0].IPAddress
        if (-not $ip) { $ip = $a }
        if ($c.IPv4DefaultGateway) { $ip = $a; $gw = @($c.IPv4DefaultGateway)[0].NextHop; break }
    }
    $gwOk = $false
    if ($gw) { $gwOk = [bool](Test-Connection -ComputerName $gw -Count 2 -Quiet -ErrorAction SilentlyContinue) }
    $dnsOk = $false
    try { $dnsOk = @([Net.Dns]::GetHostAddresses('ya.ru')).Count -gt 0 } catch { }
    $ipOk = (Test-Tcp '77.88.8.8' 53) -or (Test-Tcp '8.8.8.8' 53) -or (Test-Tcp '1.1.1.1' 443)
    $web = Test-Web
    [pscustomobject]@{ Up = $up; Off = $off; Ip = $ip; Gw = $gw; GwOk = $gwOk; DnsOk = $dnsOk; IpOk = $ipOk; Web = $web }
}
function Show-NetState($s) {
    $yes = { param($b) if ($b) { 'да' } else { 'нет' } }
    $l = @()
    $l += '• Подключение: ' + $(if ($s.Up.Count) { ($s.Up -join ', ') } else { 'нет активных подключений' })
    if ($s.Off.Count) { $l += '• Отключённые адаптеры: ' + ($s.Off -join ', ') }
    $l += '• IP-адрес: ' + $(if ($s.Ip) { $s.Ip } else { 'не получен' })
    if ($s.Gw) { $l += "• Роутер ($($s.Gw)) отвечает: " + (& $yes $s.GwOk) }
    $l += '• Имена сайтов (DNS) определяются: ' + (& $yes $s.DnsOk)
    $l += '• Выход в интернет: ' + (& $yes ($s.Web -or $s.IpOk))
    Say ("Результат проверки сети:`n" + ($l -join "`n"))
}
function Clear-Dns { ipconfig /flushdns | Out-Null; Clear-DnsClientCache -ErrorAction SilentlyContinue; Write-Log 'flush_dns' }

function Scn-Internet {
    Step 'Проверяю сетевые адаптеры, IP-адрес, роутер, DNS и выход в интернет… (до 20 секунд)'
    $s = Get-NetState
    Show-NetState $s

    if ($s.Web -and $s.DnsOk) {
        Clear-Dns
        Say "Интернет на этом компьютере работает. На всякий случай очистил кэш DNS.`nЕсли не открывается конкретный сайт — он может быть недоступен или заблокирован в сети вуза. Попробуйте другой браузер." 'ok'
        Offer 'Проверить снова=internet', '!Сбросить сетевые настройки=net_reset'
        Set-Outcome 'ok'; return
    }
    if (-not (Test-Admin)) { return }

    $did = @()
    if ($s.Up.Count -eq 0) {
        if ($s.Off.Count) {
            Step ('Включаю отключённый сетевой адаптер: ' + ($s.Off -join ', ') + '…')
            Enable-NetAdapter -Name $s.Off -Confirm:$false -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 8
            $did += 'включил сетевой адаптер'
            Write-Log 'enable_adapter' ($s.Off -join ',')
        } else {
            Say "Нет подключения к сети: сетевой кабель не подключён или компьютер не подключён к Wi-Fi.`nВставьте кабель (должен загореться огонёк у разъёма) или выберите сеть Wi-Fi, затем нажмите «Проверить снова»." 'warn'
            Offer 'Выбрать сеть Wi-Fi=open:ms-availablenetworks:', 'Проверить снова=internet', 'Создать заявку=ticket'
            Set-Outcome 'alert'; return
        }
    } elseif (-not $s.Ip -or $s.Ip -like '169.254.*') {
        Step 'Компьютер не получил адрес от сети — запрашиваю новый IP-адрес (DHCP)…'
        ipconfig /release | Out-Null
        ipconfig /renew | Out-Null
        $did += 'запросил новый IP-адрес'
        Write-Log 'dhcp_renew'
    }
    Step 'Очищаю кэш DNS…'
    Clear-Dns
    $did += 'очистил кэш DNS'

    Step 'Жду, пока подключение восстановится, и проверяю ещё раз… (до 30 секунд)'
    for ($i = 0; $i -lt 10; $i++) { if (Test-Web) { break }; Start-Sleep -Seconds 3 }
    $s2 = Get-NetState
    $summary = 'Сделано: ' + ($did -join ', ') + '.'
    if ($s2.Web -and $s2.DnsOk) {
        Say ($summary + "`nИнтернет заработал.") 'ok'
        Set-Outcome 'ok'; return
    }
    Show-NetState $s2
    if ($s2.Up.Count -eq 0) { $why = 'Подключения по-прежнему нет — проверьте кабель или Wi-Fi.' }
    elseif (-not $s2.Ip -or $s2.Ip -like '169.254.*') { $why = 'Сеть не выдаёт компьютеру адрес — неисправность в кабеле, розетке или сетевом оборудовании аудитории.' }
    elseif ($s2.Gw -and -not $s2.GwOk) { $why = "Роутер сети ($($s2.Gw)) не отвечает — проблема в кабеле, розетке или сетевом оборудовании." }
    elseif ($s2.IpOk -and -not $s2.DnsOk) { $why = 'Интернет есть, но не работает DNS (определение имён сайтов). Поможет сброс сетевых настроек.' }
    else { $why = 'Локальная сеть работает, но выхода в интернет нет — вероятно, проблема у провайдера или на сервере вуза.' }
    Say ($summary + "`n" + $why) 'warn'
    Offer 'Проверить снова=internet', '!Сбросить сетевые настройки=net_reset', 'Создать заявку=ticket'
    Set-Outcome 'alert'
}

function Reset-Network {
    if (-not (Test-Admin)) { return }
    if (-not (Ask-Confirm "Сбросить сетевые настройки Windows?`n`nЭто красное действие: после него нужна перезагрузка компьютера.")) { Say 'Отменено.' 'step'; return }
    Step 'Сбрасываю Winsock и настройки TCP/IP…'
    netsh winsock reset | Out-Null
    netsh int ip reset | Out-Null
    Write-Log 'reset_network'
    Say 'Сетевые настройки сброшены. Чтобы они применились, перезагрузите компьютер.' 'ok'
    Offer '!Перезагрузить компьютер=reboot'
    Set-Outcome 'ok'
}

# =====================================================================
#  ЗВУК
# =====================================================================
function Get-AudioDeviceName {
    try {
        $id = [ChguAudio]::Id
        $guid = $id.Substring($id.LastIndexOf('}.') + 2)
        $k = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\$guid\Properties"
        $p = Get-ItemProperty -LiteralPath $k -ErrorAction Stop
        $a = $p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
        $b = $p.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
        if ($a -and $b) { return "$a ($b)" }
        if ($a) { return $a }
        return $b
    } catch { return '' }
}
function Get-SoundState {
    $svc = "$((Get-Service Audiosrv -ErrorAction SilentlyContinue).Status)"
    $mute = $null; $vol = $null
    try { $mute = [ChguAudio]::Mute; $vol = [int][math]::Round([ChguAudio]::Volume * 100) } catch { }
    [pscustomobject]@{ Svc = $svc; Mute = $mute; Vol = $vol; Ep = ($null -ne $vol); Name = (Get-AudioDeviceName) }
}
function Start-AudioService {
    Set-Service AudioEndpointBuilder -StartupType Automatic -ErrorAction SilentlyContinue
    Set-Service Audiosrv -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service AudioEndpointBuilder -ErrorAction SilentlyContinue
    if ("$((Get-Service Audiosrv).Status)" -eq 'Running') { Restart-Service Audiosrv -Force -ErrorAction SilentlyContinue }
    else { Start-Service Audiosrv -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    Write-Log 'restart_audio'
}
function Play-TestSound {
    $f = "$env:WINDIR\Media\tada.wav"
    if (-not (Test-Path $f)) { $f = "$env:WINDIR\Media\Windows Ding.wav" }
    try { (New-Object Media.SoundPlayer $f).PlaySync() } catch { [Media.SystemSounds]::Asterisk.Play() }
}

function Scn-Sound {
    Step 'Проверяю службу звука, устройство вывода и громкость…'
    $s = Get-SoundState
    $l = @('• Служба Windows Audio: ' + $(if ($s.Svc -eq 'Running') { 'работает' } else { 'остановлена' }))
    if ($s.Ep) {
        $l += '• Звук выводится на: ' + $(if ($s.Name) { $s.Name } else { 'устройство по умолчанию' })
        $l += "• Громкость: $($s.Vol) %" + $(if ($s.Mute) { ', звук ВЫКЛЮЧЕН' } else { '' })
    } else { $l += '• Устройство вывода звука: не найдено' }
    Say ("Результат проверки:`n" + ($l -join "`n"))

    $did = @()
    if ($s.Svc -ne 'Running' -or -not $s.Ep) {
        if (-not (Test-Admin)) { return }
        Step 'Запускаю службу звука Windows…'
        Start-AudioService
        $did += 'запустил службу звука'
        $s = Get-SoundState
    }
    if (-not $s.Ep) {
        Say "Windows не видит устройство для вывода звука. Подключите колонки или наушники (зелёный разъём) и проверьте, что они включены. Если звук должен идти через проектор или монитор — выберите его в настройках звука." 'warn'
        Offer 'Настройки звука=open:ms-settings:sound', 'Проверить снова=sound', 'Создать заявку=ticket'
        Set-Outcome 'alert'; return
    }
    if ($s.Mute) { [ChguAudio]::Mute = $false; $did += 'включил звук (он был выключен)'; Write-Log 'unmute' }
    if ($s.Vol -lt 15) { [ChguAudio]::Volume = 0.5; $did += 'поднял громкость до 50 %'; Write-Log 'volume_up' }

    $s2 = Get-SoundState
    $hdmi = $s2.Name -match 'HDMI|Display Audio|NVIDIA High Definition|AMD High Definition|Intel\(R\) Display|Монитор|Monitor|Projector|Проектор|EPSON|BenQ|Acer|LG|Samsung'
    $tail = ''
    if ($hdmi) { $tail = "`nВнимание: звук идёт на монитор или проектор по HDMI. Если у него нет динамиков, выберите колонки в настройках звука." }
    if ($did.Count) {
        Say ('Сделано: ' + ($did -join ', ') + ". Сейчас громкость $($s2.Vol) %. Проигрываю проверочный звук…" + $tail) 'ok'
        Play-TestSound
        Set-Outcome 'ok'
    } else {
        Say ("В Windows со звуком всё в порядке: звук включён, громкость $($s2.Vol) %. Проверьте громкость в самой программе (видео, браузер) и включены ли колонки." + $tail) $(if ($hdmi) { 'warn' } else { 'ok' })
        Set-Outcome $(if ($hdmi) { 'alert' } else { 'ok' })
    }
    Offer 'Проверочный звук=sound_test', 'Перезапустить службу звука=sound_restart', 'Настройки звука=open:ms-settings:sound'
}

# =====================================================================
#  ПРОЕКТОР / ЭКРАНЫ
# =====================================================================
function Get-DispState {
    [uint32]$p = 0; [uint32]$m = 0
    [void][ChguNative]::GetDisplayConfigBufferSizes(2, [ref]$p, [ref]$m)
    $desk = [ChguNative]::GetSystemMetrics(80)
    $names = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue | ForEach-Object {
        $n = -join (@($_.UserFriendlyName) | Where-Object { $_ -gt 0 } | ForEach-Object { [char]$_ })
        if (-not $n) { $n = 'встроенный экран' }
        $n
    })
    $pnp = @(Get-PnpDevice -Class Monitor -Status OK -ErrorAction SilentlyContinue).Count
    [pscustomobject]@{ Paths = [int]$p; Desk = [int]$desk; Names = $names; Connected = [math]::Max($names.Count, $pnp) }
}
function Set-DisplayMode([string]$mode) {
    $flags = @{ internal = 0x81; clone = 0x82; extend = 0x84; external = 0x88 }[$mode]
    $r = [ChguNative]::SetDisplayConfig(0, [IntPtr]::Zero, 0, [IntPtr]::Zero, [uint32]$flags)
    Write-Log "display_$mode" "$r"
    Start-Sleep -Seconds 3
    return $r
}

function Scn-Display {
    Step 'Проверяю подключённые экраны и режим вывода изображения…'
    $s = Get-DispState
    $nm = if ($s.Names.Count) { ' (' + ($s.Names -join ', ') + ')' } else { '' }
    Say "Подключено экранов: $($s.Connected)$nm. Изображение сейчас выводится на $($s.Paths) из них."

    if ($s.Paths -ge 2 -and $s.Desk -eq 1) {
        Say "Режим «Повторяющийся» уже включён — изображение отправляется на проектор.`nЕсли на проекторе пусто: выберите на пульте проектора источник (кнопка Source / Input → HDMI или Computer) и проверьте, что кабель плотно вставлен." 'ok'
        Offer 'Расширить экран=disp:extend', 'Только проектор=disp:external', 'Только экран ПК=disp:internal'
        Set-Outcome 'ok'; return
    }
    Step 'Включаю режим «Повторяющийся» — одинаковое изображение на экране и проекторе…'
    $r = Set-DisplayMode 'clone'
    $s2 = Get-DispState
    if ($s2.Paths -ge 2 -and $s2.Desk -eq 1) {
        Say "Готово: изображение дублируется на проектор. Если на проекторе пусто — выберите на пульте проектора нужный источник (Source / Input)." 'ok'
        Offer 'Расширить экран=disp:extend', 'Только экран ПК=disp:internal'
        Set-Outcome 'ok'
    } elseif ($s2.Paths -ge 2) {
        Say 'Дублирование не включилось (экраны с несовместимыми разрешениями), сейчас режим «Расширить». Выберите режим вручную в меню «Проецировать».' 'warn'
        Offer 'Меню «Проецировать»=disp_menu', 'Попробовать снова=display'
        Set-Outcome 'alert'
    } else {
        Say "Компьютер не видит проектор или второй экран. Проверьте:`n1) проектор включён (горит лампа, а не только индикатор);`n2) кабель HDMI или VGA плотно вставлен с обеих сторон;`n3) на пульте проектора выбран нужный вход (Source / Input).`nПотом нажмите «Проверить снова»." 'warn'
        Offer 'Проверить снова=display', 'Меню «Проецировать»=disp_menu', 'Создать заявку=ticket'
        Set-Outcome 'alert'
    }
}
function Run-DisplayMode([string]$mode) {
    $names = @{ clone = 'Повторяющийся'; extend = 'Расширить'; external = 'Только второй экран'; internal = 'Только экран компьютера' }
    $r = Set-DisplayMode $mode
    if ($r -eq 0) { Say "Режим «$($names[$mode])» включён." 'ok'; Set-Outcome 'ok' }
    else { Say "Не удалось включить режим «$($names[$mode])» — возможно, второй экран не подключён." 'warn'; Set-Outcome 'alert' }
}

# =====================================================================
#  ТОРМОЗИТ / МЕСТО НА ДИСКЕ
# =====================================================================
$Protected = '^(System|Idle|Registry|smss|csrss|wininit|winlogon|services|lsass|svchost|explorer|dwm|fontdrvhost|sihost|ctfmon|conhost|audiodg|spoolsv|MsMpEng|NisSrv|SecurityHealth.*|powershell|pwsh|python.*|ollama.*|llama-server|Memory Compression|SearchHost|SearchIndexer|StartMenuExperienceHost|ShellExperienceHost|RuntimeBroker|TextInputHost|dllhost|taskhostw|WmiPrvSE|vmmem.*|LsaIso|Secure System)$'

function Clear-Temp {
    $d = New-Object IO.DriveInfo('C')
    $before = $d.AvailableFreeSpace
    foreach ($p in @($env:TEMP, "$env:SystemRoot\Temp")) {
        if ($p -and (Test-Path -LiteralPath $p)) {
            Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    $d = New-Object IO.DriveInfo('C')
    $mb = [math]::Max(0, [int](($d.AvailableFreeSpace - $before) / 1MB))
    Write-Log 'clear_temp' "$mb MB"
    return $mb
}
function MBtext([double]$mb) { if ($mb -ge 1024) { (N1 ($mb / 1024)) + ' ГБ' } else { "$([int]$mb) МБ" } }

function Scn-Slow {
    Step 'Смотрю загрузку процессора и памяти, свободное место и самые «тяжёлые» программы…'
    $os = Get-CimInstance Win32_OperatingSystem
    $cpu = [int](@(Get-CimInstance Win32_Processor) | Measure-Object LoadPercentage -Average).Average
    $ramT = $os.TotalVisibleMemorySize / 1MB; $ramF = $os.FreePhysicalMemory / 1MB
    $ramPct = [int](100 - $ramF / $ramT * 100)
    $days = ((Get-Date) - $os.LastBootUpTime).TotalDays
    $c = New-Object IO.DriveInfo('C'); $cFree = $c.AvailableFreeSpace / 1GB; $cTot = $c.TotalSize / 1GB
    $top = @(Get-Process | Group-Object ProcessName | ForEach-Object {
        $desc = ($_.Group | Where-Object { $_.Description } | Select-Object -First 1).Description
        [pscustomobject]@{ Name = $_.Name; Title = $(if ($desc) { $desc } else { $_.Name }); MB = [int](($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB); N = $_.Count }
    } | Sort-Object MB -Descending | Select-Object -First 5)

    $l = @("• Процессор загружен на $cpu %", "• Память занята на $ramPct % ($(N1 ($ramT - $ramF)) из $(N1 $ramT) ГБ)", "• Диск C: свободно $(N1 $cFree) ГБ из $(N1 $cTot) ГБ", "• Без перезагрузки: $(N1 $days) дн.", '• Больше всего памяти занимают:')
    foreach ($t in $top) { $l += "   – $($t.Title): $(MBtext $t.MB)" + $(if ($t.N -gt 1) { " ($($t.N) процессов)" } else { '' }) }
    Say ("Результат проверки:`n" + ($l -join "`n"))

    Step 'Удаляю временные файлы…'
    $freed = Clear-Temp
    $notes = @("Удалил временные файлы: освобождено $(MBtext $freed).")
    $offer = @(); $bad = $false
    if ($ramPct -ge 85) {
        $bad = $true
        $notes += 'Оперативная память почти заполнена — это главная причина торможения. Закройте лишние программы и вкладки браузера.'
        foreach ($t in @($top | Where-Object { $_.Name -notmatch $Protected -and $_.MB -ge 300 } | Select-Object -First 2)) { $offer += "!Закрыть «$($t.Title)»=kill:$($t.Name)" }
    }
    if ($cpu -ge 85) { $bad = $true; $notes += 'Процессор сильно загружен — подождите пару минут (возможно, идёт обновление или проверка антивирусом).' }
    if ($cFree -lt [math]::Max(5, $cTot * 0.1)) { $bad = $true; $notes += 'На диске C мало места — Windows работает медленнее. Нажмите «Место на диске».'; $offer += 'Место на диске=disk' }
    if ($days -ge 3) { $bad = $true; $notes += "Компьютер не перезагружался $(N1 $days) дн. — перезагрузка обычно заметно помогает."; $offer += '!Перезагрузить компьютер=reboot' }
    if (-not $bad) { $notes += 'Серьёзных проблем не вижу. Если тормозит конкретная программа — перезапустите её.' }
    Say ($notes -join "`n") $(if ($bad) { 'warn' } else { 'ok' })
    if ($offer.Count) { Offer $offer }
    Set-Outcome $(if ($bad) { 'alert' } else { 'ok' })
}

function Stop-App([string]$name) {
    if ($name -match $Protected) { Say 'Эту программу закрывать нельзя — она нужна Windows.' 'warn'; return }
    $p = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
    if (-not $p.Count) { Say 'Программа уже закрыта.' 'step'; return }
    $title = ($p | Where-Object { $_.Description } | Select-Object -First 1).Description; if (-not $title) { $title = $name }
    if (-not (Ask-Confirm "Закрыть программу «$title»?`nНесохранённые данные в ней пропадут.")) { Say 'Отменено.' 'step'; return }
    $p | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Log 'kill_process' $name
    Say "Программа «$title» закрыта." 'ok'
    Set-Outcome 'ok'
}

function Get-RecycleInfo {
    $n = 0; $size = 0
    try { $sh = New-Object -ComObject Shell.Application; foreach ($i in @($sh.Namespace(10).Items())) { $n++; $size += [double]$i.Size } } catch { }
    [pscustomobject]@{ Count = $n; MB = $size / 1MB }
}

function Scn-Disk {
    Step 'Проверяю диски, временные файлы и корзину…'
    $l = @(); $low = $false
    foreach ($d in @([IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady })) {
        $free = $d.AvailableFreeSpace / 1GB; $tot = $d.TotalSize / 1GB
        $pct = [int]($free / $tot * 100)
        $isLow = $free -lt [math]::Max(5, $tot * 0.1)
        if ($isLow) { $low = $true }
        $l += "• Диск $($d.Name.TrimEnd('\')): свободно $(N1 $free) ГБ из $(N1 $tot) ГБ ($pct %)" + $(if ($isLow) { ' — мало!' } else { '' })
    }
    $rb = Get-RecycleInfo
    $l += "• В корзине: $($rb.Count) объект(ов), около $(MBtext $rb.MB)"
    Say ("Результат проверки:`n" + ($l -join "`n"))

    Step 'Удаляю временные файлы…'
    $freed = Clear-Temp
    Say "Удалил временные файлы: освобождено $(MBtext $freed)." 'ok'
    $offer = @()
    if ($rb.Count -gt 0) { $offer += "!Очистить корзину ($($rb.Count))=recycle" }
    $offer += 'Очистка диска Windows=cleanmgr', 'Папка «Загрузки»=open:shell:Downloads'
    if ($low) { Say 'Места всё ещё мало. Очистите корзину, удалите ненужные файлы из «Загрузок» или запустите «Очистку диска Windows».' 'warn' }
    Offer $offer
    Set-Outcome $(if ($low) { 'alert' } else { 'ok' })
}

function Clear-Recycle {
    $rb = Get-RecycleInfo
    if ($rb.Count -eq 0) { Say 'Корзина уже пуста.' 'step'; return }
    if (-not (Ask-Confirm "Очистить корзину? Будет удалено безвозвратно: $($rb.Count) объект(ов), около $(MBtext $rb.MB).")) { Say 'Отменено.' 'step'; return }
    Clear-RecycleBin -Force -ErrorAction SilentlyContinue
    Write-Log 'clear_recycle' "$([int]$rb.MB) MB"
    Say 'Корзина очищена.' 'ok'
    Set-Outcome 'ok'
}

# =====================================================================
#  СВЕДЕНИЯ О КОМПЬЮТЕРЕ, ПЕРЕЗАГРУЗКА
# =====================================================================
function Scn-Info {
    Step 'Собираю сведения о компьютере…'
    $os = Get-CimInstance Win32_OperatingSystem
    $cs = Get-CimInstance Win32_ComputerSystem
    $cpu = (@(Get-CimInstance Win32_Processor)[0].Name).Trim()
    $gpu = (@(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }) -join ', ')
    $ip = (@(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | ForEach-Object { $_.IPAddress }) -join ', ')
    $c = New-Object IO.DriveInfo('C')
    $days = ((Get-Date) - $os.LastBootUpTime).TotalDays
    $text = @(
        "Имя компьютера: $env:COMPUTERNAME"
        "Пользователь: $env:USERDOMAIN\$env:USERNAME"
        "Система: $($os.Caption) (сборка $($os.BuildNumber))"
        "Процессор: $cpu"
        "Оперативная память: $(N1 ($cs.TotalPhysicalMemory / 1GB)) ГБ"
        "Видеокарта: $gpu"
        "Диск C: свободно $(N1 ($c.AvailableFreeSpace / 1GB)) из $(N1 ($c.TotalSize / 1GB)) ГБ"
        "IP-адрес: $(if ($ip) { $ip } else { 'нет' })"
        "Работает без перезагрузки: $(N1 $days) дн."
    ) -join "`n"
    $sync.LastInfo = $text
    Say $text
    Offer 'Скопировать=copyinfo', 'Создать заявку=ticket'
    Set-Outcome 'ok'
}

function Do-Reboot {
    if (-not (Ask-Confirm "Перезагрузить компьютер через 60 секунд?`nСохраните открытые документы.")) { Say 'Отменено.' 'step'; return }
    shutdown.exe /r /t 60 /c "Перезагрузка по запросу ЧГУ.Ассистента" | Out-Null
    Write-Log 'reboot'
    Say 'Компьютер перезагрузится через 60 секунд. Сохраните документы.' 'warn'
    Offer 'Отменить перезагрузку=reboot_cancel'
}

# =====================================================================
#  ЯЗЫКОВАЯ МОДЕЛЬ (встроенная Qwen через llama.cpp или Ollama, локально)
# =====================================================================
function Get-Json([string]$url, [int]$timeout = 3) {
    $req = [Net.HttpWebRequest]::Create($url); $req.Proxy = $null; $req.Timeout = $timeout * 1000
    $resp = $req.GetResponse()
    try { (New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)).ReadToEnd() | ConvertFrom-Json } finally { $resp.Close() }
}
function Post-Json([string]$url, $obj, [int]$timeout = 600) {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 8 -Compress))
    $req = [Net.HttpWebRequest]::Create($url)
    $req.Method = 'POST'; $req.ContentType = 'application/json; charset=utf-8'; $req.Proxy = $null
    $req.Timeout = $timeout * 1000; $req.ReadWriteTimeout = $timeout * 1000
    $st = $req.GetRequestStream(); $st.Write($bytes, 0, $bytes.Length); $st.Close()
    try { $resp = $req.GetResponse() }
    catch [Net.WebException] {
        $er = $_.Exception.Response
        if ($er) { $t = (New-Object IO.StreamReader($er.GetResponseStream(), [Text.Encoding]::UTF8)).ReadToEnd(); throw "HTTP $([int]$er.StatusCode): $t" }
        throw
    }
    try { (New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)).ReadToEnd() | ConvertFrom-Json } finally { $resp.Close() }
}
function Find-Ollama {
    $c = Get-Command ollama -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    foreach ($p in "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe", "$env:ProgramFiles\Ollama\ollama.exe") { if (Test-Path $p) { return $p } }
    return $null
}
# ---------- встроенная модель: llm\llama-server.exe + llm\*.gguf (llama.cpp; без интернета и без Ollama) ----------
$LlamaPort = 11435
function Find-BundledLlm {
    $dir = Join-Path $sync.Root 'llm'
    $exe = Join-Path $dir 'llama-server.exe'
    if (-not (Test-Path -LiteralPath $exe)) { return $null }
    $gguf = Get-ChildItem -LiteralPath $dir -Filter '*.gguf' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike 'mmproj*' } | Sort-Object Length -Descending | Select-Object -First 1
    if (-not $gguf) { return $null }
    $name = [IO.Path]::GetFileNameWithoutExtension($gguf.Name) -replace '-(UD-)?(I?Q\d\w*|BF16|F16|F32)$', ''
    return @{ Exe = $exe; Model = $gguf.FullName; Name = $name }
}
function Start-BundledLlm($llm) {
    $url = "http://127.0.0.1:$LlamaPort"
    try { if ((Get-Json "$url/health" 2).status -eq 'ok') { return $url } } catch { }
    # файлы из скачанного архива помечены «из интернета» — снимаем пометку, чтобы Windows не спрашивала
    Get-ChildItem -LiteralPath (Split-Path $llm.Exe) -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
    $threads = [math]::Max(2, [math]::Min(8, [Environment]::ProcessorCount - 1))
    $log = Join-Path $sync.Root 'logs\llm.log'
    $a = @('-m', "`"$($llm.Model)`"", '--host', '127.0.0.1', '--port', "$LlamaPort", '-c', '8192', '-np', '1', '-t', "$threads", '--jinja', '--log-file', "`"$log`"")
    Start-Process -FilePath $llm.Exe -ArgumentList $a -WorkingDirectory (Split-Path $llm.Exe) -WindowStyle Hidden
    for ($i = 0; $i -lt 120; $i++) {
        Start-Sleep -Seconds 1
        try { if ((Get-Json "$url/health" 2).status -eq 'ok') { return $url } } catch { }
    }
    return $null
}

function Init-Model {
    $sync.Api = 'ollama'
    if ([string]$sync.Backend -ne 'ollama') {
        $llm = Find-BundledLlm
        if ($llm) {
            $u = $null
            try { $u = Start-BundledLlm $llm } catch { }
            if ($u) {
                $sync.Api = 'openai'; $sync.LlmUrl = $u; $sync.Model = "$($llm.Name) (встроенная)"
                Post 'status'; return
            }
            Write-Log 'llm_start' 'error: встроенная модель не запустилась, см. logs\llm.log'
        }
    }
    $url = $sync.Url.TrimEnd('/')
    $tags = $null
    try { $tags = Get-Json "$url/api/tags" } catch {
        $exe = Find-Ollama
        if ($exe -and $url -match 'localhost|127\.0\.0\.1') {
            Start-Process -FilePath $exe -ArgumentList 'serve' -WindowStyle Hidden
            for ($i = 0; $i -lt 15 -and -not $tags; $i++) { Start-Sleep -Seconds 1; try { $tags = Get-Json "$url/api/tags" } catch { } }
        }
    }
    $names = @()
    if ($tags) { $names = @($tags.models | ForEach-Object { $_.name } | Where-Object { $_ -notmatch 'embed' }) }
    $m = ''
    if ($sync.WantModel -and ($names -contains $sync.WantModel)) { $m = $sync.WantModel }
    elseif ($names.Count) { $q = @($names | Where-Object { $_ -like 'qwen*' }); $m = $(if ($q.Count) { $q[0] } else { $names[0] }) }
    $sync.Model = $m
    Post 'status'
}
function Invoke-Ollama($messages, [switch]$Json) {
    if ($sync.Api -eq 'openai') {
        # встроенный llama-server (OpenAI-совместимый API); режим рассуждений выключен
        $body = @{ messages = $messages; stream = $false; temperature = 0.4; top_p = 0.8; top_k = 20; max_tokens = 3000
                   presence_penalty = $(if ($Json) { 0 } else { 1.0 }); chat_template_kwargs = @{ enable_thinking = $false } }
        if ($Json) { $body.response_format = @{ type = 'json_object' } }
        $r = Post-Json ($sync.LlmUrl + '/v1/chat/completions') $body
        $t = [string]$r.choices[0].message.content
    } else {
        $body = @{ model = $sync.Model; messages = $messages; stream = $false; think = $false; options = @{ temperature = 0.3 } }
        if ($Json) { $body.format = 'json' }
        $url = $sync.Url.TrimEnd('/') + '/api/chat'
        try { $r = Post-Json $url $body }
        catch { if ("$_" -match 'HTTP 400') { $body.Remove('think'); $r = Post-Json $url $body } else { throw } }
        $t = [string]$r.message.content
    }
    return ($t -replace '(?s)<think>.*?</think>', '').Trim()
}

$SystemPrompt = @(
    'Ты — ЧГУ.Ассистент, офлайн-помощник преподавателей Чеченского государственного университета им. А.А. Кадырова. Работаешь на компьютере преподавателя без интернета.'
    'Отвечай по-русски, кратко и по делу (до 8 предложений). Помогаешь готовить тесты, планы занятий, объяснять темы. Если не уверен в факте — так и скажи. Не выставляй оценки студентам.'
    'ВАЖНО: если пользователь жалуется на неполадку компьютера, ответь ТОЛЬКО одним тегом без пояснений:'
    '[[printer]] — принтер, печать; [[internet]] — интернет, сеть, сайты, Wi-Fi; [[sound]] — звук, колонки; [[display]] — проектор, монитор, экран, изображение;'
    '[[slow]] — компьютер тормозит или зависает; [[disk]] — мало места на диске; [[info]] — сведения о компьютере, IP-адрес; [[presentation]] — просьба сделать презентацию.'
) -join "`n"
$Routes = 'printer', 'internet', 'sound', 'display', 'slow', 'disk', 'info', 'presentation'

function Scn-Chat([string]$text) {
    if (-not $sync.Model) {
        Say "Не понял запрос. Сейчас я умею решать типовые проблемы: принтер, интернет, звук, проектор, медленная работа, место на диске; показать сведения о компьютере и создать заявку в ИТ-службу. Нажмите кнопку внизу или опишите проблему другими словами.`n`nСвободные вопросы и презентации по любой теме заработают, когда будет доступна локальная модель: встроенная (папка llm рядом с программой) или Ollama — см. «ПРОЧТИ МЕНЯ.txt»."
        Offer 'Что ты умеешь?=help'
        return
    }
    Step "Думаю… (локальная модель $($sync.Model); на компьютере без видеокарты ответ может занять до минуты)"
    $msgs = New-Object System.Collections.ArrayList
    [void]$msgs.Add(@{ role = 'system'; content = $SystemPrompt })
    foreach ($h in @($sync.History)) { [void]$msgs.Add($h) }
    [void]$msgs.Add(@{ role = 'user'; content = $text })
    $ans = Invoke-Ollama $msgs.ToArray()
    if ($ans -match '\[\[\s*(\w+)\s*\]\]' -and $Routes -contains $matches[1].ToLower()) {
        $r = $matches[1].ToLower()
        if ($r -eq 'presentation') { Scn-Presentation $text } else { Invoke-Scenario $r }
        return
    }
    if (-not $ans) { $ans = 'Модель вернула пустой ответ. Попробуйте переформулировать вопрос.' }
    Say $ans
    [void]$sync.History.Add(@{ role = 'user'; content = $text })
    [void]$sync.History.Add(@{ role = 'assistant'; content = $ans })
    while ($sync.History.Count -gt 8) { $sync.History.RemoveAt(0) }
    Set-Outcome 'ok'
}

# =====================================================================
#  ПРЕЗЕНТАЦИЯ
# =====================================================================
$OutlinePrompt = @'
Составь учебную презентацию.
Тема: {TOPIC}
Аудитория: студенты
Количество слайдов с содержанием: {N}

Формат ответа — JSON:
{"title": "название презентации", "subtitle": "подзаголовок",
 "slides": [{"title": "заголовок слайда", "bullets": ["пункт 1", "пункт 2", "пункт 3"], "notes": "что сказать преподавателю на этом слайде (2-3 предложения)"}],
 "questions": ["вопрос для самопроверки 1", "вопрос 2", "вопрос 3"]}
На каждом слайде 3–5 коротких пунктов (до 15 слов). Включи определения, формулы (если уместно), примеры и вывод. Отвечай ТОЛЬКО JSON.
'@

function Get-Outline([string]$topic, [int]$n) {
    $msgs = @(
        @{ role = 'system'; content = 'Ты — ЧГУ.Ассистент. Готовишь учебные презентации на русском языке: точные факты, простые формулировки, без выдуманных цитат. Отвечай ТОЛЬКО JSON.' },
        @{ role = 'user'; content = $OutlinePrompt.Replace('{TOPIC}', $topic).Replace('{N}', "$n") }
    )
    $t = Invoke-Ollama $msgs -Json
    $i = $t.IndexOf('{'); $j = $t.LastIndexOf('}')
    if ($i -lt 0 -or $j -le $i) { throw 'модель вернула ответ не в формате JSON — попробуйте ещё раз' }
    $o = $t.Substring($i, $j - $i + 1) | ConvertFrom-Json
    if (-not @($o.slides).Count) { throw 'модель не вернула ни одного слайда — попробуйте ещё раз' }
    return $o
}

function BGR([int]$r, [int]$g, [int]$b) { $r + 256 * $g + 65536 * $b }
function PP-Text($slide, [string]$text, [double]$x, [double]$y, [double]$w, [double]$h, [double]$size, [int]$color, [bool]$bold = $false, [int]$align = 1) {
    $tb = $slide.Shapes.AddTextbox(1, $x, $y, $w, $h)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $text
    $r.Font.Name = 'Calibri'; $r.Font.Size = $size; $r.Font.Bold = $(if ($bold) { -1 } else { 0 }); $r.Font.Color.RGB = $color
    $r.ParagraphFormat.Alignment = $align
    return $tb
}
function PP-Box($slide, [double]$x, [double]$y, [double]$w, [double]$h, [int]$color, [int]$shape = 1) {
    $s = $slide.Shapes.AddShape($shape, $x, $y, $w, $h)
    $s.Fill.ForeColor.RGB = $color; $s.Line.Visible = 0
    return $s
}

function Build-Pptx($o, [string]$path) {
    $DARK = BGR 14 59 54; $GREEN = BGR 18 163 122; $MINT = BGR 159 217 196; $INK = BGR 23 38 43; $GREY = BGR 123 138 145; $TINT = BGR 238 245 242; $WHITE = BGR 255 255 255
    $pp = New-Object -ComObject PowerPoint.Application
    $pres = $pp.Presentations.Add(0)
    $pres.PageSetup.SlideWidth = 960; $pres.PageSetup.SlideHeight = 540
    $n = 1
    $s = $pres.Slides.Add(1, 12)
    [void](PP-Box $s 0 0 960 540 $DARK)
    [void](PP-Text $s 'ЧГУ.АССИСТЕНТ · УЧЕБНЫЕ МАТЕРИАЛЫ' 43 175 870 30 16 $GREEN $true)
    [void](PP-Text $s ([string]$o.title) 43 215 870 110 40 $WHITE $true)
    if ($o.subtitle) { [void](PP-Text $s ([string]$o.subtitle) 43 330 870 60 22 $MINT) }
    [void](PP-Text $s 'ЧГУ им. А.А. Кадырова · подготовлено с помощью ЧГУ.Ассистент' 43 470 870 30 14 $MINT)
    foreach ($it in @($o.slides)) {
        if (-not $it.title) { continue }
        $n++
        $s = $pres.Slides.Add($n, 12)
        [void](PP-Text $s ([string]$it.title) 43 28 870 70 32 $DARK $true)
        [void](PP-Box $s 43 118 874 362 $TINT 5)
        $bul = @($it.bullets | ForEach-Object { "$_".Trim() } | Where-Object { $_ }) | Select-Object -First 6
        if ($bul.Count) {
            $tb = PP-Text $s ($bul -join "`r") 70 136 820 330 22 $INK
            $pf = $tb.TextFrame.TextRange.ParagraphFormat
            $pf.Bullet.Visible = -1; $pf.Bullet.Character = 8226; $pf.SpaceAfter = 10
            try { $pf.Bullet.Font.Color.RGB = $GREEN } catch { }
            try { $tb.TextFrame2.AutoSize = 2 } catch { }
        }
        [void](PP-Text $s 'Подготовлено с помощью ЧГУ.Ассистент' 43 500 500 24 10 $GREY)
        [void](PP-Text $s "$n" 870 500 47 24 10 $GREY $false 3)
        if ($it.notes) { try { $s.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = [string]$it.notes } catch { } }
    }
    $qs = @($o.questions | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
    if ($qs.Count) {
        $n++
        $s = $pres.Slides.Add($n, 12)
        [void](PP-Box $s 0 0 960 540 $DARK)
        [void](PP-Text $s 'Вопросы для самопроверки' 43 40 870 60 34 $WHITE $true)
        $k = 0; $lines = foreach ($q in $qs) { $k++; "$k. $q" }
        $tb = PP-Text $s ($lines -join "`r") 43 130 870 360 22 $WHITE
        $tb.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 12
    }
    $pres.SaveAs($path)
    $pres.Close()
    if ($pp.Presentations.Count -eq 0) { $pp.Quit() }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($pp)
    return $n
}

function Find-Python {
    foreach ($c in @('py', 'python')) {
        try {
            $p = (& $c -c "import sys, pptx; print(sys.executable)" 2>$null | Select-Object -First 1)
            if ($LASTEXITCODE -eq 0 -and $p -and (Test-Path "$p".Trim())) { return "$p".Trim() }
        } catch { }
    }
    return $null
}

function Scn-Presentation([string]$text) {
    $topic = ''
    if ($text -match '(?i)презентаци\w*\s*(?:(?:по\s+теме|на\s+тему|по|про|об?|для)\s+)?(.+)$') { $topic = $matches[1] }
    $topic = ($topic -replace '[«»"]', '').Trim(' ', '.', ',', ':')
    $n = 8
    if ($text -match '(\d{1,2})\s*слайд') { $n = [math]::Max(3, [math]::Min(15, [int]$matches[1])); $topic = ($topic -replace '(?i)(на\s+)?\d{1,2}\s*слайд\w*', '').Trim(' ', '.', ',') }
    if (-not $sync.Model) {
        if (-not (Ask-Confirm "Языковая модель на этом компьютере не установлена или не запустилась — составить презентацию по любой теме я пока не могу.`n`nСделать демонстрационную презентацию «Закон Ома»?")) { Say 'Отменено.' 'step'; return }
        $o = [IO.File]::ReadAllText((Join-Path $sync.Root 'demo_outline.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
    } else {
        if (-not $topic -or $topic.Length -lt 3) { $topic = Ask-Input 'Тема презентации (можно добавить «на 10 слайдов»):' }
        if (-not $topic) { Say 'Отменено.' 'step'; return }
        if ($topic -match '(\d{1,2})\s*слайд') { $n = [math]::Max(3, [math]::Min(15, [int]$matches[1])); $topic = ($topic -replace '(?i)(на\s+)?\d{1,2}\s*слайд\w*', '').Trim(' ', '.', ',') }
        Step "Модель $($sync.Model) пишет текст $n слайдов на тему «$topic». Это займёт от одной до нескольких минут — окно можно свернуть."
        $o = Get-Outline $topic $n
    }
    $desk = [Environment]::GetFolderPath('Desktop')
    if (-not $desk -or -not (Test-Path -LiteralPath $desk)) { $desk = [Environment]::GetFolderPath('MyDocuments') }
    if (-not $desk) { $desk = [IO.Path]::GetTempPath() }
    $base = ([string]$o.title -replace '[\\/:*?"<>|]', '').Trim()
    if (-not $base) { $base = 'Презентация' }
    if ($base.Length -gt 60) { $base = $base.Substring(0, 60) }
    $path = Join-Path $desk "$base.pptx"; $k = 2
    while (Test-Path -LiteralPath $path) { $path = Join-Path $desk "$base ($k).pptx"; $k++ }

    Step 'Собираю файл PowerPoint…'
    $count = 0
    try { $count = Build-Pptx $o $path }
    catch {
        $py = Find-Python
        if (-not $py) {
            $txt = [IO.Path]::ChangeExtension($path, '.txt')
            $lines = @([string]$o.title, '')
            foreach ($it in @($o.slides)) { $lines += [string]$it.title; foreach ($b in @($it.bullets)) { $lines += "  • $b" }; $lines += '' }
            [IO.File]::WriteAllLines($txt, $lines, (New-Object Text.UTF8Encoding($true)))
            Say "Не нашёл Microsoft PowerPoint, поэтому сохранил текст презентации в файл «$([IO.Path]::GetFileName($txt))» на рабочем столе." 'warn'
            try { Start-Process $txt } catch { }; Set-Outcome 'alert'; return
        }
        $tmp = Join-Path ([IO.Path]::GetTempPath()) 'chgu_outline.json'
        [IO.File]::WriteAllText($tmp, ($o | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
        & $py (Join-Path $sync.Root 'make_presentation.py') 'x' --outline $tmp --out $path 2>&1 | Out-Null
        if (-not (Test-Path -LiteralPath $path)) { throw 'не удалось собрать файл презентации' }
    }
    Write-Log 'presentation' ([IO.Path]::GetFileName($path))
    Say ("Готово: презентация «$([string]$o.title)» сохранена на рабочем столе" + $(if ($count) { " ($count слайдов" } else { ' (' }) + 'с заметками для преподавателя). Открываю…') 'ok'
    try { Start-Process -FilePath $path } catch { }
    Set-Outcome 'ok'
}

# =====================================================================
#  ДИСПЕТЧЕР
# =====================================================================
function Invoke-Scenario([string]$id) {
    switch ($id) {
        'printer'  { Scn-Printer }
        'internet' { Scn-Internet }
        'sound'    { Scn-Sound }
        'display'  { Scn-Display }
        'slow'     { Scn-Slow }
        'disk'     { Scn-Disk }
        'info'     { Scn-Info }
        default    { Say "Неизвестный сценарий: $id" 'err' }
    }
}

function Run-Action([string]$id, [string]$arg) {
    $script:Outcome = 'idle'
    try {
        switch ($id) {
            'init'          { Init-Model }
            'printer_fix'   { if (Test-Admin) { Scn-Printer -Force } }
            'printer_test'  { Print-TestPage }
            'net_reset'     { Reset-Network }
            'sound_test'    { Play-TestSound; Say 'Проиграл проверочный звук.' 'step' }
            'sound_restart' { if (Test-Admin) { Step 'Перезапускаю службу звука…'; Start-AudioService; Say 'Служба звука перезапущена.' 'ok'; Set-Outcome 'ok' } }
            'disp'          { Run-DisplayMode $arg }
            'disp_menu'     { Start-Process DisplaySwitch.exe; Say 'Открыл меню «Проецировать» — выберите «Повторяющийся».' 'step' }
            'kill'          { Stop-App $arg }
            'recycle'       { Clear-Recycle }
            'cleanmgr'      { Start-Process cleanmgr.exe; Say 'Открыл «Очистку диска» Windows: отметьте ненужное и нажмите ОК.' 'step' }
            'reboot'        { Do-Reboot }
            'reboot_cancel' { shutdown.exe /a | Out-Null; Say 'Перезагрузка отменена.' 'ok' }
            'presentation'  { Scn-Presentation $arg }
            'chat'          { Scn-Chat $arg }
            default         { Invoke-Scenario $id }
        }
    } catch {
        Say ('Не получилось: ' + $_.Exception.Message) 'err'
        Write-Log $id ('error: ' + $_.Exception.Message)
        $script:Outcome = 'alert'
    }
    Post 'done' @{ state = $script:Outcome }
}
