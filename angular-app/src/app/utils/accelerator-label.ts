/** Human-readable label for Electron accelerator strings. */
export function formatAcceleratorLabel(accelerator: string): string {
  const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
  return accelerator
    .trim()
    .replace(/CommandOrControl/gi, isMac ? 'Cmd' : 'Ctrl')
    .replace(/Command/gi, 'Cmd')
    .replace(/Control/gi, 'Ctrl')
    .replace(/Alt/gi, 'Alt')
    .replace(/Shift/gi, 'Shift')
    .replace(/\+/g, ' + ');
}
