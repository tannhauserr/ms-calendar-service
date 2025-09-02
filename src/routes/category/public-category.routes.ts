// routes/category/public-category.routes.ts
import express from "express";
import z from "zod";
import { PublicCategoryController } from "../../controllers/category/public-category.controller";
import { publicGuardBody } from "../../middlewares/public/publicGuard";

const router = express.Router();
const controller = new PublicCategoryController();

export const uuidSchema = z.string().min(8).max(64);

export const querySchema = z.object({
    idWorkspace: uuidSchema,
    idCompany: uuidSchema,
});

// Nuevo endpoint: catálogo de categorías/servicios
router.post(
    "/categories/workspace-catalog-by-code",
    [publicGuardBody({ schema: querySchema })],
    controller.publicGetCatalogByCodeWorkspaceAndCodeCompany
);

module.exports = router;
