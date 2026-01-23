import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ShopifyService } from './shopify.service';
import { ShopifyWebhookController } from './shopify-webhook.controller';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'product-sync',
        }),
        BullModule.registerQueue({
            name: 'customer-sync',
        }),
        BullModule.registerQueue({
            name: 'order-sync',
        }),
    ],
    controllers: [ShopifyWebhookController],
    providers: [ShopifyService],
    exports: [ShopifyService],
})
export class ShopifyModule { }

