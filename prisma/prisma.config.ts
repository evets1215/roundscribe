import { defineConfig } from "prisma/config";

export default defineConfig({
  // Connection URL used by `prisma migrate` and `prisma studio`.
  // Set DATABASE_URL in .env.local for local dev (see .env.example).
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
