import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface ShopifyProduct {
    id: number;
    title: string;
    body_html: string;
    vendor: string;
    product_type: string;
    created_at: string;
    updated_at: string;
    handle: string;
    status: string;
    tags: string;
    images: { id: number; src: string; alt: string; position: number; width: number; height: number }[];
    options: { id: number; name: string; values: string[] }[];
    variants: ShopifyVariant[];
    // SEO (from metafields or GraphQL)
    metafields_global_title_tag?: string;
    metafields_global_description_tag?: string;
    // Metafields array (when fetched with ?fields=metafields)
    metafields?: ShopifyMetafield[];
    // Media (videos from GraphQL or REST media endpoint)
    media?: ShopifyMedia[];
}

export interface ShopifyMetafield {
    id: number;
    namespace: string;
    key: string;
    value: string;
    type: string;
}

export interface ShopifyMedia {
    id: number;
    media_type: string;
    src?: string;
    alt?: string;
    position: number;
}

export interface ShopifyVariant {
    id: number;
    product_id: number;
    title: string;
    sku: string;
    price: string;
    compare_at_price: string | null;
    inventory_quantity: number;
    barcode: string | null;
    weight: number;
    weight_unit: string;
    option1: string | null;
    option2: string | null;
    option3: string | null;
    requires_shipping: boolean;
    taxable: boolean;
    image_id: number | null;
}

@Injectable()
export class ShopifyService {
    private readonly logger = new Logger(ShopifyService.name);
    private readonly shopUrl: string;
    private readonly accessToken: string;
    private readonly webhookSecret: string;
    private readonly apiVersion: string;

    constructor(private readonly configService: ConfigService) {
        this.shopUrl = this.configService.get<string>('shopify.shopUrl') || '';
        this.accessToken = this.configService.get<string>('shopify.accessToken') || '';
        this.webhookSecret = this.configService.get<string>('shopify.webhookSecret') || '';
        this.apiVersion = this.configService.get<string>('shopify.apiVersion') || '2024-01';

        if (!this.shopUrl || !this.accessToken) {
            this.logger.warn('Shopify credentials not configured');
        }
    }

    private get baseUrl(): string {
        return `https://${this.shopUrl}/admin/api/${this.apiVersion}`;
    }

