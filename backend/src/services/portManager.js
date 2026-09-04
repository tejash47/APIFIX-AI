const net = require('net');

/**
 * Dynamically finds an available local TCP port on 127.0.0.1.
 * @param {number} preferredPort - Optional preferred port to try first
 * @returns {Promise<number>} An open port number
 */
function allocateAvailablePort(preferredPort = 0) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();

    server.on('error', (err) => {
      if (preferredPort !== 0) {
        // If preferred port is busy, fall back to any open port
        allocateAvailablePort(0).then(resolve).catch(reject);
      } else {
        reject(new Error(`Failed to allocate available port: ${err.message}`));
      }
    });

    server.listen(preferredPort, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((closeErr) => {
        if (closeErr) {
          return reject(closeErr);
        }
        resolve(port);
      });
    });
  });
}

/**
 * Checks if a specific port is actively listening/responding
 * @param {number} port 
 * @param {string} host 
 * @param {number} timeoutMs 
 * @returns {Promise<boolean>}
 */
function isPortOpen(port, host = '127.0.0.1', timeoutMs = 150) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      status = true;
      socket.destroy();
    });

    socket.on('timeout', () => {
      socket.destroy();
    });

    socket.on('error', () => {
      socket.destroy();
    });

    socket.on('close', () => {
      resolve(status);
    });

    socket.connect(port, host);
  });
}

/**
 * Polls a port until it starts listening or timeout expires
 * @param {number} port 
 * @param {number} maxWaitMs 
 * @param {number} intervalMs 
 */
async function waitForPortReady(port, maxWaitMs = 15000, intervalMs = 40) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const open = await isPortOpen(port, '127.0.0.1', 80);
    if (open) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

module.exports = {
  allocateAvailablePort,
  isPortOpen,
  waitForPortReady
};
