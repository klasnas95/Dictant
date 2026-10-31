# Smoke test: настоящий engine.ps1 запускает встроенную модель и получает ответы (Windows PowerShell 5.1)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path 'ChGU-Assistant').Path
New-Item -ItemType Directory -Force "$root\logs" | Out-Null
$sync = [hashtable]::Synchronized(@{
    Q = New-Object 'System.Collections.Concurrent.ConcurrentQueue[object]'; Answer = $null; IsAdmin = $true
    Model = ''; WantModel = ''; Url = 'http://localhost:11434'; Backend = 'auto'; Api = ''; LlmUrl = ''
    Root = $root; LogPath = "$root\logs\actions.jsonl"
    History = [Collections.ArrayList]::Synchronized((New-Object Collections.ArrayList)); LastInfo = ''; Busy = $false; Ready = $false })
. ([ScriptBlock]::Create([IO.File]::ReadAllText("$root\engine.ps1", [Text.Encoding]::UTF8)))
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$sw = [Diagnostics.Stopwatch]::StartNew()
Init-Model
"Init-Model: $([int]$sw.Elapsed.TotalSeconds) s; Model='$($sync.Model)' Api='$($sync.Api)' Url='$($sync.LlmUrl)'"
if ($sync.Api -ne 'openai') {
    if (Test-Path "$root\logs\llm.log") { Get-Content "$root\logs\llm.log" -Tail 80 }
    throw 'bundled model did not start'
}
try {
    $sw.Restart()
    $ans = Invoke-Ollama @(@{ role = 'system'; content = $SystemPrompt }, @{ role = 'user'; content = 'Составь план 30-минутного занятия по теме «Закон Ома» для студентов первого курса.' })
    "--- chat ($([int]$sw.Elapsed.TotalSeconds) s) ---"; $ans
    if (-not $ans) { throw 'empty answer' }
    $sw.Restart()
    $route = Invoke-Ollama @(@{ role = 'system'; content = $SystemPrompt }, @{ role = 'user'; content = 'у меня не печатает принтер' })
    "--- routing ($([int]$sw.Elapsed.TotalSeconds) s) ---"; $route
    $sw.Restart()
    $o = Get-Outline 'Фотосинтез' 5
    "--- outline ($([int]$sw.Elapsed.TotalSeconds) s) ---"; $o | ConvertTo-Json -Depth 6
} catch {
    if (Test-Path "$root\logs\llm.log") { Get-Content "$root\logs\llm.log" -Tail 40 }
    throw
} finally {
    Get-Process llama-server -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 1
    Remove-Item "$root\logs" -Recurse -Force -ErrorAction SilentlyContinue
}
