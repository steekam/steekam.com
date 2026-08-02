import type { Alpine } from "alpinejs";
import persist from "@alpinejs/persist";
import { listenForColorSchemeChange } from "./utils";

export default (Alpine: Alpine) => {
  Alpine.plugin(persist);

  Alpine.data("theme", () => ({
    theme: Alpine.$persist("system").as("theme"),
    cleanup: () => {},
    handleChange(theme: "dark" | "light" | "system", systemTheme: "dark" | "light") {
      const root = window.document.documentElement;
      if (theme === "system") {
        theme = systemTheme;
      }

      if (theme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
      root.setAttribute("data-theme", theme);
    },
    init() {
      let systemTheme: "dark" | "light";
      this.cleanup = listenForColorSchemeChange((isDarkMode) => {
        systemTheme = isDarkMode ? "dark" : "light";
        this.handleChange(this.theme, systemTheme);
      });

      this.$watch("theme", (value) => {
        this.handleChange(value, systemTheme);
      });
    },
    destroy() {
      this.cleanup();
    },
  }));
};
