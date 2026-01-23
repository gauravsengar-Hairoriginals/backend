import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductStatus } from '../entities/product.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { ShopifyService, ShopifyProduct } from '../../integrations/shopify/shopify.service';

@Injectable()
export class ProductSyncService {
    private readonly logger = new Logger(ProductSyncService.name);

    constructor(
        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
        @InjectRepository(ProductVariant)
        private readonly variantRepository: Repository<ProductVariant>,
        private readonly shopifyService: ShopifyService,
    ) { }

    async syncAllProducts(): Promise<{ synced: number; errors: number }> {
        this.logger.log('Starting full product sync from Shopify');
        let synced = 0;
        let errors = 0;

        try {
            const shopifyProducts = await this.shopifyService.fetchAllProducts();

            for (const shopifyProduct of shopifyProducts) {
                try {
                    await this.syncProduct(shopifyProduct);
                    synced++;
                } catch (error) {
                    this.logger.error(`Failed to sync product ${shopifyProduct.id}:`, error);
                    errors++;
                }
            }

            this.logger.log(`Sync complete: ${synced} synced, ${errors} errors`);
        } catch (error) {
            this.logger.error('Full sync failed:', error);
            throw error;
        }

        return { synced, errors };
    }

    async syncProduct(shopifyProduct: ShopifyProduct): Promise<Product> {
        const shopifyId = shopifyProduct.id.toString();

        // Find existing product or create new
        let product = await this.productRepository.findOne({
            where: { shopifyId },
            relations: ['variants'],
        });

        if (!product) {
            product = new Product();
            product.shopifyId = shopifyId;
        }

        // Map Shopify data to our entity
        product.title = shopifyProduct.title;
        product.description = shopifyProduct.body_html;
        product.handle = shopifyProduct.handle;
        product.productType = shopifyProduct.product_type;
        product.vendor = shopifyProduct.vendor;
        product.status = this.mapStatus(shopifyProduct.status);
        product.tags = shopifyProduct.tags ? shopifyProduct.tags.split(', ').filter(Boolean) : [];
        product.images = shopifyProduct.images?.map((img) => ({
            shopifyId: img.id.toString(),
            src: img.src,
            alt: img.alt,
            position: img.position,
            width: img.width,
            height: img.height,
        })) || [];
        product.options = shopifyProduct.options?.map((opt) => ({
            name: opt.name,
            values: opt.values,
        })) || [];

        // SEO fields
        product.seoTitle = shopifyProduct.metafields_global_title_tag || null as any;
        product.seoDescription = shopifyProduct.metafields_global_description_tag || null as any;

        // Metafields
        product.metafields = shopifyProduct.metafields?.map((mf) => ({
            namespace: mf.namespace,
            key: mf.key,
            value: mf.value,
            type: mf.type,
        })) || [];

        // Videos from media
        product.videos = shopifyProduct.media
            ?.filter((m) => m.media_type === 'VIDEO' || m.media_type === 'EXTERNAL_VIDEO')
            .map((m) => ({
                shopifyId: m.id.toString(),
                src: m.src || '',
                alt: m.alt,
                position: m.position,
            })) || [];

        // Extract hair-specific fields from metafields
        if (shopifyProduct.metafields) {
            for (const mf of shopifyProduct.metafields) {
                if (mf.key === 'hair_color') product.hairColor = mf.value;
                if (mf.key === 'hair_length') product.hairLength = mf.value;
                if (mf.key === 'hair_weight') product.hairWeight = mf.value;
                if (mf.key === 'hair_texture') product.hairTexture = mf.value;
                if (mf.key === 'hair_material') product.hairMaterial = mf.value;
                if (mf.key === 'clip_count') product.clipCount = parseInt(mf.value, 10) || null as any;
                if (mf.key === 'base_type') product.baseType = mf.value;
            }
        }

        product.shopifyCreatedAt = new Date(shopifyProduct.created_at);
        product.shopifyUpdatedAt = new Date(shopifyProduct.updated_at);
        product.syncedAt = new Date();

        // Save product first
        const savedProduct = await this.productRepository.save(product);

        // Sync variants
        await this.syncVariants(savedProduct, shopifyProduct.variants || []);

        this.logger.debug(`Synced product: ${product.title} (${shopifyId})`);
        return savedProduct;
    }

    private async syncVariants(
        product: Product,
        shopifyVariants: ShopifyProduct['variants'],
    ): Promise<void> {
        const existingVariantIds = new Set<string>();

        for (const shopifyVariant of shopifyVariants) {
            const variantId = shopifyVariant.id.toString();
            existingVariantIds.add(variantId);

            let variant = await this.variantRepository.findOne({
                where: { shopifyVariantId: variantId },
            });

            if (!variant) {
                variant = new ProductVariant();
                variant.shopifyVariantId = variantId;
                variant.productId = product.id;
            }

            variant.title = shopifyVariant.title;
            variant.sku = shopifyVariant.sku;
            variant.price = parseFloat(shopifyVariant.price) || 0;
            variant.compareAtPrice = shopifyVariant.compare_at_price
                ? parseFloat(shopifyVariant.compare_at_price)
                : null as any;
            variant.inventoryQuantity = shopifyVariant.inventory_quantity || 0;
            variant.barcode = shopifyVariant.barcode || undefined as any;
            variant.weight = shopifyVariant.weight;
            variant.weightUnit = shopifyVariant.weight_unit;
            variant.option1 = shopifyVariant.option1 || undefined as any;
            variant.option2 = shopifyVariant.option2 || undefined as any;
            variant.option3 = shopifyVariant.option3 || undefined as any;
            variant.requiresShipping = shopifyVariant.requires_shipping;
            variant.taxable = shopifyVariant.taxable;

            await this.variantRepository.save(variant);
        }

        // Remove variants that no longer exist in Shopify
        if (product.variants) {
            for (const existingVariant of product.variants) {
                if (!existingVariantIds.has(existingVariant.shopifyVariantId)) {
                    await this.variantRepository.delete(existingVariant.id);
                }
            }
        }
    }

    async deleteProduct(shopifyId: string): Promise<void> {
        const product = await this.productRepository.findOne({
            where: { shopifyId },
        });

        if (product) {
            await this.productRepository.delete(product.id);
            this.logger.log(`Deleted product ${shopifyId}`);
        }
    }

    private mapStatus(shopifyStatus: string): ProductStatus {
        switch (shopifyStatus) {
            case 'active':
                return ProductStatus.ACTIVE;
            case 'draft':
                return ProductStatus.DRAFT;
            case 'archived':
                return ProductStatus.ARCHIVED;
            default:
                return ProductStatus.ACTIVE;
        }
    }
}
