/**
 * Preload script that patches https.request to route WebSocket upgrade
 * requests through a SOCKS5 proxy.
 * Loaded via NODE_OPTIONS="--require ./src/proxy-preload.cjs"
 *
 * The ws library sets opts.createConnection explicitly, bypassing any
 * agent. This patch intercepts https.request and replaces createConnection
 * with one that tunnels through the SOCKS5 proxy.
 */
'use strict';

const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
if (!proxyUrl) return;

const url = new URL(proxyUrl);
const proxyHost = url.hostname;
const proxyPort = parseInt(url.port, 10);
const tls = require('tls');
const { SocksClient } = require('socks');

const https = require('https');
const origRequest = https.request;

https.request = function patchedRequest(options, ...args) {
  // Only intercept WebSocket upgrade requests (from ws library)
  if (options && options.headers && options.headers.Upgrade === 'websocket') {
    const targetHost = options.host || options.hostname;
    const targetPort = options.port || 443;

    // Replace createConnection with SOCKS5 tunnel + TLS
    options.createConnection = (opts, cb) => {
      SocksClient.createConnection({
        proxy: { host: proxyHost, port: proxyPort, type: 5 },
        command: 'connect',
        destination: { host: targetHost, port: parseInt(targetPort, 10) },
      }).then(({ socket }) => {
        // Wrap the SOCKS socket in TLS
        const tlsSocket = tls.connect({
          socket,
          servername: targetHost,
          host: targetHost,
        });
        cb(null, tlsSocket);
      }).catch(cb);
    };
  }
  return origRequest.call(this, options, ...args);
};