    private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': this.accessToken,
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            this.logger.error(`Shopify API error: ${response.status} - ${error}`);
            throw new Error(`Shopify API error: ${response.status}`);
        }

        return response.json();
    }

    async fetchAllProducts(): Promise<ShopifyProduct[]> {
        const allProducts: ShopifyProduct[] = [];
        let pageInfo: string | null = null;
        const limit = 250;

        do {
            const endpoint = pageInfo
                ? `/products.json?limit=${limit}&page_info=${pageInfo}`
                : `/products.json?limit=${limit}`;

            const response = await this.makeRequest<{ products: ShopifyProduct[] }>(endpoint);
            allProducts.push(...response.products);

            // Get next page info from Link header
            // Note: In production, you'd parse the Link header for pagination
            if (response.products.length < limit) {
                pageInfo = null;
            }

            this.logger.log(`Fetched ${allProducts.length} products so far`);

            // Rate limiting: Shopify allows 2 calls/second
            await new Promise((resolve) => setTimeout(resolve, 500));
        } while (pageInfo);

        return allProducts;
    }

    async fetchProduct(shopifyId: string): Promise<ShopifyProduct | null> {
        try {
            const response = await this.makeRequest<{ product: ShopifyProduct }>(
                `/products/${shopifyId}.json`,
            );
            return response.product;
        } catch (error) {
            this.logger.error(`Failed to fetch product ${shopifyId}:`, error);
            return null;
        }
    }

    // Customer methods
    async fetchAllCustomers(): Promise<ShopifyCustomer[]> {
        const allCustomers: ShopifyCustomer[] = [];
        let pageInfo: string | null = null;
        const limit = 250;

        do {
            const endpoint = pageInfo
                ? `/customers.json?limit=${limit}&page_info=${pageInfo}`
                : `/customers.json?limit=${limit}`;

            const response = await this.makeRequest<{ customers: ShopifyCustomer[] }>(endpoint);
            allCustomers.push(...response.customers);

            if (response.customers.length < limit) {
                pageInfo = null;
            }

            this.logger.log(`Fetched ${allCustomers.length} customers so far`);
            await new Promise((resolve) => setTimeout(resolve, 500));
        } while (pageInfo);

        return allCustomers;
    }

    async fetchCustomer(shopifyId: string): Promise<ShopifyCustomer | null> {
        try {
            const response = await this.makeRequest<{ customer: ShopifyCustomer }>(
                `/customers/${shopifyId}.json`,
            );
            return response.customer;
        } catch (error) {
            this.logger.error(`Failed to fetch customer ${shopifyId}:`, error);
            return null;
        }
    }

    async createCustomer(customerData: CreateShopifyCustomerInput): Promise<ShopifyCustomer> {
        const response = await this.makeRequest<{ customer: ShopifyCustomer }>(
            '/customers.json',
            {
                method: 'POST',
                body: JSON.stringify({
                    customer: {
                        first_name: customerData.firstName,
                        last_name: customerData.lastName,
                        email: customerData.email,
                        phone: customerData.phone,
                        verified_email: customerData.verifiedEmail ?? false,
                        accepts_marketing: customerData.acceptsMarketing ?? false,
                        tags: customerData.tags?.join(', '),
                        note: customerData.note,
                        addresses: customerData.address ? [{
                            address1: customerData.address.address1,
                            address2: customerData.address.address2,
                            city: customerData.address.city,
                            province: customerData.address.state,
                            zip: customerData.address.pincode,
                            country: customerData.address.country || 'India',
                            phone: customerData.phone,
                        }] : undefined,
                    },
                }),
            },
        );

        this.logger.log(`Created customer in Shopify: ${response.customer.id}`);
        return response.customer;
    }

    verifyWebhookSignature(body: string | Buffer, signature: string): boolean {
        if (!this.webhookSecret) {
            this.logger.warn('Webhook secret not configured, skipping verification');
            return true;
        }

        const computed = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(body)
            .digest('base64');

        return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
    }

    async createOrder(orderData: CreateShopifyOrderInput): Promise<ShopifyOrder> {
        const lineItems = orderData.lineItems.map((item) => ({
            variant_id: parseInt(item.variantId),
            quantity: item.quantity,
            price: item.price?.toString(),
            properties: item.properties,
        }));

        const payload: any = {
            order: {
                line_items: lineItems,
                customer: orderData.customerId
                    ? { id: parseInt(orderData.customerId) }
                    : undefined,
                email: orderData.email,
                phone: orderData.phone,
                discount_codes: orderData.discountCodes?.map((code) => ({ code, type: 'percentage' })),
                shipping_address: orderData.shippingAddress
                    ? {
                        first_name: orderData.shippingAddress.firstName,
                        last_name: orderData.shippingAddress.lastName,
                        address1: orderData.shippingAddress.address1,
                        address2: orderData.shippingAddress.address2,
                        city: orderData.shippingAddress.city,
                        province: orderData.shippingAddress.state,
                        zip: orderData.shippingAddress.pincode,
                        country: orderData.shippingAddress.country || 'India',
                        phone: orderData.shippingAddress.phone,
                    }
                    : undefined,
                billing_address: orderData.billingAddress
                    ? {
                        first_name: orderData.billingAddress.firstName,
                        last_name: orderData.billingAddress.lastName,
                        address1: orderData.billingAddress.address1,
                        address2: orderData.billingAddress.address2,
                        city: orderData.billingAddress.city,
                        province: orderData.billingAddress.state,
                        zip: orderData.billingAddress.pincode,
                        country: orderData.billingAddress.country || 'India',
                        phone: orderData.billingAddress.phone,
                    }
                    : undefined,
                note: orderData.note,
                tags: orderData.tags?.join(', '),
                send_receipt: orderData.sendReceipt ?? false,
                send_fulfillment_receipt: orderData.sendFulfillmentReceipt ?? false,
                financial_status: orderData.financialStatus || 'pending',
                inventory_behaviour: 'decrement_obeying_policy',
            },
        };

        const response = await this.makeRequest<{ order: ShopifyOrder }>(
            '/orders.json',
            {
                method: 'POST',
                body: JSON.stringify(payload),
            },
        );

        this.logger.log(`Created order in Shopify: ${response.order.id} (${response.order.name})`);
        return response.order;
    }

    async fetchOrder(shopifyId: string): Promise<ShopifyOrder | null> {
        try {
            const response = await this.makeRequest<{ order: ShopifyOrder }>(
                `/orders/${shopifyId}.json`,
            );
            return response.order;
        } catch (error) {
            this.logger.error(`Failed to fetch order ${shopifyId}:`, error);
            return null;
        }
    }

    async fetchAllOrders(sinceId?: string): Promise<ShopifyOrder[]> {
        const orders: ShopifyOrder[] = [];
        let pageInfo: string | null = null;

        do {
            const params = new URLSearchParams({
                limit: '250',
                status: 'any',
            });

            if (sinceId && !pageInfo) {
                params.append('since_id', sinceId);
            }

            const url = pageInfo
                ? `/orders.json?${pageInfo}`
                : `/orders.json?${params.toString()}`;

            const response = await this.makeRequest<{ orders: ShopifyOrder[] }>(url);
            orders.push(...response.orders);

            pageInfo = null; // Would extract from Link header for pagination

        } while (pageInfo);

        this.logger.log(`Fetched ${orders.length} orders from Shopify`);
        return orders;
    }

    /**
     * Create a price rule (discount configuration) in Shopify
     */
    async createPriceRule(input: CreatePriceRuleInput): Promise<ShopifyPriceRule> {
        const startsAt = input.startsAt || new Date();
        const endsAt = input.validityDays
            ? new Date(startsAt.getTime() + input.validityDays * 24 * 60 * 60 * 1000)
            : input.endsAt;

        const payload: any = {
            price_rule: {
                title: input.title,
                target_type: input.productId ? 'line_item' : 'line_item',
                target_selection: input.productId ? 'entitled' : 'all',
                allocation_method: 'across',
                value_type: input.type,
                value: input.type === 'percentage' ? `-${input.value}` : `-${input.value}`,
                customer_selection: input.customerShopifyId ? 'prerequisite' : 'all',
                starts_at: startsAt.toISOString(),
                ends_at: endsAt ? endsAt.toISOString() : null,
                usage_limit: input.usageLimit || null,
                once_per_customer: input.oncePerCustomer ?? true,
            },
        };

        // Add customer prerequisite if specific customer
        if (input.customerShopifyId) {
            payload.price_rule.prerequisite_customer_ids = [parseInt(input.customerShopifyId)];
        }

        // Add product entitlement if specific product
        if (input.productId) {
            payload.price_rule.entitled_product_ids = [parseInt(input.productId)];
        }

        // Add minimum purchase requirement
        if (input.minimumAmount) {
            payload.price_rule.prerequisite_subtotal_range = {
                greater_than_or_equal_to: input.minimumAmount.toString(),
            };
        }

        const response = await this.makeRequest<{ price_rule: ShopifyPriceRule }>(
            '/price_rules.json',
            {
                method: 'POST',
                body: JSON.stringify(payload),
            },
        );

        this.logger.log(`Created price rule in Shopify: ${response.price_rule.id}`);
        return response.price_rule;
    }

    /**
     * Create a discount code for a price rule
     */
    async createDiscountCode(priceRuleId: string, code: string): Promise<ShopifyDiscountCodeResponse> {
        const response = await this.makeRequest<{ discount_code: ShopifyDiscountCodeResponse }>(
            `/price_rules/${priceRuleId}/discount_codes.json`,
            {
                method: 'POST',
                body: JSON.stringify({
                    discount_code: { code },
                }),
            },
        );

        this.logger.log(`Created discount code ${code} in Shopify`);
        return response.discount_code;
    }

    /**
     * Delete a price rule (and its discount codes)
     */
    async deletePriceRule(priceRuleId: string): Promise<void> {
        await this.makeRequest(`/price_rules/${priceRuleId}.json`, {
            method: 'DELETE',
        });
        this.logger.log(`Deleted price rule ${priceRuleId}`);
    }
}

