export function listenForColorSchemeChange(callback: (isDarkMode: boolean) => void) {
  if (!window) {
    throw new Error("listenForColorSchemeChange must be called in the browser");
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const handleChange = (event: MediaQueryListEvent) => {
    callback(event.matches);
  };

  mediaQuery.addEventListener("change", handleChange);

  callback(mediaQuery.matches);

  return () => {
    mediaQuery.removeEventListener("change", handleChange);
  };
}
