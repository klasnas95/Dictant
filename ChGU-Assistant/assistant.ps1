# ЧГУ.Ассистент — настольный помощник: плавающий значок + чат.
# Работает на встроенном в Windows PowerShell 5.1, ничего устанавливать не нужно.
param([switch]$NoElevate)

$ErrorActionPreference = 'Continue'
$Root = $PSScriptRoot

# ---------- права администратора (нужны для исправлений) ----------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $NoElevate) {
    try {
        Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ErrorAction Stop -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ('"{0}"' -f $PSCommandPath), '-NoElevate')
        exit
    } catch { }  # отказались — работаем без прав, часть исправлений будет недоступна
}

# ---------- один экземпляр ----------
$created = $false
$mutex = [Threading.Mutex]::new($true, 'Local\ChGU-Assistant', [ref]$created)
if (-not $created) { exit }

Add-Type -AssemblyName System.Windows.Forms, System.Drawing, Microsoft.VisualBasic
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class ChguUi {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, string lParam);
}

public static class ChguNative {
    [DllImport("user32.dll")] public static extern int SetDisplayConfig(uint numPaths, IntPtr paths, uint numModes, IntPtr modes, uint flags);
    [DllImport("user32.dll")] public static extern int GetDisplayConfigBufferSizes(uint flags, out uint numPaths, out uint numModes);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
}

