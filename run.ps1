param([int]$Port = 4173)
$ErrorActionPreference='Stop'
$nodeCommand=Get-Command node -ErrorAction SilentlyContinue
if($nodeCommand){ $nodeExecutable=$nodeCommand.Source }
else {
  $nodeExecutable=Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
  if(-not (Test-Path -LiteralPath $nodeExecutable)){ throw '需要 Node.js 20 或以上版本。安装后运行 npm start。' }
}
& $nodeExecutable (Join-Path $PSScriptRoot 'scripts/serve.mjs') --port $Port
