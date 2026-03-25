import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const DEV_USER = {
  id: "dev-user",
  email: "dev-user@roundscribe.local",
  name: "Dev User",
};

export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) {
    return session.user.id;
  }

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  // If no DATABASE_URL is configured, skip the DB upsert and return the dev user id directly.
  if (!process.env.DATABASE_URL) {
    return DEV_USER.id;
  }

  const user = await prisma.user.upsert({
    where: { email: DEV_USER.email },
    update: { name: DEV_USER.name },
    create: DEV_USER,
  });

  return user.id;
}
