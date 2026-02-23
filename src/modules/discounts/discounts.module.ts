import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscountCode } from './entities/discount-code.entity';
import { PricingRule } from './entities/pricing-rule.entity';
import { DiscountsService } from './discounts.service';
import { DiscountsController } from './discounts.controller';
import { CustomersModule } from '../customers/customers.module';
import { ShopifyModule } from '../integrations/shopify/shopify.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([DiscountCode, PricingRule]),
        CustomersModule,
        ShopifyModule,
    ],
    controllers: [DiscountsController],
    providers: [DiscountsService],
    exports: [DiscountsService],
})
export class DiscountsModule { }
