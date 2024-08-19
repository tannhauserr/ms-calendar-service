import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export class ProductMiddleware {

    static validateSingleItemProduct = async (req, res, next) => {

        console.log("mira que llega aqui", req.body)
        const { id, productSkus } = req.body;


        if (!productSkus || productSkus.length === 0) {
            return res.status(400).json({ message: 'Product must have at least one item (ProductSku).' });
        }

        try {
            if (id) {
                // Si es una actualización, verificamos si el producto existe y si tiene más de un ítem
                const existingProduct = await prisma.product.findUnique({
                    where: { id },
                    include: { productSkus: true }
                });

                if (!existingProduct) {
                    return res.status(404).json({ message: 'Product not found.' });
                }

                if (existingProduct.productSkus.length > 1 || productSkus.length > 1) {
                    return res.status(400).json({ message: 'A product cannot have more than one item. Please update the existing item.' });
                }
            } else {
                // Si es una creación, verificamos que no haya productos con ítems existentes
                if (productSkus.length > 1 || productSkus.length === 0) {
                    return res.status(400).json({ message: 'A product must have only one item.' });
                }

            }

            next();
        } catch (error) {
            next(error);
        }
    };
}


