param(
  [int]$WinId = 0,
  [int]$ShotX = 0,
  [int]$ShotY = 0,
  [int]$ShotW = 1456,
  [int]$ShotH = 764,
  [string]$Text = '',
  [switch]$Type
)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CW {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public static void Focus(IntPtr t) {
    uint fg = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint me = GetCurrentThreadId();
    AttachThreadInput(me, fg, true);
    ShowWindow(t, 9); SetForegroundWindow(t);
    AttachThreadInput(me, fg, false);
  }
  public static void Click(int x, int y) {
    SetCursorPos(x, y); System.Threading.Thread.Sleep(450);
    mouse_event(0x0002, 0, 0, 0, IntPtr.Zero); System.Threading.Thread.Sleep(120);
    mouse_event(0x0004, 0, 0, 0, IntPtr.Zero);
  }
}
"@
$h = [IntPtr]$WinId
[CW]::Focus($h)
Start-Sleep -Milliseconds 900
$r = New-Object CW+RECT
[CW]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
$nx = [int]($r.Left + ($ShotX * $w / $ShotW))
$ny = [int]($r.Top + ($ShotY * $ht / $ShotH))
Write-Output ("win {0},{1} {2}x{3} -> native click {4},{5}" -f $r.Left, $r.Top, $w, $ht, $nx, $ny)
[CW]::Click($nx, $ny)
if ($Type -and $Text -ne '') {
  Start-Sleep -Milliseconds 400
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.SendKeys]::SendWait($Text)
}
Start-Sleep -Milliseconds 700
Write-Output 'ok'
