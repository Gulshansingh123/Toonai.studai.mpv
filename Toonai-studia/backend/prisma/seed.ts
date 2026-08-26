import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.creditProduct.createMany({
    data: [
      { sku: "toonai_credits_100", label: "100 Credits", credits: 100, priceInPaise: 4900 },
      { sku: "toonai_credits_200", label: "200 Credits", credits: 200, priceInPaise: 9900 },
      { sku: "toonai_credits_300", label: "300 Credits", credits: 300, priceInPaise: 14900 },
      { sku: "toonai_credits_500", label: "500 Credits", credits: 500, priceInPaise: 19900 },
    ],
    skipDuplicates: true,
  });

  await prisma.subscriptionProduct.createMany({
    data: [
      { plan: "FREE", monthlyCredits: 10, priceInPaise: 0 },
      { plan: "BASIC", sku: "toonai_basic_monthly", monthlyCredits: 30, priceInPaise: 9900 },
      { plan: "CREATOR", sku: "toonai_creator_monthly", monthlyCredits: 100, priceInPaise: 19900 },
      { plan: "PRO", sku: "toonai_pro_monthly", monthlyCredits: 250, priceInPaise: 39900 },
    ],
    skipDuplicates: true,
  });

  await prisma.adminSetting.upsert({
    where: { key: "credit_costs" },
    update: {},
    create: { key: "credit_costs", value: { "5": 1, "10": 2, "15": 3, "30": 5 } },
  });

  await prisma.adminSetting.upsert({
    where: { key: "welcome_credits" },
    update: {},
    create: { key: "welcome_credits", value: { amount: 10 } },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
