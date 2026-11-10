$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Todocal.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = 'wscript.exe'
$s.Arguments = '"' + (Join-Path $PSScriptRoot 'todocal-desktop-hidden.vbs') + '"'
$s.WorkingDirectory = $PSScriptRoot
$s.Save()
Write-Host "created: $lnk"
