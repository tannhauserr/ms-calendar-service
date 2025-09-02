// controllers/category/public-category.controller.ts
import prisma from "../../lib/prisma";
import { CategoryService } from "../../services/@database/category/category.service";

export class PublicCategoryController {
    private categoryService: CategoryService;

    constructor() {
        this.categoryService = new CategoryService();
    }

    /**
     * Catálogo público: categorías con sus servicios y los userIds asignados.
     */
    publicGetCatalogByCodeWorkspaceAndCodeCompany = async (req, res) => {
        try {
            const { idWorkspace, idCompany } = req.public;

            const item = await this.categoryService.getCategoriesWithServicesAndUsers(
                idWorkspace,
                idCompany
            );

            if (!item) {
                return res.status(404).json({ ok: false, error: "Item not found" });
            }

            res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=30");
            return res.status(200).json({ ok: true, item });
        } catch (error: any) {
            return res.status(500).json({ ok: false, error: error?.message || "Internal server error" });
        }
    };
}
