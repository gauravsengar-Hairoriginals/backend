import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdersService } from '../orders.service';
import { CustomersService } from '../../customers/customers.service';
import { ShopifyService, ShopifyOrder } from '../../integrations/shopify/shopify.service';
import { Order, OrderLineItem, OrderSyncStatus, FinancialStatus, FulfillmentStatus } from '../entities/order.entity';
import { DiscountsService } from '../../discounts/discounts.service';
import { DiscountStatus } from '../../discounts/entities/discount-code.entity';
import { ReferralsService } from '../../referrals/referrals.service';

@Processor('order-sync')
export class OrderSyncProcessor {
    private readonly logger = new Logger(OrderSyncProcessor.name);

    constructor(
        @InjectRepository(Order)
        private readonly orderRepository: Repository<Order>,
        @InjectRepository(OrderLineItem)
        private readonly lineItemRepository: Repository<OrderLineItem>,
        private readonly ordersService: OrdersService,
        private readonly customersService: CustomersService,
        private readonly shopifyService: ShopifyService,
        private readonly discountsService: DiscountsService,
        private readonly referralsService: ReferralsService,
    ) { }

    @Process('sync-order')
    async handleSyncOrder(job: Job<{ orderId: string; customerShopifyId: string; dto: any }>) {
        this.logger.log(`Processing order sync: ${job.data.orderId}`);

        const { orderId, customerShopifyId, dto } = job.data;

        try {
            const shopifyOrder = await this.shopifyService.createOrder({
                customerId: customerShopifyId,
                lineItems: dto.lineItems.map((item: any) => ({
                    variantId: item.variantId,
                    quantity: item.quantity,
                    price: item.price,
                    properties: item.properties,
                })),
                discountCodes: dto.discountCodes,
                shippingAddress: dto.shippingAddress,
                billingAddress: dto.billingAddress,
                note: dto.note,
                tags: dto.tags,
                sendReceipt: dto.sendReceipt,
            });

            await this.ordersService.syncFromShopifyOrder(orderId, shopifyOrder);
            this.logger.log(`Order ${orderId} synced successfully as ${shopifyOrder.name}`);
        } catch (error) {
            this.logger.error(`Failed to sync order ${orderId}:`, error);
            throw error;
        }
    }

    @Process('retry-sync')
    async handleRetrySync(job: Job<{ orderId: string }>) {
        this.logger.log(`Retrying order sync: ${job.data.orderId}`);

        const order = await this.ordersService.findById(job.data.orderId);
        const customer = await this.customersService.findById(order.customerId);

        if (!customer.shopifyId) {
            throw new Error('Customer not synced to Shopify');
        }

        // Reconstruct line items for retry
        const lineItems = order.lineItems.map((item) => ({
            variantId: item.shopifyVariantId,
            quantity: item.quantity,
            price: item.price,
        }));

        const shopifyOrder = await this.shopifyService.createOrder({
            customerId: customer.shopifyId,
            lineItems,
            shippingAddress: order.shippingAddress,
            billingAddress: order.billingAddress,
            note: order.note || undefined,
            tags: order.tags,
        });

        await this.ordersService.syncFromShopifyOrder(order.id, shopifyOrder);
        this.logger.log(`Order ${order.id} retry sync successful as ${shopifyOrder.name}`);
    }

    /**
     * Handle inbound order from Shopify webhook
     * Creates order locally and marks referrals as redeemed
     */
    @Process('sync-from-shopify')
    async handleSyncFromShopify(job: Job<{ shopifyOrder: ShopifyOrder }>) {
        const { shopifyOrder } = job.data;
        const shopifyId = shopifyOrder.id.toString();

        this.logger.log(`Processing inbound order from Shopify: ${shopifyOrder.name}`);

        // Check if order already exists (idempotency)
        const existingOrder = await this.orderRepository.findOne({
            where: { shopifyId },
        });

        if (existingOrder) {
            this.logger.log(`Order ${shopifyId} already exists, updating...`);
            await this.updateOrderFromShopify(existingOrder, shopifyOrder);
            return;
        }

        // Find or create customer
        let customer: { id: string } | null = null;
        if (shopifyOrder.customer?.id) {
            customer = await this.customersService.findByShopifyId(
                shopifyOrder.customer.id.toString(),
            );
        }

        // Create new order
        const order = this.orderRepository.create({
            shopifyId,
            orderNumber: shopifyOrder.name,
            customerId: customer?.id,
            syncStatus: OrderSyncStatus.SYNCED,
            syncedAt: new Date(),
            financialStatus: this.mapFinancialStatus(shopifyOrder.financial_status),
            fulfillmentStatus: this.mapFulfillmentStatus(shopifyOrder.fulfillment_status),
            subtotal: parseFloat(shopifyOrder.subtotal_price),
            discountTotal: parseFloat(shopifyOrder.total_discounts),
            taxTotal: parseFloat(shopifyOrder.total_tax),
            shippingTotal: parseFloat(shopifyOrder.total_shipping_price_set?.shop_money?.amount || '0'),
            total: parseFloat(shopifyOrder.total_price),
            currency: shopifyOrder.currency,
            discountCodes: shopifyOrder.discount_codes?.map((dc) => ({
                code: dc.code,
                amount: dc.amount,
                type: dc.type as 'percentage' | 'fixed_amount',
            })),
            note: shopifyOrder.note || undefined,
            tags: shopifyOrder.tags?.split(', ').filter(Boolean),
        });

        const savedOrder = await this.orderRepository.save(order);

        // Create line items
        for (const item of shopifyOrder.line_items) {
            const lineItem = this.lineItemRepository.create({
                orderId: savedOrder.id,
                shopifyLineItemId: item.id.toString(),
                shopifyProductId: item.product_id.toString(),
                shopifyVariantId: item.variant_id.toString(),
                title: item.title,
                variantTitle: item.variant_title || '',
                sku: item.sku || '',
                quantity: item.quantity,
                price: parseFloat(item.price),
                totalDiscount: parseFloat(item.total_discount),
                total: parseFloat(item.price) * item.quantity - parseFloat(item.total_discount),
            });
            await this.lineItemRepository.save(lineItem);
        }

        this.logger.log(`Created order ${savedOrder.id} from Shopify ${shopifyOrder.name}`);

        // Process discount codes → mark referrals as redeemed
        await this.processDiscountRedemption(savedOrder.id, shopifyOrder);
    }

