/**
 * PWA 安装入口与 Service Worker 注册。
 * 页面本身不依赖网络，Service Worker 负责把整套静态资源缓存到本地。
 */

const SW_VERSION = "20261106-3";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ 默认使用桌面 UA（Macintosh），需要结合触控点判断。
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
  );
}

export function initPWA() {
  const installButton = document.querySelector("#install");
  const installHelp = document.querySelector("#installHelp");
  const installHelpText = document.querySelector("#installHelpText");
  const installHelpClose = document.querySelector("#installHelpClose");
  const updateBanner = document.querySelector("#updateBanner");
  const updateReload = document.querySelector("#updateReload");
  const updateDismiss = document.querySelector("#updateDismiss");

  const openInstallHelp = () => {
    const ua = window.navigator.userAgent;
    let text;

    if (isIOS()) {
      text =
        "在 Safari 或 Chrome 中点击分享按钮，然后选择「添加到主屏幕」。如果已经安装过，请直接从桌面图标打开。";
    } else if (/Edg|Chrome|Chromium/i.test(ua)) {
      text =
        "点击地址栏右侧的安装图标，或打开浏览器菜单，选择「安装五子棋 / 安装页面为应用」。如果已经安装过，请直接从桌面图标打开。";
    } else {
      text =
        "打开浏览器菜单，查找「安装应用」或「添加到主屏幕」。如果已经安装过，请直接从桌面图标打开。";
    }

    if (installHelp && typeof installHelp.showModal === "function") {
      installHelpText.textContent = text;
      installHelp.showModal();
    } else {
      window.alert(text);
    }
  };

  if (installHelpClose && installHelp) {
    installHelpClose.addEventListener("click", () => installHelp.close());
  }
  if (installHelp) {
    installHelp.addEventListener("click", (event) => {
      if (event.target === installHelp) installHelp.close();
    });
  }

  const showUpdate = () => {
    if (updateBanner) updateBanner.hidden = false;
  };

  if (updateReload) {
    updateReload.addEventListener("click", () => window.location.reload());
  }
  if (updateDismiss) {
    updateDismiss.addEventListener("click", () => {
      if (updateBanner) updateBanner.hidden = true;
    });
  }

  if (installButton) {
    let deferredPrompt = null;

    const syncInstallVisibility = () => {
      installButton.hidden = isStandalone();
    };

    syncInstallVisibility();

    const displayMode = window.matchMedia("(display-mode: standalone)");
    if (typeof displayMode.addEventListener === "function") {
      displayMode.addEventListener("change", syncInstallVisibility);
    } else if (typeof displayMode.addListener === "function") {
      displayMode.addListener(syncInstallVisibility);
    }

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPrompt = event;
      syncInstallVisibility();
    });

    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      installButton.hidden = true;
    });

    installButton.addEventListener("click", async () => {
      if (deferredPrompt) {
        const prompt = deferredPrompt;
        deferredPrompt = null;
        prompt.prompt();
        try {
          const choice = await prompt.userChoice;
          if (choice.outcome === "accepted") installButton.hidden = true;
        } catch {
          // 用户取消或浏览器不支持，保留按钮，方便再试。
        }
        return;
      }

      openInstallHelp();
    });
  }

  if ("serviceWorker" in navigator) {
    let hadController = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) showUpdate();
      else hadController = true;
    });

    const register = () => {
      navigator.serviceWorker
        .register(new URL(`../sw.js?v=${SW_VERSION}`, import.meta.url), {
          scope: new URL("../", import.meta.url).href,
          updateViaCache: "none",
        })
        .then((registration) => registration.update())
        .catch((error) => {
          console.warn("[gomoku] Service Worker 注册失败", error);
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }
}
