/**
 * Create the initial Admin user. Public registration can never assign the
 * Admin role, so this controlled script is the entry point.
 *
 * Usage:
 *   node scripts/create-admin.js --email=admin@example.com --password=ChangeMe123 --name="Site Admin"
 *   # or via environment:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=ChangeMe123 ADMIN_NAME="Site Admin" npm run admin:create
 */
import bcrypt from 'bcryptjs';
import { env, validateEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User, toSafeUser } from '../src/modules/users/user.model.js';
import { logger } from '../src/logger/logger.js';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function main() {
  validateEnv();
  const args = parseArgs(process.argv.slice(2));

  const email = (args.email ?? process.env.ADMIN_EMAIL ?? '').toLowerCase().trim();
  const password = args.password ?? process.env.ADMIN_PASSWORD ?? '';
  const name = (args.name ?? process.env.ADMIN_NAME ?? 'Administrator').trim();

  if (!email || !password) {
    console.error('Usage: node scripts/create-admin.js --email=<email> --password=<min 8 chars> [--name=<name>]');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('ADMIN password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  await connectDatabase();
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      console.error(`User with email '${email}' already exists (role: ${existing.role}). Refusing to overwrite.`);
      process.exitCode = 1;
      return;
    }

    const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
    const admin = await User.create({ name, email, passwordHash, role: 'admin', isActive: true });
    logger.info({ admin: toSafeUser(admin) }, 'Admin user created');
    console.log(`Admin created: ${email}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
