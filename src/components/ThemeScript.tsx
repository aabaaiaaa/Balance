/**
 * Inline blocking script that applies the dark class before first paint.
 *
 * This reads the theme preference from localStorage (synchronous) and applies
 * the `dark` class on <html> immediately. The ThemeProvider then confirms
 * from Dexie once it mounts (async) and reconciles if needed.
 *
 * Must be rendered in <head> so it executes before the body paints.
 */
export function ThemeScript() {
  const script = `
(function() {
  try {
    var theme = localStorage.getItem('balance-theme') || 'system';
    var dark = theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch(e) {}
})();
`;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
