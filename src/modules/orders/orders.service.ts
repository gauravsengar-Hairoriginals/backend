import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Order, OrderLineItem, OrderSyncStatus, FinancialStatus, FulfillmentStatus } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CustomersService } from '../customers/customers.service';
import { ShopifyService, ShopifyOrder } from '../integrations/shopify/shopify.service';

export interface OrdersQuery {
    customerId?: string;
    syncStatus?: OrderSyncStatus;
    financialStatus?: FinancialStatus;
    fulfillmentStatus?: FulfillmentStatus;
    page?: number;
    limit?: number;
}

@Injectable()
export class OrdersService {
    private readonly logger = new Logger(OrdersService.name);

    constructor(
        @InjectRepository(Order)
        private readonly orderRepository: Repository<Order>,
        @InjectRepository(OrderLineItem)
        private readonly lineItemRepository: Repository<OrderLineItem>,
        private readonly dataSource: DataSource,
        private readonly customersService: CustomersService,
        private readonly shopifyService: ShopifyService,
        @InjectQueue('order-sync') private readonly orderSyncQueue: Queue,
    ) { }

    /**
     * Create order locally and push to Shopify
     */
    async create(dto: CreateOrderDto): Promise<Order> {
        // Validate customer exists
        const customer = await this.customersService.findById(dto.customerId);
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        // Require shopifyId for creating orders in Shopify
        if (!customer.shopifyId) {
            throw new BadRequestException('Customer must be synced to Shopify first');
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Create local order first (PENDING_SYNC)
            const order = queryRunner.manager.create(Order, {
                customerId: dto.customerId,
                syncStatus: OrderSyncStatus.PENDING_SYNC,
                financialStatus: FinancialStatus.PENDING,
                fulfillmentStatus: FulfillmentStatus.UNFULFILLED,
                shippingAddress: dto.shippingAddress,
                billingAddress: dto.billingAddress,
                note: dto.note,
                tags: dto.tags,
                source: dto.source || 'api',
            });

            const savedOrder = await queryRunner.manager.save(order);

            // Create line items
            const lineItems: OrderLineItem[] = [];
            for (const item of dto.lineItems) {
                const lineItem = queryRunner.manager.create(OrderLineItem, {
                    orderId: savedOrder.id,
                    shopifyVariantId: item.variantId,
                    quantity: item.quantity,
                    price: item.price || 0,
                    properties: item.properties,
                    title: 'Pending', // Will be updated after Shopify sync
                    total: (item.price || 0) * item.quantity,
                });
                lineItems.push(await queryRunner.manager.save(lineItem));
            }

            savedOrder.lineItems = lineItems;

            await queryRunner.commitTransaction();

            // Push to Shopify asynchronously
            try {
                await this.pushToShopify(savedOrder, customer.shopifyId, dto);
            } catch (error) {
                // Queue for retry if immediate push fails
                await this.orderSyncQueue.add('sync-order', {
                    orderId: savedOrder.id,
                    customerShopifyId: customer.shopifyId,
                    dto,
                }, {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 5000 },
                });
                this.logger.warn(`Order ${savedOrder.id} queued for retry sync`);
            }

            return this.findById(savedOrder.id);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Push order to Shopify and update local record
     */
    private async pushToShopify(
        order: Order,
        customerShopifyId: string,
        dto: CreateOrderDto,
    ): Promise<void> {
        try {
            const shopifyOrder = await this.shopifyService.createOrder({
                customerId: customerShopifyId,
                lineItems: dto.lineItems.map((item) => ({
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

            await this.syncFromShopifyOrder(order.id, shopifyOrder);
            this.logger.log(`Order ${order.id} synced to Shopify as ${shopifyOrder.name}`);
        } catch (error) {
            // Mark as failed
            await this.orderRepository.update(order.id, {
                syncStatus: OrderSyncStatus.FAILED,
                syncError: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Update local order with Shopify response
     */
    async syncFromShopifyOrder(orderId: string, shopifyOrder: ShopifyOrder): Promise<Order> {
        const order = await this.findById(orderId);

        order.shopifyId = shopifyOrder.id.toString();
        order.orderNumber = shopifyOrder.name;
        order.syncStatus = OrderSyncStatus.SYNCED;
        order.syncedAt = new Date();
        order.syncError = undefined as any;

        // Pricing from Shopify
        order.subtotal = parseFloat(shopifyOrder.subtotal_price);
        order.discountTotal = parseFloat(shopifyOrder.total_discounts);
        order.taxTotal = parseFloat(shopifyOrder.total_tax);
        order.shippingTotal = parseFloat(shopifyOrder.total_shipping_price_set?.shop_money?.amount || '0');
        order.total = parseFloat(shopifyOrder.total_price);
        order.currency = shopifyOrder.currency;

        // Discounts
        order.discountCodes = shopifyOrder.discount_codes?.map((dc) => ({
            code: dc.code,
            amount: dc.amount,
            type: dc.type as 'percentage' | 'fixed_amount',
        }));
        order.discountApplications = shopifyOrder.discount_applications?.map((da) => ({
            type: da.type,
            value: da.value,
            valueType: da.value_type as 'percentage' | 'fixed_amount',
            allocationMethod: da.allocation_method,
            targetSelection: da.target_selection,
            title: da.title,
            description: da.description || undefined,
        }));

        // Financial/Fulfillment status
        order.financialStatus = this.mapFinancialStatus(shopifyOrder.financial_status);
        if (shopifyOrder.fulfillment_status) {
            order.fulfillmentStatus = this.mapFulfillmentStatus(shopifyOrder.fulfillment_status);
        }

        // Addresses
        if (shopifyOrder.shipping_address) {
            order.shippingAddress = {
                firstName: shopifyOrder.shipping_address.first_name || undefined,
                lastName: shopifyOrder.shipping_address.last_name || undefined,
                address1: shopifyOrder.shipping_address.address1 || undefined,
                address2: shopifyOrder.shipping_address.address2 || undefined,
                city: shopifyOrder.shipping_address.city || undefined,
                state: shopifyOrder.shipping_address.province || undefined,
                pincode: shopifyOrder.shipping_address.zip || undefined,
                country: shopifyOrder.shipping_address.country || undefined,
                phone: shopifyOrder.shipping_address.phone || undefined,
            };
        }

        await this.orderRepository.save(order);

        // Update line items with Shopify data
        for (const shopifyItem of shopifyOrder.line_items) {
            const lineItem = order.lineItems.find(
                (li) => li.shopifyVariantId === shopifyItem.variant_id.toString(),
            );
            if (lineItem) {
                lineItem.shopifyLineItemId = shopifyItem.id.toString();
                lineItem.shopifyProductId = shopifyItem.product_id.toString();
                lineItem.title = shopifyItem.title;
                lineItem.variantTitle = shopifyItem.variant_title || '';
                lineItem.sku = shopifyItem.sku || '';
                lineItem.price = parseFloat(shopifyItem.price);
                lineItem.totalDiscount = parseFloat(shopifyItem.total_discount);
                lineItem.total = lineItem.price * lineItem.quantity - lineItem.totalDiscount;
                await this.lineItemRepository.save(lineItem);
            }
        }

        return this.findById(orderId);
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

    private mapFulfillmentStatus(status: string): FulfillmentStatus {
        const mapping: Record<string, FulfillmentStatus> = {
            unfulfilled: FulfillmentStatus.UNFULFILLED,
            partial: FulfillmentStatus.PARTIAL,
            fulfilled: FulfillmentStatus.FULFILLED,
        };
        return mapping[status] || FulfillmentStatus.UNFULFILLED;
    }

    async findAll(query: OrdersQuery = {}): Promise<{ orders: Order[]; total: number }> {
        const { customerId, syncStatus, financialStatus, fulfillmentStatus, page = 1, limit = 20 } = query;

        const qb = this.orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.lineItems', 'lineItems')
            .leftJoinAndSelect('order.customer', 'customer');

        if (customerId) {
            qb.andWhere('order.customerId = :customerId', { customerId });
        }

        if (syncStatus) {
            qb.andWhere('order.syncStatus = :syncStatus', { syncStatus });
        }

        if (financialStatus) {
            qb.andWhere('order.financialStatus = :financialStatus', { financialStatus });
        }

        if (fulfillmentStatus) {
            qb.andWhere('order.fulfillmentStatus = :fulfillmentStatus', { fulfillmentStatus });
        }

        qb.orderBy('order.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        const [orders, total] = await qb.getManyAndCount();
        return { orders, total };
    }

    async findById(id: string): Promise<Order> {
        const order = await this.orderRepository.findOne({
            where: { id },
            relations: ['lineItems', 'customer'],
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        return order;
    }

    async retrySync(id: string): Promise<Order> {
        const order = await this.findById(id);

        if (order.syncStatus !== OrderSyncStatus.FAILED) {
            throw new BadRequestException('Only failed orders can be retried');
        }

        await this.orderSyncQueue.add('retry-sync', { orderId: id }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
        });

        return order;
    }
}
