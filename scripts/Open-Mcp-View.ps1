Add-Type @"
using System;
using System.Runtime.InteropServices;
public class TA {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  public static void ForceForeground(IntPtr target) {
    uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint myThread  = GetCurrentThreadId();
    AttachThreadInput(myThread, fgThread, true);
    ShowWindow(target, 9); BringWindowToTop(target);
    SetForegroundWindow(target); SetActiveWindow(target);
    AttachThreadInput(myThread, fgThread, false);
  }
  public static void Click(int x, int y) {
    SetCursorPos(x, y); System.Threading.Thread.Sleep(400);
    mouse_event(0x0002, 0, 0, 0, IntPtr.Zero); System.Threading.Thread.Sleep(150);
    mouse_event(0x0004, 0, 0, 0, IntPtr.Zero);
  }
}
"@

$proc = Get-Process electron -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -like '*trolly*' -and $_.MainWindowTitle -like '*Trolly Agent*' } |
        Select-Object -First 1
if (-not $proc) { Write-Output 'Trolly Agent not running'; exit 1 }
[TA]::ForceForeground($proc.MainWindowHandle)
Start-Sleep -Seconds 2
Write-Output ("foregrounded: " + ([TA]::GetForegroundWindow() -eq $proc.MainWindowHandle))

# The 'Tools (MCP)' nav item sits in the left rail, second from top.
# Rail starts at x=11 (window left edge + 0). Nav items start ~72px below the brand.
[TA]::Click(75, 270)
Start-Sleep -Seconds 4
Write-Output 'clicked Tools (MCP)'