export interface CreatePriceRuleInput {
    title: string;
    type: 'percentage' | 'fixed_amount';
    value: number;
    customerShopifyId?: string;
    productId?: string;
    startsAt?: Date;
    endsAt?: Date;
    validityDays?: number;
    usageLimit?: number;
    oncePerCustomer?: boolean;
    minimumAmount?: number;
}

export interface ShopifyPriceRule {
    id: number;
    title: string;
    value_type: string;
    value: string;
    customer_selection: string;
    target_type: string;
    target_selection: string;
    allocation_method: string;
    starts_at: string;
    ends_at: string | null;
    usage_limit: number | null;
    once_per_customer: boolean;
    created_at: string;
    updated_at: string;
}

export interface ShopifyDiscountCodeResponse {
    id: number;
    price_rule_id: number;
    code: string;
    usage_count: number;
    created_at: string;
    updated_at: string;
}

export interface CreateShopifyOrderInput {
    lineItems: {
        variantId: string;
        quantity: number;
        price?: number;
        properties?: Record<string, string>[];
    }[];
    customerId?: string;
    email?: string;
    phone?: string;
    discountCodes?: string[];
    shippingAddress?: {
        firstName?: string;
        lastName?: string;
        address1?: string;
        address2?: string;
        city?: string;
        state?: string;
        pincode?: string;
        country?: string;
        phone?: string;
    };
    billingAddress?: {
        firstName?: string;
        lastName?: string;
        address1?: string;
        address2?: string;
        city?: string;
        state?: string;
        pincode?: string;
        country?: string;
        phone?: string;
    };
    note?: string;
    tags?: string[];
    sendReceipt?: boolean;
    sendFulfillmentReceipt?: boolean;
    financialStatus?: string;
}

