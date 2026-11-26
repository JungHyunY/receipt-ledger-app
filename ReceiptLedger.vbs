Option Explicit
Dim WshShell, fso, strPath

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath

' Run start.bat completely hidden (0 = no console window at all)
WshShell.Run "cmd.exe /c start.bat", 0, False
