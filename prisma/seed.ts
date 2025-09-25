import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const defs = [
    {
      code: "real_photo",
      label: "Foto Real",
      description: "Tu foto de perfil fue validada.",
      icon: "user_check",
    },
    {
      code: "real_name",
      label: "Nombre Real Verificado",
      description: "Tu nombre fue verificado con documento.",
      icon: "id_card",
    },
    {
      code: "kindness",
      label: "Amabilidad & Atención",
      description: "Alta calificación y respuesta rápida.",
      icon: "smile",
    },
    {
      code: "on_time",
      label: "Puntualidad",
      description: "Entregas a tiempo comprobadas por clientes.",
      icon: "clock",
    },
    {
      code: "top_recommended",
      label: "Top Recomendado",
      description: "Entre los más recomendados del mes.",
      icon: "award",
    },
  ] as const;

  for (const b of defs) {
    await prisma.badge.upsert({
      where: { code: b.code as any },
      update: { label: b.label, description: b.description, icon: b.icon as any },
      create: { code: b.code as any, label: b.label, description: b.description, icon: b.icon as any },
    });
  }
  console.log("✅ Badges seed listo");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });