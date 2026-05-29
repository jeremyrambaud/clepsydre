(function () {
  "use strict";

  const MESSAGES = {
    en: {
      startTimer: "Start Clepsydre timer",
      stopTimer: "Stop Clepsydre timer",
      startWithBillingChoice: "Start timer and choose billing issue",
      appUnavailable: "Clepsydre app unavailable",
      appDisconnected: "Clepsydre app not running or not installed",
      launchDesktopApp: "Launch Clepsydre desktop app to start tracking time",
      timerRunning: "Timer running",
      timerRunningOnIssue: "Timer running on #{{issueId}}",
      timerIdle: "Timer idle",
    },
    fr: {
      startTimer: "Démarrer le timer Clepsydre",
      stopTimer: "Arrêter le timer Clepsydre",
      startWithBillingChoice: "Démarrer et choisir le ticket d'imputation",
      appUnavailable: "Application Clepsydre indisponible",
      appDisconnected: "Application Clepsydre non démarrée ou non installée",
      launchDesktopApp:
        "Lancez l'application desktop Clepsydre pour démarrer le suivi du temps",
      timerRunning: "Timer en cours",
      timerRunningOnIssue: "Timer en cours sur #{{issueId}}",
      timerIdle: "Timer inactif",
    },
  };

  function resolveLocale() {
    const htmlLang =
      document.documentElement?.getAttribute("lang")?.toLowerCase() || "";
    const navLang = (navigator.language || "en").toLowerCase();
    const candidate = htmlLang || navLang;
    return candidate.startsWith("fr") ? "fr" : "en";
  }

  const locale = resolveLocale();

  function t(key, vars) {
    const dictionary = MESSAGES[locale] || MESSAGES.en;
    const fallback = MESSAGES.en[key] || key;
    const template = dictionary[key] || fallback;
    if (!vars) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (_match, token) =>
      String(vars[token] ?? "")
    );
  }

  function extractIssueId() {
    const match = window.location.pathname.match(/\/issues\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  function sendBridgeMessage(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "clepsydre-bridge", payload },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.ok) {
            reject(new Error(response?.error || "Bridge error"));
            return;
          }
          resolve(response.data);
        }
      );
    });
  }

  function normalizeOrigin(url) {
    try {
      const u = new URL(url.replace(/\/+$/, ""));
      return u.origin + u.pathname.replace(/\/+$/, "");
    } catch {
      return null;
    }
  }

  function isMatchingRedmine(configuredUrl) {
    if (!configuredUrl) return false;
    const configuredOrigin = normalizeOrigin(configuredUrl);
    if (!configuredOrigin) return false;
    const pageUrl =
      window.location.origin +
      window.location.pathname.replace(/\/issues\/.*$/, "");
    return pageUrl.startsWith(configuredOrigin);
  }

  function formatElapsed(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n) => n.toString().padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function buildIssueUrl(issueIdValue) {
    const base = normalizeOrigin(currentState?.redmineUrl || "");
    if (!base) return null;
    return `${base}/issues/${issueIdValue}`;
  }

  function createIconSvg(type) {
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("xmlns", svgNs);
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("stroke", "none");

    if (type === "play") {
      const polygon = document.createElementNS(svgNs, "polygon");
      polygon.setAttribute("points", "6,3 20,12 6,21");
      svg.appendChild(polygon);
      return svg;
    }

    if (type === "play-gear") {
      const polygon = document.createElementNS(svgNs, "polygon");
      polygon.setAttribute("points", "4,3 14,12 4,21");
      svg.appendChild(polygon);

      const gearGroup = document.createElementNS(svgNs, "g");
      gearGroup.setAttribute("fill", "none");
      gearGroup.setAttribute("stroke", "currentColor");
      gearGroup.setAttribute("stroke-width", "1.8");
      gearGroup.setAttribute("stroke-linecap", "round");

      const gearCircle = document.createElementNS(svgNs, "circle");
      gearCircle.setAttribute("cx", "17");
      gearCircle.setAttribute("cy", "17");
      gearCircle.setAttribute("r", "2.2");
      gearGroup.appendChild(gearCircle);

      const spokeSegments = [
        ["17", "12.4", "17", "13.4"],
        ["17", "20.6", "17", "21.6"],
        ["12.4", "17", "13.4", "17"],
        ["20.6", "17", "21.6", "17"],
        ["13.8", "13.8", "14.5", "14.5"],
        ["19.5", "19.5", "20.2", "20.2"],
        ["19.5", "14.5", "20.2", "13.8"],
        ["13.8", "20.2", "14.5", "19.5"],
      ];

      for (const [x1, y1, x2, y2] of spokeSegments) {
        const spoke = document.createElementNS(svgNs, "line");
        spoke.setAttribute("x1", x1);
        spoke.setAttribute("y1", y1);
        spoke.setAttribute("x2", x2);
        spoke.setAttribute("y2", y2);
        gearGroup.appendChild(spoke);
      }

      svg.appendChild(gearGroup);
      return svg;
    }

    const rect = document.createElementNS(svgNs, "rect");
    rect.setAttribute("x", "4");
    rect.setAttribute("y", "4");
    rect.setAttribute("width", "16");
    rect.setAttribute("height", "16");
    rect.setAttribute("rx", "2");
    svg.appendChild(rect);
    return svg;
  }

  function setButtonIcon(button, type) {
    button.replaceChildren(createIconSvg(type));
  }

  function setButtonTooltip(button, text) {
    button.title = text;
    button.setAttribute("aria-label", text);
    button.dataset.clepsydreTooltip = text;
  }

  const issueId = extractIssueId();
  if (!issueId) return;

  let widget = null;
  let btn = null;
  let assignBtn = null;
  let infoSpan = null;
  let statusDot = null;
  let currentState = null;
  let widgetInjected = false;
  let localTickerId = null;
  let lastSyncSeconds = 0;
  let lastSyncTime = 0;

  function resolveSubjectHeading() {
    const selectors = [
      "div.subject h3",
      ".issue .subject h3",
      "#content .subject h3",
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function injectWidget() {
    if (widgetInjected) return;
    const subjectHeading = resolveSubjectHeading();
    if (!subjectHeading) return;
    widgetInjected = true;

    widget = document.createElement("span");
    widget.id = "clepsydre-widget";
    widget.className = "clepsydre-widget";

    btn = document.createElement("button");
    btn.className = "clepsydre-btn clepsydre-btn--start";
    setButtonTooltip(btn, t("startTimer"));
    setButtonIcon(btn, "play");

    assignBtn = document.createElement("button");
    assignBtn.className = "clepsydre-btn clepsydre-btn--assign";
    setButtonTooltip(assignBtn, t("startWithBillingChoice"));
    setButtonIcon(assignBtn, "play-gear");

    infoSpan = document.createElement("span");
    infoSpan.className = "clepsydre-info";

    statusDot = document.createElement("span");
    statusDot.className = "clepsydre-status clepsydre-status--idle";

    widget.appendChild(btn);
    widget.appendChild(assignBtn);
    widget.appendChild(infoSpan);
    widget.appendChild(statusDot);
    subjectHeading.appendChild(widget);

    btn.addEventListener("click", handleClick);
    assignBtn.addEventListener("click", handleCustomStartClick);
  }

  function removeWidget() {
    if (!widgetInjected || !widget) return;
    stopLocalTicker();
    widget.remove();
    widgetInjected = false;
    widget = null;
    btn = null;
    assignBtn = null;
    infoSpan = null;
    statusDot = null;
  }

  function setUnavailableState() {
    injectWidget();
    stopLocalTicker();
    if (!btn || !statusDot || !infoSpan) return;

    btn.disabled = true;
    btn.className = "clepsydre-btn clepsydre-btn--start";
    setButtonTooltip(btn, t("appUnavailable"));
    setButtonIcon(btn, "play");
    if (assignBtn) {
      assignBtn.disabled = true;
      assignBtn.style.display = "inline-flex";
      setButtonTooltip(assignBtn, t("startWithBillingChoice"));
    }

    statusDot.className = "clepsydre-status clepsydre-status--disconnected";
    statusDot.title = t("appDisconnected");

    infoSpan.className = "clepsydre-info clepsydre-info--error";
    infoSpan.textContent = t("launchDesktopApp");
  }

  function startLocalTicker() {
    stopLocalTicker();
    localTickerId = setInterval(() => {
      if (!infoSpan || !currentState) return;
      const isThisRunning =
        currentState.issueId === issueId && currentState.status === "running";
      if (!isThisRunning) return;
      const now = Math.floor((Date.now() - lastSyncTime) / 1000);
      infoSpan.textContent = formatElapsed(lastSyncSeconds + now);
    }, 1000);
  }

  function stopLocalTicker() {
    if (localTickerId !== null) {
      clearInterval(localTickerId);
      localTickerId = null;
    }
  }

  async function refreshState() {
    try {
      const response = await sendBridgeMessage({ action: "getTimerState" });
      currentState = response.state || response;
      if (currentState?.ok === false) {
        setUnavailableState();
        return;
      }

      if (!isMatchingRedmine(currentState.redmineUrl)) {
        removeWidget();
        return;
      }

      injectWidget();

      lastSyncSeconds = currentState.elapsedSeconds || 0;
      lastSyncTime = Date.now();

      updateUI();
    } catch {
      setUnavailableState();
    }
  }

  function updateUI() {
    if (!currentState || !btn || !statusDot || !infoSpan) return;
    btn.disabled = false;
    if (assignBtn) {
      assignBtn.disabled = false;
      assignBtn.style.display = "inline-flex";
      setButtonTooltip(assignBtn, t("startWithBillingChoice"));
    }

    const isThisIssueActive =
      currentState.issueId === issueId &&
      (currentState.status === "running" || currentState.status === "paused");
    const isOtherActive =
      currentState.issueId !== issueId &&
      currentState.issueId != null &&
      (currentState.status === "running" || currentState.status === "paused");

    if (isThisIssueActive) {
      btn.className = "clepsydre-btn clepsydre-btn--stop";
      setButtonTooltip(btn, t("stopTimer"));
      setButtonIcon(btn, "stop");
      if (assignBtn) {
        assignBtn.style.display = "none";
      }
      statusDot.className = "clepsydre-status clepsydre-status--active";
      statusDot.title = t("timerRunning");

      infoSpan.className = "clepsydre-info clepsydre-info--time";
      infoSpan.textContent = formatElapsed(lastSyncSeconds);
      startLocalTicker();
    } else {
      btn.className = "clepsydre-btn clepsydre-btn--start";
      setButtonTooltip(btn, t("startTimer"));
      setButtonIcon(btn, "play");
      stopLocalTicker();

      if (isOtherActive) {
        statusDot.className = "clepsydre-status clepsydre-status--other";
        statusDot.title = t("timerRunningOnIssue", { issueId: currentState.issueId });
        infoSpan.className = "clepsydre-info clepsydre-info--other";
        infoSpan.textContent = "";

        const issueLink = document.createElement("a");
        issueLink.className = "clepsydre-issue-link";
        issueLink.target = "_blank";
        issueLink.rel = "noopener noreferrer";
        issueLink.href =
          buildIssueUrl(currentState.issueId) ||
          `${window.location.origin}/issues/${currentState.issueId}`;

        const linkLabel = document.createElement("span");
        linkLabel.className = "clepsydre-issue-link__label";
        linkLabel.textContent = `#${currentState.issueId}${
          currentState.issueSubject ? ` ${currentState.issueSubject}` : ""
        }`;

        issueLink.appendChild(linkLabel);
        infoSpan.appendChild(issueLink);
      } else {
        statusDot.className = "clepsydre-status clepsydre-status--idle";
        statusDot.title = t("timerIdle");
        infoSpan.className = "clepsydre-info";
        infoSpan.textContent = "";
      }
    }
  }

  async function handleClick() {
    if (!btn) return;
    btn.disabled = true;
    if (assignBtn) {
      assignBtn.disabled = true;
    }
    try {
      const isThisIssueActive =
        currentState &&
        currentState.issueId === issueId &&
        (currentState.status === "running" || currentState.status === "paused");

      if (isThisIssueActive) {
        await sendBridgeMessage({ action: "stopCurrent" });
      } else {
        await sendBridgeMessage({ action: "startIssue", issueId });
      }

      await new Promise((r) => setTimeout(r, 500));
      await refreshState();
    } catch (err) {
      console.error("[Clepsydre]", err);
      setUnavailableState();
    } finally {
      if (btn && btn.title !== "Clepsydre app unavailable") btn.disabled = false;
      if (assignBtn && btn && btn.title !== "Clepsydre app unavailable") {
        assignBtn.disabled = false;
      }
    }
  }

  async function handleCustomStartClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!btn || !assignBtn) return;

    btn.disabled = true;
    assignBtn.disabled = true;
    try {
      await sendBridgeMessage({
        action: "startIssue",
        issueId,
        openBillingIssueDialog: true,
      });
      await new Promise((r) => setTimeout(r, 500));
      await refreshState();
    } catch (err) {
      console.error("[Clepsydre]", err);
      setUnavailableState();
    } finally {
      if (btn && btn.title !== "Clepsydre app unavailable") {
        btn.disabled = false;
      }
      if (assignBtn && btn && btn.title !== "Clepsydre app unavailable") {
        assignBtn.disabled = false;
      }
    }
  }

  refreshState();
  setInterval(refreshState, 5000);

})();
