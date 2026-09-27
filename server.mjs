import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];
const INPUT_KEYS = new Set(['sst', 'sss', 'sla', 'cur', 'wind']);
const PRODUCTS = {
  inputs: [
    { key: 'sst', label: 'Sea surface temperature', product: 'OSTIA L4', native: '0.05 degrees, daily' },
    { key: 'sss', label: 'Sea surface salinity', product: 'SMAP / SMOS', native: '0.125 degrees, daily' },
    { key: 'sla', label: 'Sea level anomaly', product: 'DUACS', native: '0.25 degrees, daily' },
    { key: 'cur', label: 'Surface currents U, V', product: 'OSCAR L4 OC Final v2.0', native: '0.25 degrees, daily' },
    { key: 'wind', label: 'Surface winds U, V', product: 'ASCAT L2 Coastal / CCMP Winds 10M L4 v3.1', native: '0.25 degrees, daily products' }
  ],
  target: { label: 'Subsurface temperature', product: 'GLORYS Global Ocean Analysis' },
  validation: { label: 'Independent observations', product: 'INCOIS Live Access Server, Gridded ARGO' }
};

function json(response, statusCode, value) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 64 * 1024) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function safeComment(value) {
  return String(value).replace(/[\r\n,]/g, ' ').trim();
}

function profileCsv(payload) {
  const metadata = payload?.metadata;
  const profile = payload?.profile;
  if (!metadata || !Array.isArray(profile) || profile.length !== DEPTHS.length) {
    throw Object.assign(new Error('Provide metadata and exactly 15 standard-depth values.'), { statusCode: 400 });
  }

  const { lon, lat, dayOfYear, modelScenario, inputs } = metadata;
  if (!Number.isFinite(lon) || lon < 45 || lon > 105 ||
      !Number.isFinite(lat) || lat < 5 || lat > 30 ||
      !Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 365 ||
      typeof modelScenario !== 'string' || modelScenario.length > 80 ||
      !Array.isArray(inputs) || inputs.some(key => !INPUT_KEYS.has(key))) {
    throw Object.assign(new Error('Profile metadata is invalid or outside the North Indian Ocean domain.'), { statusCode: 400 });
  }

  const rows = profile.map((entry, index) => {
    const values = [entry?.t_reconstructed_c, entry?.t_reference_synthetic_c, entry?.error_c];
    if (entry?.depth_m !== DEPTHS[index] || values.some(value => !Number.isFinite(value))) {
      throw Object.assign(new Error('Profile values must be finite and use the 15 standard depths in order.'), { statusCode: 400 });
    }
    return [entry.depth_m, ...values.map(value => value.toFixed(3))].join(',');
  });

  return [
    '# OceanEmbed profile export',
    '# data_mode,synthetic demo only',
    `# lon,${lon.toFixed(3)}`,
    `# lat,${lat.toFixed(3)}`,
    `# day_of_year,${dayOfYear}`,
    `# model_scenario,${safeComment(modelScenario)}`,
    `# inputs,${inputs.join(' ')}`,
    '# reference,synthetic placeholder (not GLORYS observations)',
    'depth_m,t_reconstructed_c,t_reference_synthetic_c,error_c',
    ...rows,
    ''
  ].join('\n');
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/api/status') {
    json(response, 200, {
      status: 'ok',
      service: 'oceanembed-api',
      dataMode: 'synthetic',
      modelReady: false,
      message: 'Demo API is running; no satellite archive or trained checkpoint is connected.'
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/metadata') {
    json(response, 200, {
      domain: { latitude: [5, 30], longitude: [45, 105] },
      grid: { spatialResolutionDegrees: 0.25, temporalResolution: 'daily' },
      depthsMeters: DEPTHS,
      products: PRODUCTS,
      dataMode: 'synthetic'
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/profile/export') {
    const csv = profileCsv(await readJson(request));
    const filename = `oceanembed-profile-${Date.now()}.csv`;
    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    });
    response.end(csv);
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    json(response, 404, { error: 'API route not found.' });
    return;
  }

  if (request.method !== 'GET' || !['/', '/oceanembed.html'].includes(url.pathname)) {
    json(response, 404, { error: 'Not found.' });
    return;
  }

  const html = await readFile(join(ROOT, 'oceanembed.html'));
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(html);
}

const server = createServer((request, response) => {
  handle(request, response).catch(error => {
    json(response, error.statusCode || 500, { error: error.message || 'Internal server error.' });
  });
});

server.listen(PORT, () => {
  console.log(`OceanEmbed demo: http://localhost:${PORT}`);
});
