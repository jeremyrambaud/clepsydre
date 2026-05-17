#!/usr/bin/env node

/**
 * Clepsydre Native Messaging Host
 *
 * Relays JSON messages between a browser extension (stdin/stdout with
 * Chrome native messaging length-prefix framing) and the Clepsydre
 * Tauri app via a local HTTP server exposed by the app.
 *
 * Tauri side: a tiny local HTTP endpoint on port 23847 handles
 * integration requests so the host stays stateless.
 */

const http = require("http");

const TAURI_PORT = 23847;
const TAURI_HOST = "127.0.0.1";

// --- Native messaging I/O helpers ---

function readMessage() {
  return new Promise((resolve, reject) => {
    const headerBuf = Buffer.alloc(4);
    let headerRead = 0;

    function readHeader() {
      const chunk = process.stdin.read(4 - headerRead);
      if (!chunk) {
        process.stdin.once("readable", readHeader);
        return;
      }
      chunk.copy(headerBuf, headerRead);
      headerRead += chunk.length;
      if (headerRead < 4) {
        process.stdin.once("readable", readHeader);
        return;
      }
      const length = headerBuf.readUInt32LE(0);
      if (length === 0 || length > 1024 * 1024) {
        reject(new Error(`Invalid message length: ${length}`));
        return;
      }
      readBody(length);
    }

    function readBody(length) {
      const bodyParts = [];
      let bodyRead = 0;

      function readChunk() {
        const remaining = length - bodyRead;
        const chunk = process.stdin.read(remaining);
        if (!chunk) {
          process.stdin.once("readable", readChunk);
          return;
        }
        bodyParts.push(chunk);
        bodyRead += chunk.length;
        if (bodyRead < length) {
          process.stdin.once("readable", readChunk);
          return;
        }
        try {
          const json = Buffer.concat(bodyParts).toString("utf-8");
          resolve(JSON.parse(json));
        } catch (e) {
          reject(e);
        }
      }
      readChunk();
    }

    readHeader();
  });
}

function writeMessage(obj) {
  const json = JSON.stringify(obj);
  const buf = Buffer.from(json, "utf-8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);
  process.stdout.write(header);
  process.stdout.write(buf);
}

// --- Tauri HTTP bridge ---

function sendToTauri(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: TAURI_HOST,
        port: TAURI_PORT,
        path: "/integration",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
        timeout: 8000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString("utf-8");
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Tauri bridge timeout"));
    });
    req.write(data);
    req.end();
  });
}

// --- Main loop ---

async function main() {
  process.stdin.resume();

  while (true) {
    let message;
    try {
      message = await readMessage();
    } catch {
      break;
    }

    try {
      const response = await sendToTauri(message);
      writeMessage(response);
    } catch (err) {
      writeMessage({
        requestId: message.requestId || null,
        action: message.action || "unknown",
        ok: false,
        error: `Host error: ${err.message}`,
      });
    }
  }
}

main().catch(() => process.exit(1));
