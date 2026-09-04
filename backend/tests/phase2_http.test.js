const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const AdmZip = require('adm-zip');

const express = require('express');
const projectRoutes = require('../src/routes/projectRoutes');

const TEST_SCRATCH = path.resolve(__dirname, '../data/test_http_scratch');
let server;
let serverPort;

function makeMultipartRequest(port, zipBuffer, filename = 'test.zip') {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const crlf = '\r\n';

    const header = `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="code"; filename="${filename}"${crlf}` +
      `Content-Type: application/zip${crlf}${crlf}`;
    const footer = `${crlf}--${boundary}--${crlf}`;

    const bodyBuffer = Buffer.concat([
      Buffer.from(header, 'utf8'),
      zipBuffer,
      Buffer.from(footer, 'utf8')
    ]);

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/projects/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

describe('APIFIX V2 — Phase 2: HTTP Integration Tests', () => {
  before(async () => {
    if (!fs.existsSync(TEST_SCRATCH)) {
      fs.mkdirSync(TEST_SCRATCH, { recursive: true });
    }

    const app = express();
    app.use(express.json());
    app.use('/api/projects', projectRoutes);

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    try {
      fs.rmSync(TEST_SCRATCH, { recursive: true, force: true });
    } catch (e) {}
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('POST /api/projects/upload extracts, discovers project, creates workspace', async () => {
    const zip = new AdmZip();
    zip.addFile('package.json', Buffer.from(JSON.stringify({
      name: 'http-express-test',
      dependencies: { express: '^4.19.0' }
    })));
    zip.addFile('src/index.js', Buffer.from('console.log("hello");'));

    const res = await makeMultipartRequest(serverPort, zip.toBuffer(), 'http_test.zip');
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.projectName, 'http-express-test');
    assert.strictEqual(res.data.technology, 'node');
    assert.strictEqual(res.data.framework, 'express');
    assert.strictEqual(res.data.status, 'ready');
    assert.strictEqual(res.data.supported, true);
    assert.ok(res.data.projectId);
  });

  test('POST /api/projects/upload with multiple projects returns waiting_selection', async () => {
    const zip = new AdmZip();
    zip.addFile('services/api/package.json', Buffer.from(JSON.stringify({
      name: 'micro-api',
      dependencies: { express: '^4.19.0' }
    })));
    zip.addFile('services/web/package.json', Buffer.from(JSON.stringify({
      name: 'micro-web',
      dependencies: { next: '^14.0.0' }
    })));

    const res = await makeMultipartRequest(serverPort, zip.toBuffer(), 'multi_test.zip');
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.multipleDetected, true);
    assert.strictEqual(res.data.candidateCount, 2);
    assert.strictEqual(res.data.status, 'waiting_selection');
  });

  test('POST /api/projects/upload rejects malicious traversal entry', async () => {
    const zip = new AdmZip();
    zip.addFile('test.txt', Buffer.from('hello'));
    zip.getEntries()[0].entryName = '../../escape.txt';

    const res = await makeMultipartRequest(serverPort, zip.toBuffer(), 'malicious.zip');
    assert.strictEqual(res.status, 400);
    assert.match(res.data.error, /Archive rejected for security reasons/i);
  });
});
