const THEME_KEY = "gomoku.theme";
const THEME_COLORS = { light: "#f4efe6", dark: "#171411" };

function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme, button) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
  if (button) {
    button.textContent = dark ? "日间" : "夜间";
    button.setAttribute("aria-label", dark ? "切换到日间模式" : "切换到夜间模式");
    button.setAttribute("aria-pressed", String(dark));
  }
}

export function initTheme() {
  const button = document.querySelector("#theme");
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let theme = storedTheme() || systemTheme();
  applyTheme(theme, button);

  if (button) {
    button.addEventListener("click", () => {
      theme = theme === "dark" ? "light" : "dark";
      applyTheme(theme, button);
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        // 忽略隐私模式下的存储失败。
      }
    });
  }

  const onSystemChange = () => {
    if (storedTheme()) return;
    theme = systemTheme();
    applyTheme(theme, button);
  };
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", onSystemChange);
  } else if (typeof media.addListener === "function") {
    media.addListener(onSystemChange);
  }
}
