/**
 * Seed inicial: roles del sistema (FINAL_USER, TECHNICIAN, ADMIN) y un usuario
 * Administrador para el primer login. Ejecutar con: npm run db:seed
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { RoleName } from '../src/generated/prisma/enums.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const name of Object.values(RoleName)) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log('Roles sembrados: FINAL_USER, TECHNICIAN, ADMIN');

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@empresa.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'CambiarEsteClave123!';

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      fullName: 'Administrador',
      passwordHash: await bcrypt.hash(adminPassword, 12),
      roleId: adminRole.id,
    },
  });
  console.log(`Usuario admin listo: ${adminEmail} (cambiar la contraseña tras el primer login)`);

  const defaultCategories = ['Redes', 'Hardware', 'Software', 'Cuentas y Accesos'];
  for (const name of defaultCategories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log('Categorías por defecto sembradas.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
