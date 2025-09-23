import { MongoClient, Db, Collection } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

// Minimal typing for bcpQrTransaccion documents so that $push on `events` type-checks
export interface BcpEvent {
  type: string;
  at: Date;
  data: any;
}

export interface BcpQrTransaccionDoc {
  // Defining events as an array allows MongoDB $push operator to type-check
  events?: BcpEvent[];
  correlationId?: string;
  IdCorrelation?: string;
  direction?: string;
  endpoint?: string;
  request?: any;
  response?: any;
  createdAt?: Date;
  updatedAt?: Date;
  success?: boolean;
  callback?: any;
  providerCorrelationId?: string;
  status?: string;
  responseCode?: string;
  responseDate?: string;
  operationNumber?: string;
  idQr?: string;
  amount?: number;
  currency?: string;
  gloss?: string;
  serviceCode?: string;
  businessCode?: string;
  receiverAccount?: string;
  receiverName?: string;
  receiverDocument?: string;
  receiverBank?: string;
  expirationDate?: string;
  singleUse?: boolean;
  enableBank?: string;
  city?: string;
  branchOffice?: string;
  teller?: string;
  phoneNumber?: string;
  collectors?: any[];
}

export async function getMongoDb(): Promise<Db> {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri || uri.trim() === '') {
    throw new Error('Missing required environment variable: MONGODB_URI');
  }

  client = new MongoClient(uri);
  await client.connect();
  db = client.db('integracion');
  return db;
}

export async function getBcpConfigsCollection(): Promise<Collection> {
  const database = await getMongoDb();
  return database.collection('bcpconfigs');
}

export async function getBcpQrTransaccionCollection(): Promise<Collection<BcpQrTransaccionDoc>> {
  const database = await getMongoDb();
  return database.collection<BcpQrTransaccionDoc>('bcpQrTransaccion');
}

export async function ensureBcpQrTransaccionIndexes(): Promise<void> {
  const col = await getBcpQrTransaccionCollection();
  await col.createIndex({ correlationId: 1 }, { name: 'idx_correlationId_1' });
  await col.createIndex({ createdAt: -1 }, { name: 'idx_createdAt_-1' });
  await col.createIndex({ IdCorrelation: 1 }, { name: 'idx_IdCorrelation_1' });
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
