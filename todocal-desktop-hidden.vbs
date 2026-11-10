Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = dir
electron = dir & "\node_modules\electron\dist\electron.exe"
If fso.FileExists(electron) And fso.FolderExists(dir & "\dist") Then
  sh.Environment("PROCESS")("NODE_TLS_REJECT_UNAUTHORIZED") = "0"
  sh.Run """" & electron & """ """ & dir & "\electron\main.js""", 1, False
Else
  sh.Run "cmd /c """ & dir & "\todocal-desktop.bat""", 0, False
End If
