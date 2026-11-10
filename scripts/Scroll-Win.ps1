param([int]$WinId = 0, [int]$Notches = 0, [string]$Key = '')
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SW {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int d, IntPtr e);
  public static void Focus(IntPtr t) {
    uint fg = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint me = GetCurrentThreadId();
    AttachThreadInput(me, fg, true);
    ShowWindow(t, 9); SetForegroundWindow(t);
    AttachThreadInput(me, fg, false);
  }
  public static void Wheel(int n) { mouse_event(0x0800, 0, 0, n, IntPtr.Zero); }
}
"@
[SW]::Focus([IntPtr]$WinId)
Start-Sleep -Milliseconds 800
if ($Key -ne '') {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.SendKeys]::SendWait($Key)
} else {
  [SW]::Wheel($Notches)
}
Start-Sleep -Milliseconds 700
Write-Output 'ok'
