import axios, { AxiosInstance } from 'axios';
import https from 'https';
import fs from 'fs';
import { config } from './config';

let cachedClient: AxiosInstance | null = null;
let lastSignature = '';

function computeSignature(): string {
  const parts = [
    config.baseURL,
    config.basicUsername,
    config.basicPassword,
    config.mtlsPfxPath || '',
    config.mtlsPfxPassword || '',
  ];
  return parts.join('|');
}

export function getHttpClient(): AxiosInstance {
  const currentSignature = computeSignature();
  // Temporalmente deshabilitamos el cache para debug
  // if (cachedClient && currentSignature === lastSignature) {
  //   return cachedClient;
  // }

  let servername: string | undefined = undefined;
  try {
    const u = new URL(config.baseURL);
    servername = u.hostname;
  } catch (_) {
    // ignore
  }

  console.log('=== HTTP Client Debug ===');
  console.log('BaseURL:', config.baseURL);
  console.log('Servername:', servername);
  console.log('MTLS PFX Path:', config.mtlsPfxPath);
  console.log('MTLS PFX exists:', config.mtlsPfxPath ? require('fs').existsSync(config.mtlsPfxPath) : 'N/A');
  console.log('Basic Auth:', config.basicUsername, ':***');

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

  cachedClient = axios.create({
    baseURL: config.baseURL,
    // Evita usar proxy corporativo para este cliente (comportamiento como Postman sin proxy)
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
  lastSignature = currentSignature;
  return cachedClient;
}


