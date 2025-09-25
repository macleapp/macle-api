// src/modules/users/badges.ts

import { BadgeCode, BadgeIcon } from "@prisma/client";

/**
 * Definición estática del catálogo de insignias disponibles en la app.
 * Se usa en seeds / ensureBadgeCatalog para poblar la tabla Badge.
 */
export const BADGE_DEFS: Array<{
  code: BadgeCode;
  label: string;
  description: string;
  icon: BadgeIcon;
}> = [
  {
    code: BadgeCode.real_photo,
    label: "Foto Real",
    description: "Tu foto de perfil fue validada.",
    icon: BadgeIcon.user_check,
  },
  {
    code: BadgeCode.real_name,
    label: "Nombre Real Verificado",
    description: "Tu nombre fue verificado con documento.",
    icon: BadgeIcon.id_card,
  },
  {
    code: BadgeCode.kindness,
    label: "Amabilidad & Atención",
    description: "Alta calificación y respuesta rápida.",
    icon: BadgeIcon.smile,
  },
  {
    code: BadgeCode.on_time,
    label: "Puntualidad",
    description: "Entregas a tiempo comprobadas por clientes.",
    icon: BadgeIcon.clock,
  },
  {
    code: BadgeCode.top_recommended,
    label: "Top Recomendado",
    description: "Entre los más recomendados del mes.",
    icon: BadgeIcon.award,
  },
];