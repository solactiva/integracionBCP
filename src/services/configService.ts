import { getBcpConfigsCollection } from '../db/mongo';
import { config } from '../config';

type DbConfig = {
  baseURL?: string;
  username?: string;
  password?: string;
  bcpusername?: string;
  bcppassword?: string;
  businessCode?: string;
  appUserId?: string;
  publicToken?: string;
  sslPassword?: string;
  isActive?: boolean;
};

export async function loadAndApplyBcpConfig(): Promise<void> {
  const col = await getBcpConfigsCollection();
  const doc = (await col.findOne({ isActive: true })) as DbConfig | null;
  if (!doc) return;

  if (doc.baseURL) (config as any).baseURL = doc.baseURL;
  if (doc.username) (config as any).basicUsername = doc.username;
  if (doc.password) (config as any).basicPassword = doc.password;
  if (doc.bcpusername) (config as any).bcpusername = doc.bcpusername;
  if (doc.bcppassword) (config as any).bcppassword = doc.bcppassword;
  if (doc.businessCode) (config as any).businessCode = doc.businessCode;
  if (doc.appUserId) (config as any).appUserId = doc.appUserId;
  if (doc.publicToken) (config as any).publicToken = doc.publicToken;
  if (doc.sslPassword) (config as any).mtlsPfxPassword = doc.sslPassword;
}


