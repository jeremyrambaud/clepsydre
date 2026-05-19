const BRIDGE_URL = "http://127.0.0.1:23847/integration";
const REQUEST_TIMEOUT_MS = 10000;

async function sendBridgeMessage(message) {
  const payload = {
    ...message,
    requestId: crypto.randomUUID(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(BRIDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Bridge request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    if (err && typeof err === "object" && err.name === "AbortError") {
      throw new Error("Bridge timeout");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === "clepsydre-bridge") {
    sendBridgeMessage(request.payload)
      .then((response) => {
        sendResponse({ ok: true, data: response });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }
});
