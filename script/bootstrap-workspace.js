/* eslint-disable @typescript-eslint/no-require-imports */
const { randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeWorkspaceEmail(value) {
  const email = value?.trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) throw new Error("WORKSPACE_EMAIL must be a valid email address.");
  return email;
}

async function bootstrapWorkspace(prisma, workspaceEmail) {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, take: 2 });
  if (users.length > 1) throw new Error("Multiple workspace users found; refusing to select an owner automatically.");
  if (users.length === 1) return { action: "preserved", user: users[0] };
  const email = normalizeWorkspaceEmail(workspaceEmail);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: `disabled_${randomBytes(48).toString("hex")}`,
      name: email.split("@")[0],
    },
  });
  return { action: "created", user };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const prisma = new PrismaClient();
  try {
    const result = await bootstrapWorkspace(prisma, process.env.WORKSPACE_EMAIL);
    process.stdout.write(`WORKSPACE_${result.action.toUpperCase()} ${result.user.email}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Workspace bootstrap failed."}\n`);
    process.exit(1);
  });
}

module.exports = { bootstrapWorkspace, normalizeWorkspaceEmail };
