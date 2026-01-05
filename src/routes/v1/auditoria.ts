import { Router, Request, Response } from 'express';
import { getBcpQrTransaccionCollection } from '../../db/mongo';
import { config } from '../../config';
import { getHttpClient } from '../../httpClient';
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();
function generateCorrelationId(): string {
  const block = (len: number) =>
    crypto
      .randomBytes(len * 2)
      .toString('base64')
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase()
      .slice(0, len);
  // Examples: 0001-001-123456 or 000A-BCD-EFGHIJ
  return `${block(4)}-${block(3)}-${block(6)}`;
}

function getV3HttpClient(): AxiosInstance {
  let servername: string | undefined = undefined;
  try {
    const u = new URL('https://openbanking.bcp.com.bo/Web_ApiQr/api/v3');
    servername = u.hostname;
  } catch (_) {
    // ignore
  }

  const httpsAgent = new https.Agent(
    config.mtlsPfxPath
      ? {
          pfx: fs.readFileSync(config.mtlsPfxPath),
          passphrase: config.mtlsPfxPassword,
          servername,
          minVersion: 'TLSv1.2',
          maxVersion: 'TLSv1.2',
          rejectUnauthorized: true,
        }
      : {
          servername,
          minVersion: 'TLSv1.2',
          maxVersion: 'TLSv1.2',
          rejectUnauthorized: true,
        }
  );

  return axios.create({
    baseURL: 'https://openbanking.bcp.com.bo/Web_ApiQr/api/v3',
    proxy: false,
    auth: {
      username: config.basicUsername,
      password: config.basicPassword,
    },
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    httpsAgent,
    timeout: 30000,
  });
}

