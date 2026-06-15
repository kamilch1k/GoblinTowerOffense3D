$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$candidatePorts = @(5173, 5174, 5175, 5176)

function Test-PortOpen {
  param([int]$Port)

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $connection = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $connection.AsyncWaitHandle.WaitOne(250, $false)) {
      return $false
    }
    $client.EndConnect($connection)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Test-GameServer {
  param([int]$Port)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port" -TimeoutSec 1
    return $response.Content -like "*AFK Dominion RTS*"
  } catch {
    return $false
  }
}

$port = $null
foreach ($candidate in $candidatePorts) {
  if (Test-GameServer -Port $candidate) {
    $port = $candidate
    break
  }
  if (-not (Test-PortOpen -Port $candidate)) {
    $port = $candidate
    break
  }
}

if ($null -eq $port) {
  $port = 5177
}

if (-not (Test-GameServer -Port $port)) {
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  Start-Process -FilePath $npm -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "$port") -WorkingDirectory $projectRoot -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

Start-Process "http://127.0.0.1:$port"
