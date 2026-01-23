import {
    Controller,
    Post,
    Body,
    Headers,
    Req,
    HttpCode,
    HttpStatus,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request } from 'express';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ShopifyService } from './shopify.service';

@ApiTags('Webhooks')
@Controller('webhooks/shopify')
export class ShopifyWebhookController {
    private readonly logger = new Logger(ShopifyWebhookController.name);

    constructor(
        private readonly shopifyService: ShopifyService,
        @InjectQueue('product-sync') private readonly productSyncQueue: Queue,
        @InjectQueue('customer-sync') private readonly customerSyncQueue: Queue,
        @InjectQueue('order-sync') private readonly orderSyncQueue: Queue,
    ) { }

    @Post('products')
    @HttpCode(HttpStatus.OK)
    @ApiExcludeEndpoint()
    async handleProductWebhook(
        @Req() req: Request & { rawBody?: Buffer },
        @Headers('x-shopify-topic') topic: string,
        @Headers('x-shopify-hmac-sha256') signature: string,
        @Body() body: any,
    ) {
        // Verify webhook signature
        const rawBody = req.rawBody?.toString() || JSON.stringify(body);
        if (!this.shopifyService.verifyWebhookSignature(rawBody, signature)) {
            this.logger.warn('Invalid webhook signature');
            throw new UnauthorizedException('Invalid webhook signature');
        }

        this.logger.log(`Received Shopify webhook: ${topic}`);

        const shopifyId = body.id?.toString();

        switch (topic) {
            case 'products/create':
            case 'products/update':
                await this.productSyncQueue.add('sync-product', {
                    shopifyId,
                    action: 'sync',
                    payload: body,
                });
                break;

            case 'products/delete':
                await this.productSyncQueue.add('delete-product', {
                    shopifyId,
                    action: 'delete',
                });
                break;

            default:
                this.logger.warn(`Unhandled webhook topic: ${topic}`);
        }

        return { received: true };
    }

    @Post('customers')
    @HttpCode(HttpStatus.OK)
    @ApiExcludeEndpoint()
    async handleCustomerWebhook(
        @Req() req: Request & { rawBody?: Buffer },
        @Headers('x-shopify-topic') topic: string,
        @Headers('x-shopify-hmac-sha256') signature: string,
        @Body() body: any,
    ) {
        const rawBody = req.rawBody?.toString() || JSON.stringify(body);
        if (!this.shopifyService.verifyWebhookSignature(rawBody, signature)) {
            this.logger.warn('Invalid webhook signature');
            throw new UnauthorizedException('Invalid webhook signature');
        }

        this.logger.log(`Received Shopify customer webhook: ${topic}`);

        const shopifyId = body.id?.toString();

        switch (topic) {
            case 'customers/create':
            case 'customers/update':
                await this.customerSyncQueue.add('sync-customer', {
                    shopifyId,
                    payload: body,
                });
                break;

            case 'customers/delete':
                await this.customerSyncQueue.add('delete-customer', {
                    shopifyId,
                });
                break;

            default:
                this.logger.warn(`Unhandled customer webhook topic: ${topic}`);
        }

        return { received: true };
    }

    @Post('orders')
    @HttpCode(HttpStatus.OK)
    @ApiExcludeEndpoint()
    async handleOrderWebhook(
        @Req() req: Request & { rawBody?: Buffer },
        @Headers('x-shopify-topic') topic: string,
        @Headers('x-shopify-hmac-sha256') signature: string,
        @Body() body: any,
    ) {
        const rawBody = req.rawBody?.toString() || JSON.stringify(body);
        if (!this.shopifyService.verifyWebhookSignature(rawBody, signature)) {
            this.logger.warn('Invalid webhook signature');
            throw new UnauthorizedException('Invalid webhook signature');
        }

        this.logger.log(`Received Shopify order webhook: ${topic}`);

        switch (topic) {
            case 'orders/create':
                await this.orderSyncQueue.add('sync-from-shopify', {
                    shopifyOrder: body,
                });
                break;

            case 'orders/updated':
            case 'orders/paid':
            case 'orders/fulfilled':
                await this.orderSyncQueue.add('update-from-shopify', {
                    shopifyOrder: body,
                });
                break;

            case 'orders/cancelled':
                await this.orderSyncQueue.add('update-from-shopify', {
                    shopifyOrder: body,
                });
                break;

            default:
                this.logger.warn(`Unhandled order webhook topic: ${topic}`);
        }

        return { received: true };
    }
}
