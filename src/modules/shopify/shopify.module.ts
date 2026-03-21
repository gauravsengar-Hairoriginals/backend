import { Module, forwardRef } from '@nestjs/common';
import { ShopifyController } from './shopify.controller';
import { ShopifyService } from './shopify.service';
import { LeadsModule } from '../leads/leads.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
    imports: [LeadsModule, forwardRef(() => OrdersModule)],
    controllers: [ShopifyController],
    providers: [ShopifyService],
    exports: [ShopifyService],
})
export class ShopifyModule {}
