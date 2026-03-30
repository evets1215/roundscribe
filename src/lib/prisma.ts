import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const dbPath = path.join(process.cwd(), "prisma", "dev.db");

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  (() => {
    const adapter = new PrismaBetterSqlite3({ url: dbPath });
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  })();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
