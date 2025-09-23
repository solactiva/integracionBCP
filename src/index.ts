import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config';
import { loadAndApplyBcpConfig } from './services/configService';
import { getHealthReport } from './services/healthService';
import generarQrRouterV1 from './routes/v1/generarQr';
import { ensureBcpQrTransaccionIndexes } from './db/mongo';
import auditoriaRouterV1 from './routes/v1/auditoria';
import callbacksRouterV1 from './routes/v1/callbacks';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const allApiPrefixes = config.supportedApiVersions.map(v => `/api/${v}`);

// Backward compatibility: keep previous health endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Versioned health endpoints for all supported versions
allApiPrefixes.forEach(prefix => {
  app.get(`${prefix}/health`, async (_req, res) => {
    res.setHeader('X-API-Version', prefix.split('/').pop() || config.apiVersion);
    try {
      const report = await getHealthReport();
      res.json(report);
    } catch (err) {
      res.status(500).json({ status: 'error', message: (err as Error).message });
    }
  });
});

// Versioned routes for all supported versions (only generarqr for v1)
allApiPrefixes.forEach(prefix => {
  const version = prefix.split('/').pop() || config.apiVersion;
  if (version === 'v1') {
    app.use(`${prefix}/generarqr`, (req, res, next) => {
      res.setHeader('X-API-Version', version);
      next();
    }, generarQrRouterV1);
    app.use(`${prefix}/auditoria`, (req, res, next) => {
      res.setHeader('X-API-Version', version);
      next();
    }, auditoriaRouterV1);
    app.use(`${prefix}/callbacks`, (req, res, next) => {
      res.setHeader('X-API-Version', version);
      next();
    }, callbacksRouterV1);
  }
});

async function bootstrap() {
  try {
    const timeoutMs = 2000;
    await Promise.race([
      loadAndApplyBcpConfig(),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    // Ensure DB indexes for QR transactions
    try {
      await ensureBcpQrTransaccionIndexes();
      console.log('Mongo indexes ensured for bcpQrTransaccion');
    } catch (e) {
      console.warn('Failed to ensure Mongo indexes (continuing):', (e as Error).message);
    }
  } catch (err) {
    console.error('Failed to load DB config, continuing with .env config:', (err as Error).message);
  }

  app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port} (versions: ${allApiPrefixes.join(', ')})`);
  });
}

bootstrap();



