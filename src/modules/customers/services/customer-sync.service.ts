import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { Customer, CustomerType } from '../entities/customer.entity';
import { ShopifyService, ShopifyCustomer } from '../../integrations/shopify/shopify.service';

export interface SyncResult {
    synced: number;
    skipped: number;
    errors: number;
    lastProcessedId?: string;
}

@Injectable()
export class CustomerSyncService {
    private readonly logger = new Logger(CustomerSyncService.name);

    constructor(
        @InjectRepository(Customer)
        private readonly customerRepository: Repository<Customer>,
        private readonly shopifyService: ShopifyService,
        private readonly dataSource: DataSource,
    ) { }

    /**
     * Full sync with checkpoint support for resumable operations
     * @param fromShopifyId - Resume from this Shopify ID (for failed syncs)
     */
    async syncAllCustomers(fromShopifyId?: string): Promise<SyncResult> {
        this.logger.log(`Starting full customer sync from Shopify${fromShopifyId ? ` (resuming from ${fromShopifyId})` : ''}`);

        const result: SyncResult = { synced: 0, skipped: 0, errors: 0 };
        let skipUntilFound = !!fromShopifyId;

        try {
            const shopifyCustomers = await this.shopifyService.fetchAllCustomers();

            for (const shopifyCustomer of shopifyCustomers) {
                const shopifyId = shopifyCustomer.id.toString();

                // Skip until we reach the checkpoint
                if (skipUntilFound) {
                    if (shopifyId === fromShopifyId) {
                        skipUntilFound = false;
                    } else {
                        result.skipped++;
                        continue;
                    }
                }

                try {
                    await this.syncCustomerWithTransaction(shopifyCustomer);
                    result.synced++;
                    result.lastProcessedId = shopifyId;
                } catch (error) {
                    this.logger.error(`Failed to sync customer ${shopifyId}:`, error);
                    result.errors++;
                    result.lastProcessedId = shopifyId;
                    // Continue with next customer instead of failing entire sync
                }
            }

            this.logger.log(`Sync complete: ${result.synced} synced, ${result.skipped} skipped, ${result.errors} errors`);
        } catch (error) {
            this.logger.error('Full sync failed:', error);
            throw error;
        }

        return result;
    }

    /**
     * Idempotent customer sync with transaction for atomicity
     * Safe to re-run - uses UPSERT pattern
     */
    async syncCustomerWithTransaction(shopifyCustomer: ShopifyCustomer): Promise<Customer> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const customer = await this.upsertCustomer(queryRunner, shopifyCustomer);
            await queryRunner.commitTransaction();
            this.logger.debug(`Synced customer: ${customer.name || customer.phone} (${shopifyCustomer.id})`);
            return customer;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Idempotent upsert - finds or creates customer, updates all fields
     * Matching priority: shopifyId > phone > email
     */
    private async upsertCustomer(queryRunner: QueryRunner, shopifyCustomer: ShopifyCustomer): Promise<Customer> {
        const shopifyId = shopifyCustomer.id.toString();
        const repo = queryRunner.manager.getRepository(Customer);

        // Priority-based matching to find existing customer
        let customer = await repo.findOne({ where: { shopifyId } });

        if (!customer && shopifyCustomer.phone) {
            // Find by phone, but only if they don't already have a different shopifyId
            customer = await repo.findOne({
                where: { phone: shopifyCustomer.phone },
            });
            // If found customer has different shopifyId, don't link (could be different Shopify customer)
            if (customer && customer.shopifyId && customer.shopifyId !== shopifyId) {
                this.logger.warn(`Phone ${shopifyCustomer.phone} exists with different shopifyId. Creating new record.`);
                customer = null;
            }
        }

        if (!customer && shopifyCustomer.email) {
            // Find by email, but only if they don't already have a different shopifyId
            customer = await repo.findOne({
                where: { email: shopifyCustomer.email },
            });
            if (customer && customer.shopifyId && customer.shopifyId !== shopifyId) {
                this.logger.warn(`Email ${shopifyCustomer.email} exists with different shopifyId. Creating new record.`);
                customer = null;
            }
        }

        // Ensure customer is never null after this point
        if (!customer) {
            customer = new Customer();
        }

        // Now customer is guaranteed to be non-null
        const c = customer; // TypeScript knows this is non-null

        // Map Shopify data (idempotent - same data = same result)
        c.shopifyId = shopifyId;
        c.email = shopifyCustomer.email || c.email;
        c.firstName = shopifyCustomer.first_name || c.firstName;
        c.lastName = shopifyCustomer.last_name || c.lastName;
        c.name = [shopifyCustomer.first_name, shopifyCustomer.last_name]
            .filter(Boolean)
            .join(' ') || c.name;

        // Track if this is a new customer
        const isNew = !c.id;

        // Phone is critical - only update if provided
        if (shopifyCustomer.phone) {
            c.phone = shopifyCustomer.phone;
        }

        c.isVerified = shopifyCustomer.verified_email;
        c.acceptsMarketing = shopifyCustomer.accepts_marketing;
        c.notes = shopifyCustomer.note || c.notes;
        c.tags = shopifyCustomer.tags ? shopifyCustomer.tags.split(', ').filter(Boolean) : c.tags || [];

        // Order summary
        c.totalOrders = shopifyCustomer.orders_count || 0;
        c.totalSpent = parseFloat(shopifyCustomer.total_spent) || 0;
        if (c.totalOrders > 0) {
            c.averageOrderValue = c.totalSpent / c.totalOrders;
        }

        // Customer type based on orders
        if (c.totalOrders === 0) {
            c.customerType = CustomerType.NEW;
        } else if (c.totalOrders >= 5 || c.totalSpent >= 50000) {
            c.customerType = CustomerType.VIP;
        } else {
            c.customerType = CustomerType.RETURNING;
        }

        // Address from default_address
        const defaultAddr = shopifyCustomer.default_address;
        if (defaultAddr) {
            c.addressLine1 = defaultAddr.address1 || c.addressLine1;
            c.addressLine2 = defaultAddr.address2 || c.addressLine2;
            c.city = defaultAddr.city || c.city;
            c.state = defaultAddr.province || c.state;
            c.pincode = defaultAddr.zip || c.pincode;
            c.country = defaultAddr.country || c.country || 'India';
        }

        // Timestamps
        if (isNew || !c.firstSeenAt) {
            c.firstSeenAt = new Date(shopifyCustomer.created_at);
        }
        c.lastActivityAt = new Date(shopifyCustomer.updated_at);
        c.lastActivityPlatform = 'shopify';
        c.syncedAt = new Date();

        return repo.save(c);
    }

    /**
     * Legacy method - wraps transaction method for backward compatibility
     */
    async syncCustomer(shopifyCustomer: ShopifyCustomer): Promise<Customer> {
        return this.syncCustomerWithTransaction(shopifyCustomer);
    }

    /**
     * Idempotent delete - safe to call multiple times
     */
    async deleteCustomer(shopifyId: string): Promise<void> {
        const result = await this.customerRepository.delete({ shopifyId });
        if (result.affected && result.affected > 0) {
            this.logger.log(`Deleted customer ${shopifyId}`);
        } else {
            this.logger.debug(`Customer ${shopifyId} not found (already deleted or never existed)`);
        }
    }
}

