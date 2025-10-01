import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export type AppConfig = {
  port: number;
  baseURL: string;
  apiVersion: string;
  supportedApiVersions: string[];
  legacyDefaultVersion: string;
  basicUsername: string;
  basicPassword: string;
  // Credentials that may be loaded from Mongo (collection `bcpconfigs`)
  // and used specifically for BCP callback auth
  bcpusername: string;
  bcppassword: string;
  mtlsPfxPath?: string;
  mtlsPfxPassword?: string;
  businessCode?: string;
  appUserId?: string;
  city?: string;
  publicToken?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const baseConfig = {
  port: Number(process.env.PORT ?? 3030),
  // baseURL: process.env.BASE_URL ?? 'https://sandbox.openbanking.bcp.com.bo/Web_ApiQr/api/v4',
  apiVersion: process.env.API_VERSION?.trim() || 'v1',
  supportedApiVersions: (process.env.API_SUPPORTED_VERSIONS?.split(',').map(v => v.trim()).filter(Boolean) || ['v1']),
  legacyDefaultVersion: process.env.API_LEGACY_DEFAULT_VERSION?.trim() || 'v1',
  // basicUsername: requireEnv('BASIC_USERNAME'),
  // basicPassword: requireEnv('BASIC_PASSWORD'),
} as const;

const optionalConfig: Partial<AppConfig> = {};

if (process.env.MTLS_PFX_PATH && process.env.MTLS_PFX_PATH.trim() !== '') {
  optionalConfig.mtlsPfxPath = path.resolve(process.env.MTLS_PFX_PATH);
}
if (process.env.MTLS_PFX_PASSWORD && process.env.MTLS_PFX_PASSWORD.trim() !== '') {
  optionalConfig.mtlsPfxPassword = process.env.MTLS_PFX_PASSWORD;
}
if (process.env.BUSINESS_CODE && process.env.BUSINESS_CODE.trim() !== '') {
  optionalConfig.businessCode = process.env.BUSINESS_CODE;
}
if (process.env.APP_USER_ID && process.env.APP_USER_ID.trim() !== '') {
  optionalConfig.appUserId = process.env.APP_USER_ID;
}
if (process.env.CITY && process.env.CITY.trim() !== '') {
  optionalConfig.city = process.env.CITY;
}
if (process.env.PUBLIC_TOKEN && process.env.PUBLIC_TOKEN.trim() !== '') {
  optionalConfig.publicToken = process.env.PUBLIC_TOKEN;
}

export const config: AppConfig = { ...baseConfig, ...optionalConfig } as AppConfig;



