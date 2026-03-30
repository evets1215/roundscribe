import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  datasource: {
    url: `file:${path.join(__dirname, "prisma", "dev.db")}`,
  },
});
