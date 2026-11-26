Option Explicit
Dim WshShell, fso, strPath, http, url, isRunning

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath

url = "http://localhost:3980/api/church/codes"
isRunning = False

' 1. Check if server is already running
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.setTimeouts 300, 300, 300, 300
http.open "GET", url, False
http.send
If Err.Number = 0 Then
  If http.status = 200 Then isRunning = True
End If
On Error GoTo 0

' 2. If not running, start node server in background (0 = hidden)
If Not isRunning Then
  WshShell.Run "node server/index.js", 0, False
  WScript.Sleep 1200
End If

' 3. Open default browser window directly (1 = normal visible window)
WshShell.Run "http://localhost:3980", 1, False