[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IChguEndpointVolume {
    int f(); int g(); int h(); int i();
    int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    int j();
    int GetMasterVolumeLevelScalar(out float level);
    int k(); int l(); int m(); int n();
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IChguDevice {
    int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    int OpenPropertyStore(int access, out IntPtr store);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IChguEnumerator {
    int f();
    int GetDefaultAudioEndpoint(int flow, int role, out IChguDevice dev);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class ChguEnumeratorCo { }

public static class ChguAudio {
    static IChguDevice Dev() {
        IChguEnumerator e = (IChguEnumerator)(new ChguEnumeratorCo());
        IChguDevice d;
        Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out d));
        return d;
    }
    static IChguEndpointVolume Vol() {
        Guid iid = typeof(IChguEndpointVolume).GUID;
        object o;
        Marshal.ThrowExceptionForHR(Dev().Activate(ref iid, 23, IntPtr.Zero, out o));
        return (IChguEndpointVolume)o;
    }
    public static string Id { get { string s; Marshal.ThrowExceptionForHR(Dev().GetId(out s)); return s; } }
    public static float Volume {
        get { float v; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
        set { Guid g = Guid.Empty; Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(value, ref g)); }
    }
    public static bool Mute {
        get { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
        set { Guid g = Guid.Empty; Marshal.ThrowExceptionForHR(Vol().SetMute(value, ref g)); }
    }
}
'@

[void][ChguUi]::ShowWindow([ChguUi]::GetConsoleWindow(), 0)   # прячем консоль
[void][ChguUi]::SetProcessDPIAware()
[Windows.Forms.Application]::EnableVisualStyles()
[Windows.Forms.Application]::SetUnhandledExceptionMode([Windows.Forms.UnhandledExceptionMode]::CatchException)

# ---------- настройки ----------
$SettingsPath = Join-Path $Root 'settings.json'
$Settings = @{ backend = 'auto'; ollama_url = 'http://localhost:11434'; model = ''; tickets_dir = ''; x = -1; y = -1 }
try {
    if (Test-Path $SettingsPath) {
        $j = [IO.File]::ReadAllText($SettingsPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
        foreach ($p in $j.PSObject.Properties) { $Settings[$p.Name] = $p.Value }
    }
} catch { }
function Save-Settings {
    try { [IO.File]::WriteAllText($SettingsPath, ($Settings | ConvertTo-Json), (New-Object Text.UTF8Encoding($false))) } catch { }
}
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $LogDir -ErrorAction SilentlyContinue | Out-Null
function Write-UiError($err) {
    try { [IO.File]::AppendAllText((Join-Path $LogDir 'errors.log'), "$(Get-Date -Format s) $err`r`n$($err.ScriptStackTrace)`r`n", [Text.Encoding]::UTF8) } catch { }
}

# ---------- общий объект для фонового потока ----------
$sync = [hashtable]::Synchronized(@{
    Q         = New-Object 'System.Collections.Concurrent.ConcurrentQueue[object]'
    Answer    = $null
    IsAdmin   = $isAdmin
    Model     = ''
    WantModel = [string]$Settings.model
    Url       = [string]$Settings.ollama_url
    Backend   = [string]$Settings.backend   # auto — встроенная модель, если есть; ollama — только Ollama
    Api       = ''
    LlmUrl    = ''
    Root      = $Root
    LogPath   = (Join-Path $LogDir 'actions.jsonl')
    History   = [Collections.ArrayList]::Synchronized((New-Object Collections.ArrayList))
    LastInfo  = ''
    Busy      = $false
    Ready     = $false
})

$rs = [runspacefactory]::CreateRunspace()
$rs.ApartmentState = 'STA'; $rs.ThreadOptions = 'ReuseThread'
$rs.Open()
$rs.SessionStateProxy.SetVariable('sync', $sync)
$boot = [powershell]::Create(); $boot.Runspace = $rs
[void]$boot.AddScript([IO.File]::ReadAllText((Join-Path $Root 'engine.ps1'), [Text.Encoding]::UTF8), $false)
[void]$boot.Invoke(); $boot.Dispose()

# ---------- оформление ----------
$DpiScale = 1.0
try { $g0 = [Drawing.Graphics]::FromHwnd([IntPtr]::Zero); $DpiScale = $g0.DpiX / 96; $g0.Dispose() } catch { }
function px([double]$v) { [int][math]::Round($v * $DpiScale) }
function Col([string]$hex) { [Drawing.ColorTranslator]::FromHtml($hex) }
$cDark = Col '#0E3B36'; $cGreen = Col '#12A37A'; $cMint = Col '#9FD9C4'; $cInk = Col '#17262B'; $cGrey = Col '#6B7A81'
$cTint = Col '#EEF5F2'; $cAmber = Col '#E8A33D'; $cRed = Col '#D9534F'; $cBright = Col '#1BC48F'
$FontUi = New-Object Drawing.Font('Segoe UI', 10)
$FontSmall = New-Object Drawing.Font('Segoe UI', 8.5)
$FontTitle = New-Object Drawing.Font('Segoe UI Semibold', 12.5)
$IconPath = Join-Path $Root 'assistant.ico'
$AppIcon = $null; if (Test-Path $IconPath) { try { $AppIcon = New-Object Drawing.Icon($IconPath) } catch { } }
function Set-DoubleBuffer($ctl) {
    $ctl.GetType().GetProperty('DoubleBuffered', [Reflection.BindingFlags]'NonPublic,Instance').SetValue($ctl, $true, $null)
}

# =====================================================================
#  ПЛАВАЮЩИЙ ЗНАЧОК
# =====================================================================
$BubSize = px 64
$bub = New-Object Windows.Forms.Form
$bub.Text = 'ЧГУ.Ассистент'
$bub.FormBorderStyle = 'None'; $bub.ShowInTaskbar = $false; $bub.TopMost = $true; $bub.StartPosition = 'Manual'
$bub.Size = New-Object Drawing.Size($BubSize, $BubSize); $bub.MinimumSize = $bub.Size; $bub.MaximumSize = $bub.Size; $bub.BackColor = $cDark; $bub.Cursor = 'Hand'
$gp = New-Object Drawing.Drawing2D.GraphicsPath; $gp.AddEllipse(0, 0, $BubSize, $BubSize)
$bub.Region = New-Object Drawing.Region($gp)
Set-DoubleBuffer $bub

$wa = [Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$pos = New-Object Drawing.Point(($wa.Right - $BubSize - (px 28)), ($wa.Bottom - $BubSize - (px 28)))
if ([int]$Settings.x -ge 0) {
    $sp = New-Object Drawing.Point([int]$Settings.x, [int]$Settings.y)
    foreach ($scr in [Windows.Forms.Screen]::AllScreens) { if ($scr.WorkingArea.Contains($sp)) { $pos = $sp } }
}
$bub.Location = $pos

$script:State = 'idle'; $script:StateUntil = 0; $script:Blink = 0; $script:Tick = 0
$tip = New-Object Windows.Forms.ToolTip
$tip.SetToolTip($bub, 'ЧГУ.Ассистент — нажмите, чтобы открыть чат; перетащите, чтобы переместить')

$bub.add_Paint({
    param($sender, $e)
    try {
        $g = $e.Graphics; $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $w = [single]$BubSize
        $col = switch ($script:State) { 'busy' { $cAmber } 'alert' { $cRed } 'ok' { $cBright } default { $cGreen } }
        $m = [single]($w * 0.045)
        $br = New-Object Drawing.SolidBrush($col); $g.FillEllipse($br, $m, $m, [single]($w - 2 * $m), [single]($w - 2 * $m)); $br.Dispose()
        $hb = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(60, 255, 255, 255))
        $g.FillEllipse($hb, [single]($w * 0.22), [single]($w * 0.12), [single]($w * 0.36), [single]($w * 0.2)); $hb.Dispose()
        $white = New-Object Drawing.SolidBrush([Drawing.Color]::White)
        $ink = New-Object Drawing.SolidBrush($cDark)
        $ey = $w * 0.42; $er = $w * 0.09
        foreach ($ex in @(($w * 0.34), ($w * 0.66))) {
            if ($script:Blink -gt 0) {
                $pen = New-Object Drawing.Pen([Drawing.Color]::White, [single]($w * 0.05)); $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
                $g.DrawLine($pen, [single]($ex - $er), [single]$ey, [single]($ex + $er), [single]$ey); $pen.Dispose()
            } else {
                $g.FillEllipse($white, [single]($ex - $er), [single]($ey - $er), [single](2 * $er), [single](2 * $er))
                $pr = $er * 0.55
                $g.FillEllipse($ink, [single]($ex - $pr), [single]($ey - $pr + $er * 0.15), [single](2 * $pr), [single](2 * $pr))
            }
        }
        if ($script:State -eq 'busy') {
            $phase = [int]([math]::Floor($script:Tick / 3)) % 3
            for ($i = 0; $i -lt 3; $i++) {
                $r = $w * $(if ($i -eq $phase) { 0.05 } else { 0.035 })
                $cx = $w * (0.38 + 0.12 * $i); $cy = $w * 0.7
                $g.FillEllipse($white, [single]($cx - $r), [single]($cy - $r), [single](2 * $r), [single](2 * $r))
            }
        } else {
            $pen = New-Object Drawing.Pen([Drawing.Color]::White, [single]($w * 0.055)); $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
            $g.DrawArc($pen, [single]($w * 0.32), [single]($w * 0.46), [single]($w * 0.36), [single]($w * 0.28), [single]25, [single]130); $pen.Dispose()
        }
        $white.Dispose(); $ink.Dispose()
    } catch { Write-UiError $_ }
})

$script:Down = $false; $script:Moved = $false
$bub.add_MouseDown({
    param($src, $e)
    if ($e.Button -eq [Windows.Forms.MouseButtons]::Left) {
        $script:Down = $true; $script:Moved = $false
        $script:P0 = [Windows.Forms.Cursor]::Position; $script:L0 = $bub.Location
    }
})
$bub.add_MouseMove({
    if (-not $script:Down) { return }
    $p = [Windows.Forms.Cursor]::Position
    $dx = $p.X - $script:P0.X; $dy = $p.Y - $script:P0.Y
    if ([math]::Abs($dx) + [math]::Abs($dy) -gt 4) { $script:Moved = $true }
    if ($script:Moved) { $bub.Location = New-Object Drawing.Point(($script:L0.X + $dx), ($script:L0.Y + $dy)) }
})
$bub.add_MouseUp({
    param($src, $e)
    if ($e.Button -ne [Windows.Forms.MouseButtons]::Left) { return }
    $script:Down = $false
    if ($script:Moved) {
        $Settings.x = $bub.Left; $Settings.y = $bub.Top; Save-Settings
        if ($chat.Visible) { Place-Chat }
    } else { Toggle-Chat }
})

# =====================================================================
#  ОКНО ЧАТА
# =====================================================================
$chat = New-Object Windows.Forms.Form
$chat.Text = 'ЧГУ.Ассистент'
$chat.FormBorderStyle = 'FixedSingle'; $chat.MaximizeBox = $false; $chat.StartPosition = 'Manual'
$chat.ClientSize = New-Object Drawing.Size((px 440), (px 640))
$chat.BackColor = $cTint; $chat.Font = $FontUi; $chat.TopMost = $true; $chat.KeyPreview = $true
if ($AppIcon) { $chat.Icon = $AppIcon }
$script:Exiting = $false
$chat.add_FormClosing({ param($src, $e) if (-not $script:Exiting) { $e.Cancel = $true; $chat.Hide() } })
$chat.add_KeyDown({ param($src, $e) if ($e.KeyCode -eq 'Escape') { $chat.Hide() } })

# шапка
$hdr = New-Object Windows.Forms.Panel
$hdr.Dock = 'Top'; $hdr.Height = px 60; $hdr.BackColor = $cDark
$lt = New-Object Windows.Forms.Label
$lt.Text = 'ЧГУ.Ассистент'; $lt.Font = $FontTitle; $lt.ForeColor = 'White'; $lt.AutoSize = $true
$lt.Location = New-Object Drawing.Point((px 14), (px 8))
$ls = New-Object Windows.Forms.Label
$ls.Text = 'Запускаюсь…'; $ls.Font = $FontSmall; $ls.ForeColor = $cMint; $ls.AutoSize = $true
$ls.Location = New-Object Drawing.Point((px 16), (px 36))
$hdr.Controls.AddRange(@($lt, $ls))

# лента сообщений
$msgs = New-Object Windows.Forms.FlowLayoutPanel
$msgs.Dock = 'Fill'; $msgs.FlowDirection = 'TopDown'; $msgs.WrapContents = $false; $msgs.AutoScroll = $true
$msgs.BackColor = $cTint; $msgs.Padding = New-Object Windows.Forms.Padding((px 8), (px 8), (px 4), (px 8))
Set-DoubleBuffer $msgs
$MsgMax = $chat.ClientSize.Width - (px 56) - [Windows.Forms.SystemInformation]::VerticalScrollBarWidth

# быстрые кнопки
$quick = New-Object Windows.Forms.FlowLayoutPanel
$quick.Dock = 'Bottom'; $quick.Height = px 118; $quick.BackColor = 'White'
$quick.Padding = New-Object Windows.Forms.Padding((px 6), (px 6), (px 6), (px 2))
$QuickItems = @(
    @('Принтер', 'printer', 'Не печатает принтер'),
    @('Интернет', 'internet', 'Не работает интернет'),
    @('Звук', 'sound', 'Нет звука'),
    @('Проектор', 'display', 'Проектор не показывает'),
    @('Тормозит', 'slow', 'Компьютер тормозит'),
    @('Место на диске', 'disk', 'Мало места на диске'),
    @('О компьютере', 'info', 'Сведения о компьютере'),
    @('Презентация', 'presentation', 'Сделай презентацию'),
    @('Заявка в ИТ', 'ticket', 'Создать заявку в ИТ-службу')
)
foreach ($q in $QuickItems) {
    $b = New-Object Windows.Forms.Button
    $b.Text = $q[0]; $b.Tag = $q
    $b.Size = New-Object Drawing.Size((px 136), (px 32)); $b.Margin = New-Object Windows.Forms.Padding((px 2))
    $b.FlatStyle = 'Flat'; $b.FlatAppearance.BorderColor = $cMint; $b.BackColor = $cTint; $b.ForeColor = $cDark; $b.Cursor = 'Hand'
    $b.add_Click({ $t = $this.Tag; Add-Msg $t[2] 'user'; Do-Command $t[1] })
    $quick.Controls.Add($b)
}

# поле ввода
$inp = New-Object Windows.Forms.Panel
$inp.Dock = 'Bottom'; $inp.Height = px 46; $inp.BackColor = 'White'
$inp.Padding = New-Object Windows.Forms.Padding((px 8), (px 8), (px 8), (px 6))
$tb = New-Object Windows.Forms.TextBox
$tb.Dock = 'Fill'; $tb.BorderStyle = 'FixedSingle'
$send = New-Object Windows.Forms.Button
$send.Text = 'Отправить'; $send.Dock = 'Right'; $send.Width = px 96
$send.FlatStyle = 'Flat'; $send.BackColor = $cGreen; $send.ForeColor = 'White'; $send.FlatAppearance.BorderSize = 0; $send.Cursor = 'Hand'
$gap = New-Object Windows.Forms.Panel; $gap.Dock = 'Right'; $gap.Width = px 6
$inp.Controls.AddRange(@($tb, $gap, $send))
$chat.AcceptButton = $send
$send.add_Click({ Send-Text })

$chat.Controls.AddRange(@($msgs, $quick, $inp, $hdr))
[void][ChguUi]::SendMessage($tb.Handle, 0x1501, [IntPtr]1, 'Опишите проблему своими словами…')

$script:Transcript = New-Object Collections.ArrayList

function Trim-Msgs { while ($msgs.Controls.Count -gt 150) { $c = $msgs.Controls[0]; $msgs.Controls.RemoveAt(0); $c.Dispose() } }

function Add-Msg([string]$text, [string]$kind = 'bot') {
    $lbl = New-Object Windows.Forms.Label
    $lbl.UseMnemonic = $false; $lbl.AutoSize = $true
    $lbl.MaximumSize = New-Object Drawing.Size($MsgMax, 0)
    $lbl.Padding = New-Object Windows.Forms.Padding((px 10), (px 7), (px 10), (px 8))
    $lbl.Margin = New-Object Windows.Forms.Padding((px 2), (px 3), (px 2), (px 3))
    $lbl.ForeColor = $cInk
    $prefix = ''
    switch ($kind) {
        'user' { $lbl.BackColor = $cGreen; $lbl.ForeColor = [Drawing.Color]::White; $lbl.Margin = New-Object Windows.Forms.Padding((px 56), (px 8), (px 2), (px 3)) }
        'step' { $lbl.BackColor = $cTint; $lbl.ForeColor = $cGrey; $lbl.Font = $FontSmall; $lbl.Padding = New-Object Windows.Forms.Padding((px 4), (px 1), (px 4), (px 1)) }
        'ok'   { $lbl.BackColor = Col '#DDF2E8'; $prefix = '✔ ' }
        'warn' { $lbl.BackColor = Col '#FFF0D4'; $prefix = '⚠ ' }
        'err'  { $lbl.BackColor = Col '#FBE1E0'; $prefix = '✖ ' }
        default { $lbl.BackColor = [Drawing.Color]::White }
    }
    $lbl.Text = $prefix + $text
    $msgs.Controls.Add($lbl)
    Trim-Msgs
    $msgs.ScrollControlIntoView($lbl)
    $who = if ($kind -eq 'user') { 'Пользователь' } else { 'Ассистент' }
    [void]$script:Transcript.Add("[$(Get-Date -Format 'HH:mm:ss')] ${who}: $prefix$text")
}

function Add-Buttons([string[]]$items) {
    $fp = New-Object Windows.Forms.FlowLayoutPanel
    $fp.AutoSize = $true; $fp.AutoSizeMode = 'GrowAndShrink'; $fp.WrapContents = $true
    $fp.MaximumSize = New-Object Drawing.Size(($MsgMax + (px 20)), 0)
    $fp.Margin = New-Object Windows.Forms.Padding(0, 0, 0, (px 6))
    foreach ($it in $items) {
        $i = $it.IndexOf('='); if ($i -lt 1) { continue }
        $label = $it.Substring(0, $i); $act = $it.Substring($i + 1)
        $danger = $label.StartsWith('!'); if ($danger) { $label = $label.Substring(1) }
        $c = if ($danger) { $cRed } else { $cGreen }
        $b = New-Object Windows.Forms.Button
        $b.Text = $label; $b.Tag = $act; $b.UseMnemonic = $false
        $b.AutoSize = $true; $b.AutoSizeMode = 'GrowAndShrink'
        $b.FlatStyle = 'Flat'; $b.FlatAppearance.BorderColor = $c; $b.ForeColor = $c; $b.BackColor = [Drawing.Color]::White; $b.Cursor = 'Hand'
        $b.Padding = New-Object Windows.Forms.Padding((px 4), (px 1), (px 4), (px 1)); $b.Margin = New-Object Windows.Forms.Padding((px 2))
        $b.add_Click({ Add-Msg $this.Text 'user'; Do-Command ([string]$this.Tag) })
        $fp.Controls.Add($b)
    }
    $msgs.Controls.Add($fp)
    $msgs.ScrollControlIntoView($fp)
}

function Update-Status {
    $m = if ($sync.Model) { "модель $($sync.Model)" } else { 'без языковой модели' }
    $a = if ($sync.IsAdmin) { 'права администратора' } else { 'без прав администратора' }
    $ls.Text = "● работает без интернета · $m · $a"
}

function Set-State([string]$st) {
    $script:State = $st
    $script:StateUntil = if ($st -in 'ok', 'alert') { $script:Tick + 50 } else { 0 }
    $bub.Invalidate()
}

# ---------- команды ----------
$script:Job = $null; $script:Handle = $null
function Start-Work([string]$id, [string]$arg = '') {
    if ($sync.Busy) { Add-Msg 'Подождите, я ещё выполняю предыдущую задачу…' 'step'; return }
    $sync.Busy = $true
    if ($id -ne 'init') { Set-State 'busy' }
    $script:Job = [powershell]::Create(); $script:Job.Runspace = $rs
    [void]$script:Job.AddScript('param($id, $arg) Run-Action $id $arg', $false).AddArgument($id).AddArgument($arg)
    $script:Handle = $script:Job.BeginInvoke()
}

function Show-Help {
    Add-Msg ("Что я умею (всё работает прямо на этом компьютере, без интернета):`n" +
        "• Принтер — проверяю службу печати и очередь, удаляю зависшие задания, назначаю принтер по умолчанию, печатаю пробную страницу.`n" +
        "• Интернет — проверяю кабель/Wi-Fi, IP-адрес, роутер и DNS; включаю отключённый адаптер, получаю новый адрес, очищаю DNS.`n" +
        "• Звук — запускаю службу звука, включаю звук и громкость, подсказываю, если звук ушёл на проектор.`n" +
        "• Проектор — включаю дублирование экрана и проверяю, что изображение пошло.`n" +
        "• Тормозит / Место на диске — нахожу тяжёлые программы, чищу временные файлы и корзину.`n" +
        "• Заявка в ИТ — сохраняю описание проблемы и всю диагностику в файл для администратора.`n" +
        "• Опасные действия (сброс сети, перезагрузка, закрытие программ) — только после вашего подтверждения.`n" +
        "• С языковой моделью: отвечаю на вопросы и делаю презентации PowerPoint.")
}

function Route-Text([string]$t) {
    $x = $t.ToLower().Replace('ё', 'е')
    if ($x -match 'презентац|слайд') { return "presentation:$t" }
    if ($x -match 'заявк|айтишник|позов|вызов') { return 'ticket' }
    if ($x -match 'что (ты )?умеешь|помощь|^help|справк|функци') { return 'help' }
    if ($x -match 'печат|принтер|print|мфу') { return 'printer' }
    if ($x -match 'проектор|экран|монитор|изображен|дисплей|hdmi|vga|показыва|проецир') { return 'display' }
    if ($x -match 'звук|колонк|динамик|не слышно|аудио|громкост|наушник') { return 'sound' }
    if ($x -match 'интернет|сеть|сети|сайт|wi-?fi|вай-?фай|вайфай|браузер|не грузит|почта не') { return 'internet' }
    if ($x -match 'нет места|мало места|места на диске|диск переполнен|место на диске|корзин') { return 'disk' }
    if ($x -match 'медлен|тормоз|завис|долго|лага|виснет|глючит') { return 'slow' }
    if ($x -match 'сведени|характеристик|ip-?адрес|мой ip|имя компьютера|о компьютере|какой у меня') { return 'info' }
    if ($x -match '^(привет|здравств|салам|ассалам|добрый)') { return 'greet' }
    return $null
}

function Do-Command([string]$cmd) {
    $i = $cmd.IndexOf(':')
    if ($i -ge 0) { $id = $cmd.Substring(0, $i); $arg = $cmd.Substring($i + 1) } else { $id = $cmd; $arg = '' }
    switch ($id) {
        'ticket'   { New-Ticket }
        'help'     { Show-Help }
        'greet'    { Add-Msg 'Здравствуйте! Опишите, что случилось с компьютером, или задайте вопрос.' }
        'copyinfo' { if ($sync.LastInfo) { [Windows.Forms.Clipboard]::SetText($sync.LastInfo); Add-Msg 'Скопировал — можно вставить в письмо или сообщение ИТ-службе.' 'step' } }
        'open'     { try { Start-Process explorer.exe $arg } catch { } }
        default    { Start-Work $id $arg }
    }
}

function Send-Text {
    $t = $tb.Text.Trim()
    if (-not $t) { return }
    $tb.Text = ''
    Add-Msg $t 'user'
    $r = Route-Text $t
    if ($r) { Do-Command $r } else { Start-Work 'chat' $t }
}

function New-Ticket {
    $chat.TopMost = $false
    $note = [Microsoft.VisualBasic.Interaction]::InputBox('Коротко опишите проблему для ИТ-службы (можно оставить пустым — приложу переписку и диагностику):', 'Заявка в ИТ-службу', '', -1, -1)
    $chat.TopMost = $true
    $dir = if ($Settings.tickets_dir) { [string]$Settings.tickets_dir } else { Join-Path $Root 'tickets' }
    try {
        New-Item -ItemType Directory -Force -Path $dir -ErrorAction Stop | Out-Null
        $id = Get-Date -Format 'yyyyMMdd-HHmmss'
        $file = Join-Path $dir "Заявка_$($env:COMPUTERNAME)_$id.txt"
        $ip = (@([Net.Dns]::GetHostAddresses($env:COMPUTERNAME) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.ToString() }) -join ', ')
        $text = @(
            'ЗАЯВКА В ИТ-СЛУЖБУ (создана ЧГУ.Ассистентом)'
            "Номер: $id"
            "Дата: $(Get-Date -Format 'dd.MM.yyyy HH:mm')"
            "Компьютер: $env:COMPUTERNAME   IP: $ip"
            "Пользователь: $env:USERDOMAIN\$env:USERNAME"
            "Описание: $(if ($note) { $note } else { '(не указано)' })"
            ''
            'Переписка и результаты диагностики:'
        ) + $script:Transcript
        [IO.File]::WriteAllLines($file, [string[]]$text, (New-Object Text.UTF8Encoding($true)))
        Add-Msg "Заявка № $id сохранена: $file`nПередайте файл администратору (или он заберёт его из общей папки, если она настроена)." 'ok'
        Start-Process explorer.exe "/select,`"$file`""
    } catch { Add-Msg "Не удалось сохранить заявку: $($_.Exception.Message)" 'err' }
}

function Place-Chat {
    $scr = [Windows.Forms.Screen]::FromControl($bub).WorkingArea
    $w = $chat.Width; $h = $chat.Height; $g = px 10
    $x = $bub.Left - $w - $g
    if ($x -lt $scr.Left) { $x = $bub.Right + $g }
    if ($x + $w -gt $scr.Right) { $x = $scr.Right - $w }
    $y = $bub.Bottom - $h
    if ($y -lt $scr.Top) { $y = $scr.Top }
    if ($y + $h -gt $scr.Bottom) { $y = $scr.Bottom - $h }
    $chat.Location = New-Object Drawing.Point([int]$x, [int]$y)
}
function Show-Chat { Place-Chat; $chat.Show(); $chat.Activate(); [void]$tb.Focus() }
function Toggle-Chat { if ($chat.Visible) { $chat.Hide() } else { Show-Chat } }

function Exit-App {
    $script:Exiting = $true
    $Settings.x = $bub.Left; $Settings.y = $bub.Top; Save-Settings
    $timer.Stop()
    $chat.Close(); $bub.Close()
    [Windows.Forms.Application]::Exit()
}

# контекстное меню значка
$menu = New-Object Windows.Forms.ContextMenuStrip
[void]$menu.Items.Add('Открыть чат', $null, { Show-Chat })
[void]$menu.Items.Add('Заявка в ИТ-службу', $null, { Show-Chat; New-Ticket })
[void]$menu.Items.Add('Журнал действий', $null, { Start-Process explorer.exe "`"$LogDir`"" })
[void]$menu.Items.Add('-')
[void]$menu.Items.Add('Выход', $null, { Exit-App })
$bub.ContextMenuStrip = $menu

# ---------- таймер: сообщения из фонового потока + анимация ----------
$HWND_TOPMOST = New-Object IntPtr(-1)
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 100
$timer.add_Tick({
    try {
        $script:Tick++
        $it = $null
        while ($sync.Q.TryDequeue([ref]$it)) {
            switch ($it.t) {
                'msg'     { Add-Msg $it.text $it.kind }
                'buttons' { Add-Buttons $it.items }
                'status'  { Update-Status }
                'done'    { Set-State $it.state }
                'confirm' {
                    $timer.Stop()
                    if (-not $chat.Visible) { Show-Chat }
                    $r = [Windows.Forms.MessageBox]::Show($chat, [string]$it.text, 'ЧГУ.Ассистент — подтверждение', [Windows.Forms.MessageBoxButtons]::YesNo, [Windows.Forms.MessageBoxIcon]::Warning, [Windows.Forms.MessageBoxDefaultButton]::Button2)
                    $sync.Answer = ($r -eq [Windows.Forms.DialogResult]::Yes)
                    $timer.Start()
                }
                'input' {
                    $timer.Stop()
                    $chat.TopMost = $false
                    $v = [Microsoft.VisualBasic.Interaction]::InputBox([string]$it.text, 'ЧГУ.Ассистент', [string]$it.default, -1, -1)
                    $chat.TopMost = $true
                    $sync.Answer = [string]$v
                    $timer.Start()
                }
            }
        }
        if ($script:Job -and $script:Handle -and $script:Handle.IsCompleted) {
            try {
                [void]$script:Job.EndInvoke($script:Handle)
                foreach ($er in $script:Job.Streams.Error) { Write-UiError $er }
            } catch { Add-Msg ('Ошибка: ' + $_.Exception.Message) 'err'; Write-UiError $_ }
            $script:Job.Dispose(); $script:Job = $null; $script:Handle = $null
            $sync.Busy = $false
        }
        # анимация значка
        $redraw = $false
        if ($script:State -eq 'busy' -and $script:Tick % 3 -eq 0) { $redraw = $true }
        if ($script:Tick % 47 -eq 0) { $script:Blink = 2; $redraw = $true }
        elseif ($script:Blink -gt 0) { $script:Blink--; if ($script:Blink -eq 0) { $redraw = $true } }
        if ($script:StateUntil -gt 0 -and $script:Tick -ge $script:StateUntil) { $script:State = 'idle'; $script:StateUntil = 0; $redraw = $true }
        if ($redraw) { $bub.Invalidate() }
        if ($script:Tick % 30 -eq 0 -and -not $script:Down) { [void][ChguUi]::SetWindowPos($bub.Handle, $HWND_TOPMOST, 0, 0, 0, 0, 0x13) }
    } catch { Write-UiError $_ }
})

[Windows.Forms.Application]::add_ThreadException({ param($src, $ev) Write-UiError $ev.Exception })

$bub.add_Shown({
    $bub.Size = New-Object Drawing.Size($BubSize, $BubSize)
    Add-Msg ("Здравствуйте! Я ЧГУ.Ассистент — помогаю с компьютером и учебными материалами. Работаю прямо на этом компьютере, без интернета.`n`n" +
        "Опишите проблему своими словами (например, «не печатает принтер», «нет звука», «проектор не показывает») или нажмите кнопку внизу. " +
        "Я проверю, исправлю то, что можно, и честно скажу, что сделал.")
    if (-not $isAdmin) {
        Add-Msg 'Я запущен без прав администратора — исправления принтера, звука и сети не сработают. Закройте меня (правый клик по значку → «Выход») и запустите через «Запустить.bat», разрешив доступ.' 'warn'
    }
    Update-Status
    $timer.Start()
    Start-Work 'init'
})

try {
    [Windows.Forms.Application]::Run($bub)
} catch { Write-UiError $_ }
try { $mutex.ReleaseMutex() } catch { }
# останавливаем встроенную модель, чтобы она не занимала память после выхода
try { Get-Process llama-server -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Root\llm\*" } | Stop-Process -Force -ErrorAction SilentlyContinue } catch { }
[Environment]::Exit(0)
