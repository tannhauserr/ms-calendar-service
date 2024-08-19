import { Category, ProductSku, ProductSkuImage, ProductTag } from "@prisma/client";

export type ProductFormType = "PUBLISHED" | "DRAFT" | "ARCHIVED";

export class ProductForm {
    id?: any;
    title?: any;
    idCategoryFk?: any;
    description?: any;
    slug?: any;
    productType?: ProductFormType;
    createdDate?: any;
    updatedDate?: any;
    deletedDate?: any;

    nameCategory?: any;

    id_PS?: any;
    price_PS?: any;
    inStock_PS?: any;
    sku_PS?: any;

    title_Meta?: any;
    description_Meta?: any;
    keywords_Meta?: any;
    productSkuImages?: ProductSkuImage[];
    category?: Category;
    productTags?: ProductTag[];
    productSkus?: ProductSku[];

    // extra
    deletedTagList: number[] = [];
    deletedImageList: number[] = [];
}