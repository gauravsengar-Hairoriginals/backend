import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { ProductSyncService } from '../services/product-sync.service';
import { ShopifyService } from '../../integrations/shopify/shopify.service';

@Processor('product-sync')
export class ProductSyncProcessor {
    private readonly logger = new Logger(ProductSyncProcessor.name);

    constructor(
        private readonly productSyncService: ProductSyncService,
        private readonly shopifyService: ShopifyService,
    ) { }

    @Process('sync-product')
    async handleSyncProduct(job: Job<{ shopifyId: string; action: string; payload?: any }>) {
        this.logger.log(`Processing sync job for product ${job.data.shopifyId}`);

        try {
            if (job.data.payload) {
                // Use payload from webhook if available
                await this.productSyncService.syncProduct(job.data.payload);
            } else {
                // Fetch from Shopify API
                const product = await this.shopifyService.fetchProduct(job.data.shopifyId);
                if (product) {
                    await this.productSyncService.syncProduct(product);
                }
            }
            this.logger.log(`Successfully synced product ${job.data.shopifyId}`);
        } catch (error) {
            this.logger.error(`Failed to sync product ${job.data.shopifyId}:`, error);
            throw error; // This will trigger retry
        }
    }

    @Process('delete-product')
    async handleDeleteProduct(job: Job<{ shopifyId: string; action: string }>) {
        this.logger.log(`Processing delete job for product ${job.data.shopifyId}`);

        try {
            await this.productSyncService.deleteProduct(job.data.shopifyId);
            this.logger.log(`Successfully deleted product ${job.data.shopifyId}`);
        } catch (error) {
            this.logger.error(`Failed to delete product ${job.data.shopifyId}:`, error);
            throw error;
        }
    }

    @Process('full-sync')
    async handleFullSync(job: Job) {
        this.logger.log('Processing full product sync');

        try {
            const result = await this.productSyncService.syncAllProducts();
            this.logger.log(`Full sync complete: ${result.synced} synced, ${result.errors} errors`);
            return result;
        } catch (error) {
            this.logger.error('Full sync failed:', error);
            throw error;
        }
    }
}
