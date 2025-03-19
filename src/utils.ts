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

/**
 * Formats a date string to "Month DD, YYYY" format (e.g., "December 06, 2024")
 * @param dateString - Input date string in any format that can be parsed by Date constructor
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      throw new Error("Invalid date string provided");
    }

    // Format the date
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: '2-digit'
    };

    return date.toLocaleDateString('en-US', options);
  } catch (error) {
    console.error(`Error formatting date: ${error}`);
    throw error;
  }
}
