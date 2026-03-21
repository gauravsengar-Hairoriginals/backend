import { Controller, Post, Req, Res, HttpCode, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ShopifyService } from './shopify.service';

@ApiTags('Shopify')
@Controller('api/v1/shopify')
export class ShopifyController {
    private readonly logger = new Logger(ShopifyController.name);

    constructor(private readonly shopifyService: ShopifyService) {}

    /**
     * POST /api/v1/shopify/webhook
     *
     * Public endpoint — called by Shopify for:
     *   - checkouts/create  (user reaches checkout page, enters email)
     *   - checkouts/update  (cart updated before completing)
     *
     * Register in Shopify Admin → Settings → Notifications → Webhooks:
     *   Topic: "Checkout creation" & "Checkout update"
     *   URL:   https://hairoriginals4u.com/api/v1/shopify/webhook
     */
    @Post('webhook')
    @HttpCode(200)
    async handleWebhook(@Req() req: any, @Res() res: any) {
        const typedReq = req as Request;
        const typedRes = res as Response;

        const topic    = (typedReq.headers['x-shopify-topic'] as string) || '';
        const hmac     = (typedReq.headers['x-shopify-hmac-sha256'] as string) || '';
        // rawBody is a Buffer set by our dedicated middleware in main.ts
        const rawBuf   = (typedReq as any).rawBody;
        const rawBody  = Buffer.isBuffer(rawBuf)
            ? rawBuf.toString('utf8')
            : (typeof rawBuf === 'string' ? rawBuf : JSON.stringify(typedReq.body ?? {}));

        this.logger.log(`[SHOPIFY-WEBHOOK] topic="${topic}" rawBodyLen=${rawBody.length} hmac="${hmac?.slice(0, 8)}..."`);

        // 1. Verify HMAC
        const valid = this.shopifyService.verifyHmac(rawBody, hmac);
        if (!valid) {
            this.logger.warn('[SHOPIFY-WEBHOOK] ❌ HMAC verification failed — rejecting');
            return typedRes.status(401).json({ error: 'Unauthorized' });
        }

        // 2. Always respond 200 immediately (Shopify requires < 5s response)
        typedRes.status(200).json({ received: true });

        // 3. Process async so we don't block the response
        const body = typeof typedReq.body === 'string' ? JSON.parse(rawBody) : typedReq.body;

        if (topic === 'orders/create') {
            this.shopifyService.handleOrderCreated(body).catch((err) => {
                this.logger.error(`[SHOPIFY-WEBHOOK] orders/create async error: ${err.message}`);
            });
        } else if (topic.startsWith('checkouts/')) {
            this.shopifyService.handleAbandonedCart(body, topic).catch((err) => {
                this.logger.error(`[SHOPIFY-WEBHOOK] ${topic} async error: ${err.message}`);
            });
        } else {
            this.logger.log(`[SHOPIFY-WEBHOOK] Unhandled topic "${topic}" — ignoring`);
        }
    }
}
