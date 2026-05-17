const NATIVE_HOST = "com.clepsydre.bridge";

let nativePort = null;
const pendingRequests = new Map();

function connectNative() {
  if (nativePort) return nativePort;

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST);

    nativePort.onMessage.addListener((message) => {
      const { requestId } = message;
      if (requestId && pendingRequests.has(requestId)) {
        const { resolve } = pendingRequests.get(requestId);
        pendingRequests.delete(requestId);
        resolve(message);
      }
    });

    nativePort.onDisconnect.addListener(() => {
      nativePort = null;
      for (const [, { reject }] of pendingRequests) {
        reject(new Error("Native host disconnected"));
      }
      pendingRequests.clear();
    });

    return nativePort;
  } catch (err) {
    nativePort = null;
    throw err;
  }
}

function sendNativeMessage(message) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    message.requestId = requestId;

    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("Native host timeout"));
    }, 10000);

    pendingRequests.set(requestId, {
      resolve: (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    try {
      const port = connectNative();
      port.postMessage(message);
    } catch (err) {
      pendingRequests.delete(requestId);
      clearTimeout(timeout);
      reject(err);
    }
  });
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === "clepsydre-bridge") {
    sendNativeMessage(request.payload)
      .then((response) => {
        sendResponse({ ok: true, data: response });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }
});
