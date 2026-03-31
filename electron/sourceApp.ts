import { execSync } from 'child_process';

function getWindowsForegroundTitle(): string | null {
  const script = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class U32 {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
}
"@
$h = [U32]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[void][U32]::GetWindowText($h, $sb, 512)
$sb.ToString()
`.trim();

  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  try {
    const out = execSync(`powershell -NoProfile -STA -EncodedCommand ${encoded}`, {
      encoding: 'utf-8',
      timeout: 2000,
      windowsHide: true,
    });
    const raw = out.trim();
    if (!raw || raw.includes('<Objs') || raw.includes('CLIXML')) {
      return null;
    }
    const firstLine = raw.split(/\r?\n/).find((l) => l.trim().length > 0) ?? raw;
    return firstLine.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Best-effort foreground app/window label without native npm addons (no node-gyp).
 */
export function getSourceLabelSync(): string | null {
  try {
    if (process.platform === 'win32') {
      const title = getWindowsForegroundTitle();
      return title ? `from ${title}` : null;
    }
    if (process.platform === 'darwin') {
      const out = execSync(
        `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
        { encoding: 'utf-8', timeout: 1500 }
      );
      const name = out.trim();
      return name ? `from ${name}` : null;
    }
  } catch {
    return null;
  }
  return null;
}
