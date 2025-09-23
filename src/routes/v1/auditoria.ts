import { Router, Request, Response } from 'express';
import { getBcpQrTransaccionCollection } from '../../db/mongo';

const router = Router();

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