export interface CreateShopifyCustomerInput {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    verifiedEmail?: boolean;
    acceptsMarketing?: boolean;
    tags?: string[];
    note?: string;
    address?: {
        address1?: string;
        address2?: string;
        city?: string;
        state?: string;
        pincode?: string;
        country?: string;
    };
}

// Customer interface
export interface ShopifyCustomer {
    id: number;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    verified_email: boolean;
    accepts_marketing: boolean;
    created_at: string;
    updated_at: string;
    orders_count: number;
    total_spent: string;
    tags: string;
    note: string | null;
    addresses: ShopifyAddress[];
    default_address?: ShopifyAddress;
}

export interface ShopifyAddress {
    id: number;
    customer_id: number;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    zip: string | null;
    phone: string | null;
    name: string;
    province_code: string | null;
    country_code: string;
    country_name: string;
    default: boolean;
}

// Order interfaces
export interface ShopifyOrder {
    id: number;
    name: string;
    order_number: number;
    email: string | null;
    phone: string | null;
    created_at: string;
    updated_at: string;
    cancelled_at: string | null;
    closed_at: string | null;
    financial_status: string;
    fulfillment_status: string | null;
    currency: string;
    subtotal_price: string;
    total_discounts: string;
    total_tax: string;
    total_price: string;
    total_shipping_price_set: {
        shop_money: { amount: string; currency_code: string };
    };
    discount_codes: ShopifyDiscountCode[];
    discount_applications: ShopifyDiscountApplication[];
    line_items: ShopifyLineItem[];
    shipping_address: ShopifyOrderAddress | null;
    billing_address: ShopifyOrderAddress | null;
    customer: { id: number } | null;
    note: string | null;
    tags: string;
    cancel_reason: string | null;
    fulfillments: ShopifyFulfillment[];
}

export interface ShopifyDiscountCode {
    code: string;
    amount: string;
    type: string;
}

export interface ShopifyDiscountApplication {
    type: string;
    value: string;
    value_type: string;
    allocation_method: string;
    target_selection: string;
    title: string;
    description: string | null;
}

export interface ShopifyLineItem {
    id: number;
    product_id: number;
    variant_id: number;
    title: string;
    variant_title: string | null;
    sku: string | null;
    quantity: number;
    price: string;
    total_discount: string;
    properties: { name: string; value: string }[];
}

export interface ShopifyOrderAddress {
    first_name: string | null;
    last_name: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    zip: string | null;
    phone: string | null;
}

export interface ShopifyFulfillment {
    id: number;
    status: string;
    tracking_number: string | null;
    tracking_url: string | null;
    tracking_company: string | null;
    created_at: string;
}

