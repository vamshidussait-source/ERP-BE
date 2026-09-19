/**
 * One-off: run PENDING tenant-schema migrations against EXISTING tenant
 * schemas — the same compiled migration classes and bookkeeping the
 * TenantProvisioningService uses when provisioning a new tenant. Local dev
 * DBs provisioned before newer features (e.g. announcements) need this.
 *
 * Usage: node scripts/run-tenant-migrations.js <schemaName>
 */
require('dotenv').config();
const { DataSource } = require('typeorm');
const { tenantSchemaMigrations } = require('../dist/src/migrations/tenant-schema');

const schemaName = process.argv[2];
if (!schemaName) {
  console.error('Usage: node scripts/run-tenant-migrations.js <schemaName>');
  process.exit(1);
}

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'erp_db',
});

(async () => {
  const ds = await AppDataSource.initialize();
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await qr.query(`SET search_path TO "${schemaName}"`);
    await qr.query(
      `CREATE TABLE IF NOT EXISTS "${schemaName}".migrations (id serial PRIMARY KEY, name varchar(255) NOT NULL UNIQUE, run_on timestamp DEFAULT CURRENT_TIMESTAMP)`,
    );
    let applied = 0;
    for (const MigrationClass of tenantSchemaMigrations) {
      const instance = new MigrationClass();
      const name = instance.name ?? MigrationClass.name;
      const alreadyRun = await qr.query(
        `SELECT id FROM "${schemaName}".migrations WHERE name = $1`,
        [name],
      );
      if (alreadyRun.length === 0) {
        await instance.up(qr);
        await qr.query(`INSERT INTO "${schemaName}".migrations (name) VALUES ($1)`, [name]);
        applied++;
        console.log(`applied: ${name}`);
      }
    }
    await qr.commitTransaction();
    console.log(`done — ${applied} migration(s) applied to "${schemaName}"`);
  } catch (e) {
    await qr.rollbackTransaction();
    console.error('FAILED, rolled back:', e.message);
    process.exitCode = 1;
  } finally {
    await qr.release();
    await ds.destroy();
  }
})();