// GET /api/v1/auditoria/qr
// Query params:
// - correlationId (string, optional)
// - from (ISO date string, optional)
// - to (ISO date string, optional)
// - page (number, default 1)
// - limit (number, default 20, max 100)
router.get('/qr', async (req: Request, res: Response) => {
  try {
    const { correlationId, from, to, includeEvents } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limitRaw = Math.max(1, Number(req.query.limit ?? 20));
    const limit = Math.min(100, limitRaw);
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (correlationId && typeof correlationId === 'string') {
      filter.correlationId = correlationId.trim();
    }
    // Timezone handling: inputs are dates in local timezone -04:00 (YYYY-MM-DD)
    const TZ_OFFSET_MINUTES = -4 * 60; // -240
    const normalizeDateStr = (s: string) => s.trim().replace(/-+/g, '-');
    const parseDayRange = (dateStr: string) => {
      const m = normalizeDateStr(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      const [_, y, mo, d] = m;
      // Build a UTC date corresponding to local -04:00 start of day
      const year = Number(y);
      const monthIndex = Number(mo) - 1;
      const day = Number(d);
      // Start of day at 00:00 in -04:00 equals UTC time of 04:00
      const startLocalMs = Date.UTC(year, monthIndex, day, 0, 0, 0);
      const startUtc = new Date(startLocalMs - TZ_OFFSET_MINUTES * 60 * 1000);
      // Next day start
      const nextDayLocalMs = Date.UTC(year, monthIndex, day + 1, 0, 0, 0);
      const endUtc = new Date(nextDayLocalMs - TZ_OFFSET_MINUTES * 60 * 1000);
      return { $gte: startUtc, $lt: endUtc };
    };

    const hasFrom = !!from && typeof from === 'string';
    const hasTo = !!to && typeof to === 'string';
    if (hasFrom && hasTo) {
      const r1 = parseDayRange(from!);
      const r2 = parseDayRange(to!);
      if (r1 && r2) {
        filter.createdAt = { $gte: r1.$gte, $lt: r2.$lt };
      }
    } else if (hasFrom) {
      const r = parseDayRange(from!);
      if (r) filter.createdAt = r;
    } else if (hasTo) {
      const r = parseDayRange(to!);
      if (r) filter.createdAt = r;
    }

    const col = await getBcpQrTransaccionCollection();
    const projection = includeEvents === 'true' ? undefined : { events: 0 } as any;

    const [items, total] = await Promise.all([
      col.find(filter, { projection }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      col.countDocuments(filter),
    ]);

    res.json({
      page,
      limit,
      total,
      items,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Internal error', error: error.message });
  }
});

// GET /api/v1/auditoria/qr/banco
// Query params: from, to, includeEvents
router.get('/qr/banco', async (req: Request, res: Response) => {
  try {
    const { from, to, includeEvents } = req.query as Record<string, string | undefined>;
    const hasFrom = !!from && typeof from === 'string';
    const hasTo = !!to && typeof to === 'string';
    
    // Log para debugging
    console.log('=== Auditoria QR Banco Debug ===');
    console.log('Query params:', { from, to, includeEvents });
    console.log('Config values:', {
      appUserId: (config as any).appUserId,
      businessCode: (config as any).businessCode,
      publicToken: (config as any).publicToken ? '***' : 'MISSING',
      basicUsername: config.basicUsername ? '***' : 'MISSING',
      basicPassword: config.basicPassword ? '***' : 'MISSING',
    });
    
    const payload = {
      appUserId: (config as any).appUserId,
      currency: 'BOB',
      serviceCode: '050',
      businessCode: (config as any).businessCode,
      publicToken: (config as any).publicToken,
      startDate: hasFrom ? from.replace(/-/g, '') : '20250101', //aaaaMMdd - fecha por defecto
      finalDate: hasTo ? to.replace(/-/g, '') : '20251231', //aaaaMMdd - fecha por defecto
      statusPayment: 'P',
    };
    
    console.log('Payload to send:', JSON.stringify(payload, null, 2));
    
    const correlationId = generateCorrelationId();
    console.log('Generated correlationId:', correlationId);
    
    const response = await getV3HttpClient().post('/Qr/Report/Detail', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Correlation-Id': correlationId,
      },
    });
    
    console.log('BCP Response status:', response.status);
    console.log('BCP Response data:', JSON.stringify(response.data, null, 2));
    
    // Persist transaction (success)
    try {
      const col = await getBcpQrTransaccionCollection();
      await col.insertOne({
        correlationId,
        IdCorrelation: correlationId,
        direction: 'request',
        endpoint: '/Qr/Report/Detail',
        request: {
          payload,
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Correlation-Id': correlationId },
        },
        response: {
          status: response.status,
          data: response.data,
        },
        createdAt: new Date(),
        success: response.data?.state === '00',
      });
    } catch (dbErr) {
      console.error('Failed to persist bcpQrTransaccion (success):', (dbErr as Error).message);
    }
    
    // Return response in same format as received from BCP
    return res.status(response.status).json({ 
      correlationId, 
      ...response.data 
    });
  } catch (error:any) {
    console.error('=== Auditoria QR Banco Error ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    let correlationId = 'none';
    
    // Si es error de axios, mostrar más detalles
    if (error.response) {
      console.error('Axios error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers,
      });
      
      // Si es error 400 del BCP, devolver esa misma respuesta
      if (error.response.status === 400) {
        return res.status(400).json({
          correlationId,
          ...error.response.data
        });
      }
    } else if (error.request) {
      console.error('Axios error request (no response):', error.request);
    }
    
    res.status(500).json({ 
      message: 'Internal error', 
      error: error.message,
      type: error.constructor.name,
      correlationId
    });
  }
});

// GET /api/v1/auditoria/qr/:correlationId
// Returns a single transaction document. Use includeEvents=true to include history.
router.get('/qr/:correlationId', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.correlationId || '').trim();
    if (!id) {
      return res.status(400).json({ message: 'Missing correlationId' });
    }
    const includeEvents = String(req.query.includeEvents || 'true');
    const col = await getBcpQrTransaccionCollection();
    const projection = includeEvents === 'true' ? undefined : { events: 0 } as any;
    const doc = await col.findOne({ $or: [{ correlationId: id }, { IdCorrelation: id }] }, { projection });
    if (!doc) {
      return res.status(404).json({ message: 'Not found', correlationId: id });
    }
    res.json(doc);
  } catch (error: any) {
    res.status(500).json({ message: 'Internal error', error: error.message });
  }
});

export default router;
