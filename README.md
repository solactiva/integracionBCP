![Cron job status](https://api.cron-job.org/jobs/6661285/7fde12aa488e3b8e/status-1.svg)

# OpenBanking Proxy API

## Requisitos
- Node 20+
- MongoDB (para cargar configuración dinámica)

## Variables de entorno (.env)
Obligatorias:
```
BASE_URL=https://sandbox.openbanking.bcp.com.bo/Web_ApiQr/api/v4
BASIC_USERNAME=...
BASIC_PASSWORD=...
MTLS_PFX_PATH=./certs/BCP_SANDBOX_OPENBANKING.pfx
MTLS_PFX_PASSWORD=...
PORT=3030
MONGODB_URI=mongodb://localhost:27017/integracion
```
Opcionales:
```
API_VERSION=v1
API_SUPPORTED_VERSIONS=v1,v2
API_LEGACY_DEFAULT_VERSION=v1
BUSINESS_CODE=
APP_USER_ID=
CITY=
PUBLIC_TOKEN=
```

## Ejecución
Desarrollo:
```
npm run dev
```
Producción:
```
npm run build && npm start
```

## Endpoints
Health:
```
GET /health                  # legacy
GET /api/{v}/health
```
Generar QR (v1):
```
POST /api/v1/generarqr
```

Auditoría (v1):
```
GET /api/v1/auditoria/qr
GET /api/v1/auditoria/qr/:correlationId
```
Query params:
- `correlationId` (opcional)
- `from`, `to` (YYYY-MM-DD en zona -04:00). Si solo envías uno, devuelve ese día completo. Si envías ambos, devuelve el rango inclusivo [from..to].
- `page` (default 1), `limit` (default 20, máx 100)
- `includeEvents` (true/false) para incluir o excluir el historial `events` en el resultado (aplica a listado y detalle).

Callback de QR (v1):
```
POST /api/v1/callbacks/qr
```
Headers:
- `Authorization: Basic <base64(username:password)>`
  - Se validan credenciales desde Mongo (`bcpconfigs`: `bcpusername`/`bcppassword`).
  - Si no existen en Mongo, hace fallback a variables de entorno `BASIC_USERNAME`/`BASIC_PASSWORD`.
Body JSON (campos típicos del proveedor):
- Incluye: `IdCorrelation` (clave principal, coincide con nuestro correlationId interno generado al crear el QR), `CorrelationId` (identificador externo del proveedor, opcional), `Id`, `ServiceCode`, `BusinessCode`, `IdQr`, `Amount`, `Currency`, `Gloss`, `Receiver*`, `Status`, `ResponseCode`, `ResponseDate`, `OperationNumber`, `SingleUse`, `EnableBank`, `City`, `BranchOffice`, `Teller`, `PhoneNumber`, `Collectors`, etc.

Persistencia:
- Las solicitudes y callbacks se guardan en `bcpQrTransaccion` con índices en `correlationId`, `IdCorrelation` y `createdAt`.
- El callback sube campos clave a nivel raíz y también almacena el payload normalizado completo bajo `callback`.

## Versionado de API
- Configurable con `API_SUPPORTED_VERSIONS` (p. ej. `v1,v2`).
- Las rutas sin versión apuntan a `API_LEGACY_DEFAULT_VERSION`.
- `X-API-Version` se añade en respuestas versionadas.

## Configuración dinámica desde MongoDB
Se lee la colección `integracion.bcpconfigs` y, si hay un documento activo (`isActive: true`), se aplican los campos: `baseURL`, `username`, `password`, `bcpusername`, `bcppassword`, `businessCode`, `appUserId`, `publicToken`, `sslPassword`.
