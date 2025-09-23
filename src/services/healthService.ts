import { getMongoDb } from '../db/mongo';

type ServiceStatus = 'OK' | 'DOWN' | 'CHECKING';

export async function getHealthReport(): Promise<any> {
  const memoryUsage = process.memoryUsage();

  const dbResult = await checkDatabase(800);

  return {
    status: dbResult.status === 'DOWN' ? 'degraded' : 'ok',
    message: 'API is healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbResult,
      memory: {
        status: 'OK',
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      },
      uptime: `${process.uptime().toFixed(2)} seconds`,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      version: process.env.npm_package_version || '1.0.0',
    },
  };
}

async function checkDatabase(timeoutMs: number): Promise<{ status: ServiceStatus; message: string }> {
  try {
    const result = await withTimeout(async () => {
      const db = await getMongoDb();
      await db.command({ ping: 1 });
      return true;
    }, timeoutMs);

    if (result) {
      return { status: 'OK', message: 'Conectado a DB' };
    }
    return { status: 'CHECKING', message: 'Sin respuesta de DB dentro del timeout' };
  } catch (err) {
    return { status: 'DOWN', message: (err as Error).message };
  }
}

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    fn()
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}


