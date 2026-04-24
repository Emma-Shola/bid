$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$node = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path $node)) {
  throw "Node executable not found at $node"
}

& $node server.mjs
