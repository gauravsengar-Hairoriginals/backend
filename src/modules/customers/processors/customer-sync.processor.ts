import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { CustomerSyncService } from '../services/customer-sync.service';
import { ShopifyService } from '../../integrations/shopify/shopify.service';

@Processor('customer-sync')
export class CustomerSyncProcessor {
    private readonly logger = new Logger(CustomerSyncProcessor.name);

    constructor(
        private readonly customerSyncService: CustomerSyncService,
        private readonly shopifyService: ShopifyService,
    ) { }

    @Process('sync-customer')
    async handleSyncCustomer(job: Job<{ shopifyId: string; payload?: any }>) {
        this.logger.log(`Processing sync job for customer ${job.data.shopifyId}`);

        try {
            if (job.data.payload) {
                await this.customerSyncService.syncCustomer(job.data.payload);
            } else {
                const customer = await this.shopifyService.fetchCustomer(job.data.shopifyId);
                if (customer) {
                    await this.customerSyncService.syncCustomer(customer);
                }
            }
            this.logger.log(`Successfully synced customer ${job.data.shopifyId}`);
        } catch (error) {
            this.logger.error(`Failed to sync customer ${job.data.shopifyId}:`, error);
            throw error;
        }
    }

    @Process('delete-customer')
    async handleDeleteCustomer(job: Job<{ shopifyId: string }>) {
        this.logger.log(`Processing delete job for customer ${job.data.shopifyId}`);

        try {
            await this.customerSyncService.deleteCustomer(job.data.shopifyId);
            this.logger.log(`Successfully deleted customer ${job.data.shopifyId}`);
        } catch (error) {
            this.logger.error(`Failed to delete customer ${job.data.shopifyId}:`, error);
            throw error;
        }
    }

    @Process('full-sync')
    async handleFullSync(job: Job<{ days?: number }>) {
        this.logger.log(`Processing full customer sync${job.data.days ? ` for last ${job.data.days} days` : ''}`);

        try {
            const result = await this.customerSyncService.syncAllCustomers(undefined, job.data.days);
            this.logger.log(`Full sync complete: ${result.synced} synced, ${result.errors} errors`);
            return result;
        } catch (error) {
            this.logger.error('Full sync failed:', error);
            throw error;
        }
    }
}
