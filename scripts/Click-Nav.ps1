param(
  [int]$ShotX = 75,
  [int]$ShotY = 270,
  [int]$ShotW = 1456,
  [int]$ShotH = 797
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class TC {
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
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
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

# Click a nav item given its position in the 1456x797 screenshot space.
$proc = Get-Process electron -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -like '*trolly*' -and $_.MainWindowTitle -like '*Trolly Agent*' } |
        Select-Object -First 1
if (-not $proc) { Write-Output 'Trolly Agent not running'; exit 1 }
[TC]::ForceForeground($proc.MainWindowHandle)
Start-Sleep -Seconds 2

$r = New-Object TC+RECT
[TC]::GetWindowRect($proc.MainWindowHandle, [ref]$r) | Out-Null
$w = $r.Right - $r.Left
$h = $r.Bottom - $r.Top
Write-Output ("window: {0},{1} {2}x{3}  (capture was {4}x{5})" -f $r.Left, $r.Top, $w, $h, $ShotW, $ShotH)

# The capture is a downscale of the full desktop, so scale by the SCREEN, not the window.
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$nx = [int]($screen.X + ($ShotX * $screen.Width / $ShotW))
$ny = [int]($screen.Y + ($ShotY * $screen.Height / $ShotH))
Write-Output ("click native {0},{1}" -f $nx, $ny)

[TC]::Click($nx, $ny)
Start-Sleep -Seconds 4
Write-Output 'clicked'
