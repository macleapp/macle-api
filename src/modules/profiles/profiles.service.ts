// src/modules/profiles/profiles.service.ts
import prisma from "../../lib/prisma";

export type UpdateCustomerDTO = {
  name?: string | null;
};

export type UpsertSellerDTO = {
  name: string;
  phone?: string | null;
  city?: string | null;
};

export type AddMediaDTO = {
  url: string;                 // absoluto o relativo (e.g. /api/uploads/xxx.jpg)
  type: "PHOTO" | "VIDEO";     // coincide con enum MediaType del schema
  caption?: string | null;
};

export const profilesService = {
  /* =========================
   *       CLIENTE (User)
   * ========================= */
  async getCustomerProfile(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        emailVerifiedAt: true,
        paidVerified: true,
        paidVerifiedAt: true,
        business: { select: { id: true } },
        serviceProfile: { select: { id: true } },
      },
    });
    if (!user) throw new Error("Usuario no encontrado");
    return user;
  },

  async updateCustomerProfile(userId: number, data: UpdateCustomerDTO) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        emailVerifiedAt: true,
        paidVerified: true,
        paidVerifiedAt: true,
      },
    });
    return updated;
  },

  /* =========================
   *   EMPRENDEDOR (Business)
   * ========================= */
  async getSellerProfile(ownerId: number) {
    return prisma.business.findUnique({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        phone: true,
        city: true,
        ownerId: true,
      },
    });
  },

  async upsertSellerProfile(ownerId: number, payload: UpsertSellerDTO) {
    // Normaliza name
    const name = (payload.name ?? "").trim();
    if (!name) throw new Error("El nombre del negocio es requerido");

    const exists = await prisma.business.findUnique({ where: { ownerId } });
    if (exists) {
      return prisma.business.update({
        where: { ownerId },
        data: {
          name,
          phone: payload.phone ?? null,
          city: payload.city ?? null,
        },
        select: { id: true, name: true, phone: true, city: true, ownerId: true },
      });
    }
    return prisma.business.create({
      data: {
        ownerId,
        name,
        phone: payload.phone ?? null,
        city: payload.city ?? null,
      },
      select: { id: true, name: true, phone: true, city: true, ownerId: true },
    });
  },

  /** Marca/verifica badge por pago (User.paidVerified). */
  async setSellerVerified(ownerId: number, verified: boolean) {
    const updated = await prisma.user.update({
      where: { id: ownerId },
      data: verified
        ? { paidVerified: true, paidVerifiedAt: new Date() }
        : { paidVerified: false, paidVerifiedAt: null },
      select: { id: true, email: true, paidVerified: true, paidVerifiedAt: true },
    });
    return updated;
  },

  /* =========================
   *     PRODUCTOS VENDEDOR
   * ========================= */
  async listSellerProducts(ownerId: number) {
    return prisma.product.findMany({
      where: { sellerId: ownerId },
      select: { id: true, name: true, price: true, description: true },
      orderBy: { id: "desc" },
    });
  },

  /* =========================
   *        GALERÍA (Media)
   * ========================= */
  async addMedia(ownerId: number, media: AddMediaDTO) {
    if (!media.url?.trim()) throw new Error("URL de media requerida");
    if (!["PHOTO", "VIDEO"].includes(media.type)) throw new Error("Tipo de media inválido");

    return prisma.media.create({
      data: {
        ownerId,
        url: media.url.trim(),
        type: media.type,
        caption: media.caption ?? null,
      },
      select: { id: true, ownerId: true, url: true, type: true, caption: true, createdAt: true },
    });
  },

  async listMedia(ownerId: number) {
    return prisma.media.findMany({
      where: { ownerId },
      select: { id: true, ownerId: true, url: true, type: true, caption: true, createdAt: true },
      orderBy: { id: "desc" },
    });
  },
};