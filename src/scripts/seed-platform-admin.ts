import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { PlatformAdmin } from '../features/platform-admin/platform-admin.entity';

const BCRYPT_SALT_ROUNDS = 10;

/**
 * One-time setup script: creates the initial platform admin in
 * public.platform_admins.
 *
 * Reads PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD / PLATFORM_ADMIN_NAME
 * from the environment (.env is loaded by src/data-source.ts). This is a
 * manual setup step, NOT something the running app reads continuously.
 *
 * Run with: npm run seed:admin
 */
async function seedPlatformAdmin(): Promise<void> {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const name = process.env.PLATFORM_ADMIN_NAME;

  if (!email || !password || !name) {
    const missing = (
      [
        ['PLATFORM_ADMIN_EMAIL', email],
        ['PLATFORM_ADMIN_PASSWORD', password],
        ['PLATFORM_ADMIN_NAME', name],
      ] as Array<[string, string | undefined]>
    )
      .filter(([, value]) => !value)
      .map(([key]) => key);
    console.error(
      `[seed-platform-admin] Missing required environment variable(s): ${missing.join(', ')}`,
    );
    console.error(
      'Add them to your .env (see .env.example), then re-run: npm run seed:admin',
    );
    process.exit(1);
  }

  await AppDataSource.initialize();

  try {
    const repository = AppDataSource.getRepository(PlatformAdmin);

    const existing = await repository.findOne({ where: { email } });
    if (existing) {
      console.log(
        `[seed-platform-admin] Platform admin with email "${email}" already exists ` +
          `(id: ${existing.id}). Skipping insertion.`,
      );
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const admin = repository.create({ email, passwordHash, name });
    await repository.save(admin);

    console.log(
      `[seed-platform-admin] Created platform admin "${name}" <${email}> ` +
        `(id: ${admin.id}).`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

seedPlatformAdmin().catch((error) => {
  console.error('[seed-platform-admin] Failed:', error);
  process.exit(1);
});