    /**
     * Update existing order from Shopify webhook
     */
    @Process('update-from-shopify')
    async handleUpdateFromShopify(job: Job<{ shopifyOrder: ShopifyOrder }>) {
        const { shopifyOrder } = job.data;
        const shopifyId = shopifyOrder.id.toString();

        const existingOrder = await this.orderRepository.findOne({
            where: { shopifyId },
        });

        if (!existingOrder) {
            // Order doesn't exist, create it
            await this.handleSyncFromShopify({ data: { shopifyOrder } } as any);
            return;
        }

        await this.updateOrderFromShopify(existingOrder, shopifyOrder);
    }

    private async updateOrderFromShopify(order: Order, shopifyOrder: ShopifyOrder) {
        order.financialStatus = this.mapFinancialStatus(shopifyOrder.financial_status);
        order.fulfillmentStatus = this.mapFulfillmentStatus(shopifyOrder.fulfillment_status);
        order.total = parseFloat(shopifyOrder.total_price);
        order.discountTotal = parseFloat(shopifyOrder.total_discounts);

        // Update fulfillment info if available
        if (shopifyOrder.fulfillments?.length) {
            const fulfillment = shopifyOrder.fulfillments[0];
            order.trackingNumber = fulfillment.tracking_number ?? '';
            order.trackingUrl = fulfillment.tracking_url ?? '';
            order.carrier = fulfillment.tracking_company ?? '';
            order.fulfilledAt = new Date(fulfillment.created_at);
        }

        // Update cancellation info
        if (shopifyOrder.cancelled_at) {
            order.syncStatus = OrderSyncStatus.CANCELLED;
            order.cancelReason = shopifyOrder.cancel_reason ?? '';
            order.cancelledAt = new Date(shopifyOrder.cancelled_at);
        }

        await this.orderRepository.save(order);
        this.logger.log(`Updated order ${order.id} from Shopify`);

        // Process discount codes if order just got paid
        if (shopifyOrder.financial_status === 'paid') {
            await this.processDiscountRedemption(order.id, shopifyOrder);
        }
    }

    /**
     * Process discount code redemption - updates local discount and referrals
     */
    private async processDiscountRedemption(orderId: string, shopifyOrder: ShopifyOrder) {
        if (!shopifyOrder.discount_codes?.length) {
            return;
        }

        const orderAmount = parseFloat(shopifyOrder.total_price);

        for (const dc of shopifyOrder.discount_codes) {
            try {
                // Find discount code in our system
                const discount = await this.discountsService.findByCode(dc.code);

                // Update discount usage
                discount.usageCount = (discount.usageCount || 0) + 1;
                if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
                    discount.status = DiscountStatus.USED;
                }
                // Save via repository would need injection, using service pattern

                // Mark referral as redeemed
                const referral = await this.referralsService.markRedeemed(
                    discount.id,
                    orderId,
                    orderAmount,
                );

                if (referral) {
                    this.logger.log(
                        `Referral ${referral.id} marked as redeemed. Commission: ₹${referral.commissionAmount}`,
                    );
                }
            } catch (error) {
                // Discount code not from our system (e.g., created directly in Shopify)
                this.logger.debug(`Discount code ${dc.code} not found in HO-Backend`);
            }
        }
    }

    private mapFinancialStatus(status: string): FinancialStatus {
        const mapping: Record<string, FinancialStatus> = {
            pending: FinancialStatus.PENDING,
            authorized: FinancialStatus.AUTHORIZED,
            partially_paid: FinancialStatus.PARTIALLY_PAID,
            paid: FinancialStatus.PAID,
            partially_refunded: FinancialStatus.PARTIALLY_REFUNDED,
            refunded: FinancialStatus.REFUNDED,
            voided: FinancialStatus.VOIDED,
        };
        return mapping[status] || FinancialStatus.PENDING;
    }

    private mapFulfillmentStatus(status: string | null): FulfillmentStatus {
        if (!status) return FulfillmentStatus.UNFULFILLED;
        const mapping: Record<string, FulfillmentStatus> = {
            unfulfilled: FulfillmentStatus.UNFULFILLED,
            partial: FulfillmentStatus.PARTIAL,
            fulfilled: FulfillmentStatus.FULFILLED,
        };
        return mapping[status] || FulfillmentStatus.UNFULFILLED;
    }
}

