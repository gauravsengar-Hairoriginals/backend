import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import * as crypto from 'crypto';
import { LeadsService } from '../leads/leads.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class ShopifyService {
    private readonly logger = new Logger(ShopifyService.name);

    constructor(
        private readonly leadsService: LeadsService,
        @Inject(forwardRef(() => OrdersService))
        private readonly ordersService: OrdersService,
    ) { }

    /**
     * Verify Shopify HMAC signature on incoming webhooks.
     * If SHOPIFY_WEBHOOK_SECRET is not set, verification is skipped (dev mode).
     */
    verifyHmac(rawBody: string, hmacHeader: string): boolean {
        const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
        if (!secret) {
            this.logger.warn('[SHOPIFY] SHOPIFY_WEBHOOK_SECRET not set — skipping HMAC verification');
            return true;
        }
        const digest = crypto
            .createHmac('sha256', secret)
            .update(rawBody, 'utf8')
            .digest('base64');
        return digest === hmacHeader;
    }

    /**
     * Main handler for checkouts/create and checkouts/update events.
     * Maps the Shopify checkout payload to a lead and ingests it.
     */
    async handleAbandonedCart(
        body: any,
        topic: string,
    ): Promise<{ success: boolean; leadId?: string; skipped?: boolean; error?: string }> {
        this.logger.log(`[SHOPIFY] Received webhook topic="${topic}" checkout_id="${body?.id}"`);

        if (!body || !body.id) {
            return { success: false, error: 'Empty or invalid checkout payload' };
        }

        // Only care about checkout topics
        if (!topic?.startsWith('checkouts/')) {
            this.logger.log(`[SHOPIFY] Ignoring topic "${topic}"`);
            return { success: true, skipped: true };
        }

        // Extract fields
        const checkoutId = String(body.id);
        const email = body.email || '';
        const phone = this.normalizePhone(body.phone || body.billing_address?.phone || '');
        const billingAddr = body.billing_address || {};
        const name = billingAddr.name || body.customer?.first_name
            ? [body.customer?.first_name, body.customer?.last_name].filter(Boolean).join(' ')
            : billingAddr.name || '';
        const city = billingAddr.city || '';
        const pincode = billingAddr.zip || '';
        const address = [billingAddr.address1, billingAddr.address2].filter(Boolean).join(', ');

        const lineItems: any[] = body.line_items ?? [];
        const preferredProducts = lineItems.map((i: any) => i.title || i.name).filter(Boolean);

        // Parse UTMs from landing_site URL
        const utm = this.parseUtms(body.landing_site || body.referring_site || '');

        if (!phone && !email) {
            this.logger.warn(`[SHOPIFY] No phone or email in checkout ${checkoutId} — skipping`);
            return { success: false, error: 'No contact info in checkout' };
        }

        // Deduplicate: if a lead was already created for this checkout, skip
        // We store checkout_id inside specificDetails — check via service
        const existing = await this.leadsService.findBySpecificDetail('checkout_id', checkoutId);
        if (existing) {
            this.logger.log(`[SHOPIFY] Duplicate checkout ${checkoutId} — skipping`);
            return { success: true, leadId: existing.id, skipped: true };
        }

        try {
            const lead = await this.leadsService.create({
                name: name || 'Unknown',
                phone: phone || '',
                city,
                address,
                pincode,
                leadCategory: "WEBSITE",
                source: 'shopify_abandoned_cart',
                pageType: topic === 'checkouts/create' ? 'abandoned_cart_create' : 'abandoned_cart_update',
                preferredProducts: preferredProducts.length ? preferredProducts : undefined,
                utm_source: utm.utm_source,
                utm_medium: utm.utm_medium,
                utm_campaign: utm.utm_campaign,
                utm_term: utm.utm_term,
                utm_content: utm.utm_content,
                specificDetails: {
                    checkout_id: checkoutId,
                    email,                               // stored here since DTO has no email field
                    cart_total: body.total_price,
                    cart_currency: body.currency,
                    line_items_count: lineItems.length,
                    abandoned_checkout_url: body.abandoned_checkout_url || '',
                    landing_site: body.landing_site || '',
                },
            });

            this.logger.log(`[SHOPIFY] Lead created id=${lead.id} for checkout ${checkoutId} name="${name}" phone="${phone}"`);
            return { success: true, leadId: lead.id };
        } catch (err: any) {
            this.logger.error(`[SHOPIFY] Failed to create lead for checkout ${checkoutId}: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // ── Order Creation ──────────────────────────────────────────────────────

    /**
     * Handle orders/create webhook from Shopify.
     * Delegates to OrdersService.syncFromShopifyOrder which already knows how to
     * persist an Order + line items from a Shopify order payload.
     */
    async handleOrderCreated(
        body: any,
    ): Promise<{ success: boolean; orderId?: string; skipped?: boolean; error?: string }> {
        const shopifyOrderId = String(body?.id ?? '');
        this.logger.log(`[SHOPIFY] orders/create shopifyOrderId="${shopifyOrderId}" name="${body?.name}"`);

        if (!shopifyOrderId) {
            return { success: false, error: 'Missing order id in payload' };
        }

        try {
            // Check if we already have this order (idempotency)
            const existing = await this.ordersService
                .findAll({ page: 1, limit: 1 })
                .then(r => r.orders.find(o => o.shopifyId === shopifyOrderId) ?? null)
                .catch(() => null);

            if (existing) {
                this.logger.log(`[SHOPIFY] Order already synced — shopifyId=${shopifyOrderId}, skipping`);
                return { success: true, orderId: existing.id, skipped: true };
            }

            // syncFromShopifyOrder expects an existing Order row — but for webhook-driven
            // creation we use a lazy-create pattern: create a stub Order first, then sync.
            // We leverage the queue-based createFromWebhook approach instead.
            const order = await this.ordersService.createFromWebhook(body);
            this.logger.log(`[SHOPIFY] Order created id=${order.id} shopifyId=${shopifyOrderId}`);
            return { success: true, orderId: order.id };
        } catch (err: any) {
            this.logger.error(`[SHOPIFY] Failed to create order for shopifyId=${shopifyOrderId}: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private normalizePhone(phone: string): string {
        if (!phone) return '';
        // Strip non-digits and leading country code
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
        return digits;
    }

    private parseUtms(url: string): Record<string, string> {
        try {
            const fullUrl = url.startsWith('http') ? url : `https://x.com${url}`;
            const params = new URL(fullUrl).searchParams;
            return {
                utm_source: params.get('utm_source') || '',
                utm_medium: params.get('utm_medium') || '',
                utm_campaign: params.get('utm_campaign') || '',
                utm_term: params.get('utm_term') || '',
                utm_content: params.get('utm_content') || '',
            };
        } catch {
            return { utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '', utm_content: '' };
        }
    }
}
