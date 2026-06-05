$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5173

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

if (-not (Test-PortOpen -Port $port)) {
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  Start-Process -FilePath $npm -ArgumentList @("run", "dev", "--", "--port", "$port") -WorkingDirectory $projectRoot -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

Start-Process "http://127.0.0.1:$port"
