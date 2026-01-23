import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Order, OrderLineItem } from './entities/order.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderSyncProcessor } from './processors/order-sync.processor';
import { CustomersModule } from '../customers/customers.module';
import { ShopifyModule } from '../integrations/shopify/shopify.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Order, OrderLineItem]),
        BullModule.registerQueue({ name: 'order-sync' }),
        CustomersModule,
        ShopifyModule,
        forwardRef(() => DiscountsModule),
        forwardRef(() => ReferralsModule),
    ],
    controllers: [OrdersController],
    providers: [OrdersService, OrderSyncProcessor],
    exports: [OrdersService],
})
export class OrdersModule { }

