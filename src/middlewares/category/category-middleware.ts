import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { CategoryErrorCodes } from '../../models/error-codes/category-error-codes';
import prisma from '../../lib/prisma';

export class CategoryMiddleware {
    static async validateCategory(req: Request, res: Response, next: NextFunction) {
        const { name, description, slug, position, colorHex, idParentCategoryFk, idTagFk, subcategories } = req.body;

        try {
            // Validar que el nombre y el slug no estén vacíos
            if (!name || !slug) {
                return res.status(200).json({
                    code: CategoryErrorCodes.MISSING_SUBCATEGORY,
                    message: 'El nombre y el slug son obligatorios',
                    ok: false,

                });
            }

            // Validar si es una categoría principal
            // No es necesario en un principio
            // if (idParentCategoryFk === null && idTagFk === null && subcategories && subcategories.length === 0) {
            //     return res.status(200).json({
            //         code: CategoryErrorCodes.MISSING_SUBCATEGORY,
            //         message: 'Una categoría principal debe tener al menos una subcategoría',
            //         ok: false,

            //     });
            // }

            // Validar si es una subcategoría
            if (idParentCategoryFk && idTagFk === null) {
                // Verificar que la categoría padre exista
                const parentCategory = await prisma.category.findUnique({
                    where: { id: idParentCategoryFk },
                });

                if (!parentCategory) {
                    return res.status(200).json({
                        code: CategoryErrorCodes.MISSING_PARENT_CATEGORY,
                        message: 'La categoría padre especificada no existe',
                        ok: false,

                    });
                }
            }

            // Validar si es una categoría con tag
            if (idParentCategoryFk === null && idTagFk) {
                // Verificar que el tag exista
                const tag = await prisma.tag.findUnique({
                    where: { id: idTagFk },
                });

                if (!tag) {
                    return res.status(200).json({
                        code: CategoryErrorCodes.MISSING_TAG,
                        message: 'El tag especificado no existe',
                        ok: false,
                    });
                }
            }

            // Validar que las subcategorías no tengan otras subcategorías
            if (subcategories && subcategories.length > 0) {
                for (const sub of subcategories) {
                    const id = sub.id;
                    const subcategory = await prisma.category.findUnique({
                        where: { id: id },
                        include: { subcategories: true },
                    });

                    if (subcategory && subcategory.subcategories.length > 0) {
                        return res.status(200).json({
                            code: CategoryErrorCodes.SUBCATEGORY_HAS_SUBCATEGORIES,
                            message: `La subcategoría con ID ${id} ya tiene subcategorías asignadas`,
                            ok: false,
                        });
                    }
                }
            }


            next();
        } catch (error) {
            console.error('Error en CategoryMiddleware:', error);
            return res.status(500).json({
                code: 500,
                message: 'Error interno del servidor',
            });
        }
    }
}
