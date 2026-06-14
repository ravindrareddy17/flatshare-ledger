const { PrismaClient } = require("@prisma/client");

// Reuse a single PrismaClient instance (recommended by Prisma docs to avoid
// exhausting DB connections in dev with hot-reload).
const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
