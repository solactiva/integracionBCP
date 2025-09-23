import { Router, Request, Response } from 'express';
import { getHttpClient } from '../../httpClient';
import { config } from '../../config';
import crypto from 'crypto';
import { getBcpQrTransaccionCollection } from '../../db/mongo';

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

router.post('/', async (req: Request, res: Response) => {
  let correlationId: string | undefined;
  let payload: any;
  try {
    console.log('=== GenerarQR Endpoint Called ===');
    const data = req.body ?? {};

    payload = {
      amount: data.amount,
      currency: data.currency,
      gloss: data.gloss,
      serviceCode: data.serviceCode,
      singleUse: data.singleUse,
      enableBank: data.enableBank,
      businessCode: (config as any).businessCode,
      appUserId: (config as any).appUserId,
      city: data.city,
      branchOffice: data.branchOffice,
      teller: data.teller,
      phoneNumber: data.phoneNumber,
      publicToken: (config as any).publicToken,
      expiration: data.expiration,
      collectors: data.collectors || [],
    };

    // Always generate a fresh Correlation-Id for each request and expose it in the response
    correlationId = generateCorrelationId();

    const response = await getHttpClient().post('/Qr/Generated', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Correlation-Id': correlationId,
        // Authorization Basic se setea automáticamente desde axios auth en el cliente
      },
    });
    // Persist transaction (success)
    try {
      const col = await getBcpQrTransaccionCollection();
      await col.insertOne({
        correlationId,
        IdCorrelation: correlationId,
        direction: 'request',
        endpoint: '/Qr/Generated',
        request: {
          payload,
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Correlation-Id': correlationId },
        },
        response: {
          status: response.status,
          data: response.data,
        },
        createdAt: new Date(),
        success: true,
      });
    } catch (dbErr) {
      console.error('Failed to persist bcpQrTransaccion (success):', (dbErr as Error).message);
    }
    res.status(response.status).json({ correlationId, amount: payload.amount, ...response.data });
  } catch (error: any) {
    if (error.response) {
      const cid = correlationId || generateCorrelationId();
      // Persist transaction (upstream error)
      try {
        const col = await getBcpQrTransaccionCollection();
        await col.insertOne({
          correlationId: cid,
          IdCorrelation: cid,
          direction: 'request',
          endpoint: '/Qr/Generated',
          request: {
            payload,
            // headers omitted in error case since they are same as success
          },
          response: {
            status: error.response.status,
            data: error.response.data,
          },
          createdAt: new Date(),
          success: false,
        });
      } catch (dbErr) {
        console.error('Failed to persist bcpQrTransaccion (upstream error):', (dbErr as Error).message);
      }
      res.status(error.response.status).json({
        correlationId: cid,
        message: 'Upstream error',
        status: error.response.status,
        data: error.response.data,
      });
      return;
    }
    const cid = correlationId || generateCorrelationId();
    // Persist transaction (internal error)
    try {
      const col = await getBcpQrTransaccionCollection();
      await col.insertOne({
        correlationId: cid,
        IdCorrelation: cid,
        direction: 'request',
        endpoint: '/Qr/Generated',
        request: {
          payload,
        },
        response: {
          status: 500,
          error: error.message,
        },
        createdAt: new Date(),
        success: false,
      });
    } catch (dbErr) {
      console.error('Failed to persist bcpQrTransaccion (internal error):', (dbErr as Error).message);
    }
    res.status(500).json({ correlationId: cid, message: 'Internal error', error: error.message });
  }
});

export default router;



