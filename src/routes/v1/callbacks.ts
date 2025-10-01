import { Router, Request, Response } from 'express';
import { Buffer } from 'buffer';
import { config } from '../../config';
import { getBcpQrTransaccionCollection } from '../../db/mongo';

const router = Router();

function parseBasicAuth(header?: string | null): { username: string; password: string } | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'basic' || !value) return null;
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

// Basic normalization utilities (no external deps)
const toStringOrNull = (v: any): string | null => (v === undefined || v === null ? null : String(v));
const toNumberOrNull = (v: any): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const toBooleanOrNull = (v: any): boolean | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return null;
};
const toDateStringOrNull = (v: any): string | null => {
  const s = toStringOrNull(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const toArrayOrNull = (v: any): any[] | null => (Array.isArray(v) ? v : null);

// POST /api/v1/callbacks/qr
// Receives Basic Auth and a JSON payload with QR transaction status fields
router.post('/qr', async (req: Request, res: Response) => {
  try {
    // 1) Auth
    const creds = parseBasicAuth(req.header('authorization'));
    // Prefer Mongo-loaded bcpusername/bcppassword, fallback to basicUsername/basicPassword
    const expectedUsername = (config as any).bcpusername ?? (config as any).basicUsername;
    const expectedPassword = (config as any).bcppassword ?? (config as any).basicPassword;
    if (!creds || !expectedUsername || !expectedPassword) {
      return res.status(401).json({ State:'003',Message: 'Credenciales Incorrectas',Data: {
        Id: 'E-'+ 124548,
      } });
    }
    const ok = creds.username === expectedUsername && creds.password === expectedPassword;
    if (!ok) {
      return res.status(401).json({ State:'003',Message: 'Credenciales Incorrectas',Data: {
        Id: 'E-'+ 124548,
      } });
    }
    
    // 2) Body and key selection
    const body = req.body || {};
    // IdCorrelation is the identifier we stored as correlationId internally
    const idCorrelation: any = body.IdCorrelation;
    if (!idCorrelation || (typeof idCorrelation !== 'string' && typeof idCorrelation !== 'number')) {
      return res.status(400).json({ State:'060',Message: 'Missing IdCorrelation in body' });
    }
    const correlationId = String(idCorrelation).trim();
    if (!correlationId) {
      return res.status(400).json({ State:'061',Message: 'Invalid IdCorrelation' });
    }
    
    // Normalize fields
    const normalized = {
      IdCorrelation: correlationId,
      CorrelationId: toStringOrNull(body.CorrelationId),
      Id: toNumberOrNull(body.Id),
      ServiceCode: toStringOrNull(body.ServiceCode),
      BusinessCode: toStringOrNull(body.BusinessCode),
      IdQr: toStringOrNull(body.IdQr),
      Eif: toStringOrNull(body.Eif),
      Account: toStringOrNull(body.Account),
      Amount: toNumberOrNull(body.Amount),
      Currency: toStringOrNull(body.Currency),
      Gloss: toStringOrNull(body.Gloss),
      ReceiverAccount: toStringOrNull(body.ReceiverAccount),
      ReceiverName: toStringOrNull(body.ReceiverName),
      ReceiverDocument: toStringOrNull(body.ReceiverDocument),
      ReceiverBank: toStringOrNull(body.ReceiverBank),
      ExpirationDate: toDateStringOrNull(body.ExpirationDate) ?? toStringOrNull(body.ExpirationDate),
      ResponseCode: toStringOrNull(body.ResponseCode),
      Status: toStringOrNull(body.Status),
      Request: toStringOrNull(body.Request),
      RequestDate: toDateStringOrNull(body.RequestDate) ?? toStringOrNull(body.RequestDate),
      Response: toStringOrNull(body.Response),
      ResponseDate: toDateStringOrNull(body.ResponseDate) ?? toStringOrNull(body.ResponseDate),
      ResponseAch: toStringOrNull(body.ResponseAch),
      ResponseAchDate: toDateStringOrNull(body.ResponseAchDate) ?? toStringOrNull(body.ResponseAchDate),
      State: toBooleanOrNull(body.State),
      Description: toStringOrNull(body.Description),
      GenerateType: toNumberOrNull(body.GenerateType),
      Version: toStringOrNull(body.Version),
      SingleUse: toBooleanOrNull(body.SingleUse),
      OperationNumber: toStringOrNull(body.OperationNumber),
      EnableBank: toStringOrNull(body.EnableBank),
      City: toStringOrNull(body.City),
      BranchOffice: toStringOrNull(body.BranchOffice),
      Teller: toStringOrNull(body.Teller),
      PhoneNumber: toStringOrNull(body.PhoneNumber),
      Collectors: toArrayOrNull(body.Collectors),
    };

    // 3) Prepare update document (flatten important fields + keep full callback)
    const now = new Date();
    // Only set non-null fields to avoid overwriting existing data with nulls
    const setFields: any = {
      correlationId,
      IdCorrelation: correlationId,
      providerCorrelationId: normalized.CorrelationId,
      callback: { ...normalized, receivedAt: now },
      updatedAt: now,
    };
    // Only keep minimal status-related fields at root to avoid duplicating information
    const map: Record<string, any> = {
      status: normalized.Status,
      responseCode: normalized.ResponseCode,
      responseDate: normalized.ResponseDate,
      operationNumber: normalized.OperationNumber,
      idQr: normalized.IdQr,
    };
    for (const [k, v] of Object.entries(map)) {
      if (v !== null && v !== undefined) setFields[k] = v;
    }

    // 4) Match existing transaction primarily by correlationId; fallback by IdCorrelation
    const col = await getBcpQrTransaccionCollection();
    const filter: any = { correlationId };

    // ensure createdAt on insert
    const setOnInsert = {
      createdAt: now,
      direction: 'callback',
      endpoint: 'callback/qr',
    };

    const result = await col.findOneAndUpdate(
      filter,
      {
        $set: setFields,
        $setOnInsert: setOnInsert,
        $push: { events: { type: 'callback', at: now, data: normalized } },
      },
      { upsert: true, returnDocument: 'after' }
    );
    const respuesta = {
      State: "000",
      Message: "Transacción exitosaCorrecto",
      Data: {
        Id: normalized.Id,
      }
    };
    return res.status(200).json(respuesta);
  } catch (error: any) {
    const respuesta = {
      State: "999",
      Message: "Transacción exitosaCorrecto",
      Data: {
        Id: null,
      }
    };
    return res.status(500).json(respuesta);
  }
});

export default router;
