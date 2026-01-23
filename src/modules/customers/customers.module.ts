import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerSyncService } from './services/customer-sync.service';
import { CustomerSyncProcessor } from './processors/customer-sync.processor';
import { Customer } from './entities/customer.entity';
import { CustomerProfile } from './entities/customer-profile.entity';
import { ShopifyModule } from '../integrations/shopify/shopify.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Customer, CustomerProfile]),
        BullModule.registerQueue({
            name: 'customer-sync',
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
    controllers: [CustomersController],
    providers: [CustomersService, CustomerSyncService, CustomerSyncProcessor],
    exports: [CustomersService, CustomerSyncService],
})
export class CustomersModule { }
