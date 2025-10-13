require('dotenv').config({ path: '.env.local' });
const { proposeMovements, applyMovement, applyAllMovements } = require('./propose-movements');

/**
 * Handler principal para el endpoint de conflictos
 */
async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const action = url.searchParams.get('action');

    // GET /api/admin/conflicts-endpoint?action=analyze
    if (req.method === 'GET' && action === 'analyze') {
      const result = await proposeMovements();
      res.status(200).json(result);
      return;
    }

    // POST /api/admin/conflicts-endpoint?action=apply
    if (req.method === 'POST' && action === 'apply') {
      const body = await getBody(req);
      const { proposals } = body;

      if (!proposals || !Array.isArray(proposals)) {
        res.status(400).json({ error: 'Proposals array is required' });
        return;
      }

      const result = await applyAllMovements(proposals);
      res.status(200).json(result);
      return;
    }

    // POST /api/admin/conflicts-endpoint?action=apply-single
    if (req.method === 'POST' && action === 'apply-single') {
      const body = await getBody(req);
      const { eventId, newRoom } = body;

      if (!eventId || !newRoom) {
        res.status(400).json({ error: 'eventId and newRoom are required' });
        return;
      }

      const result = await applyMovement(eventId, newRoom);
      res.status(200).json(result);
      return;
    }

    res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('Error in conflicts endpoint:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Helper para leer el body de la request
 */
function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

// Export para Vercel
module.exports = async (req, res) => {
  return handler(req, res);
};

// Export alternativo para Node.js directo
module.exports.handler = handler;
