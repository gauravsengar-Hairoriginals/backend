import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductSyncService } from './services/product-sync.service';
import { ProductSyncProcessor } from './processors/product-sync.processor';
import { Product } from './entities/product.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { ShopifyModule } from '../integrations/shopify/shopify.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Product, ProductVariant]),
        BullModule.registerQueue({
            name: 'product-sync',
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 5000,
                },
                removeOnComplete: 100,
                removeOnFail: 50,
            },
        }),
        ShopifyModule,
    ],
    controllers: [ProductsController],
    providers: [ProductsService, ProductSyncService, ProductSyncProcessor],
    exports: [ProductsService, ProductSyncService],
})
export class ProductsModule { }
