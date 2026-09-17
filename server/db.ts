import pg from 'pg';
import { X509Certificate } from 'node:crypto';
import { config } from './config/index';

export type DB = {
  query: (
    text: string,
    values?: any[],
  ) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

let pool: pg.Pool | undefined;

let override:
  | (DB & {
      connect: () => Promise<DB & { release: () => void }>;
    })
  | undefined;

export function useTestDatabase(db: typeof override) {
  override = db;
}

export function database() {
  if (override) return override;

  if (!config.databaseUrl) {
    throw new Error('CONFIGURATION_DATABASE');
  }

  if (!pool) {
    const url = new URL(config.databaseUrl);

    const local = [
      'localhost',
      '127.0.0.1',
      '::1',
      '[::1]',
    ].includes(url.hostname);

    // Prevent connection-string settings from replacing our SSL configuration.
    const sslParameters = [
      'ssl',
      'sslmode',
      'sslcert',
      'sslkey',
      'sslrootcert',
      'sslnegotiation',
      'uselibpqcompat',
    ];

    const removedSslParameters = sslParameters.filter((key) =>
      url.searchParams.has(key),
    );

    sslParameters.forEach((key) => url.searchParams.delete(key));

    const ca = config.databaseCa
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .trim();

    const options: pg.PoolConfig = {
      connectionString: url.toString(),
      max: 3,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
      ssl: local
        ? false
        : {
            rejectUnauthorized: true,
            ...(ca ? { ca } : {}),
          },
      options: '-c search_path=okpora,public -c statement_timeout=15000',
    };

    // Inspect the driver's parsed settings without connecting.
    // This check runs once when this function instance creates its pool.
    const diagnosticClient = new pg.Client(options);
    const effectiveSsl = Reflect.get(
      diagnosticClient,
      'connectionParameters',
    ).ssl;

    const diagnostic = {
      certificateSource: process.env.DATABASE_CA_CERT
        ? 'DATABASE_CA_CERT'
        : process.env.DATABASE_CA_CERT_BASE64
          ? 'DATABASE_CA_CERT_BASE64'
          : 'missing',
      localConnection: local,
      removedSslParameters,
      decodedCertificatePresent: Boolean(ca),
      certificateReachedDriver: Boolean(
        effectiveSsl &&
          typeof effectiveSsl === 'object' &&
          effectiveSsl.ca,
      ),
    };

    try {
      const certificate = new X509Certificate(effectiveSsl?.ca || '');

      console.log('OKPORA_TLS_DIAGNOSTIC', {
        ...diagnostic,
        certificateParses: true,
        isCertificateAuthority: certificate.ca,
        issuer: certificate.issuer,
        fingerprint: certificate.fingerprint256,
        expires: certificate.validTo,
      });
    } catch {
      console.log('OKPORA_TLS_DIAGNOSTIC', {
        ...diagnostic,
        certificateParses: false,
      });
    }

    pool = new pg.Pool(options);
  }

  return pool;
}

export const query = (text: string, values: any[] = []) =>
  database().query(text, values);

export async function tx<T>(
  fn: (db: DB) => Promise<T>,
): Promise<T> {
  const db = await database().connect();

  try {
    await db.query('BEGIN');
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export async function close() {
  await pool?.end();
}