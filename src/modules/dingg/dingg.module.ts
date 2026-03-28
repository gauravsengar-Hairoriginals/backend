import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DinggIntegrationService } from './dingg.service';
import { DinggController } from './dingg.controller';
import { ExperienceCenter } from '../admin/entities/experience-center.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Order } from '../orders/entities/order.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([ExperienceCenter, Customer, Order]),
    ],
    controllers: [DinggController],
    providers: [DinggIntegrationService],
    exports: [DinggIntegrationService],  // exported so LeadsModule can use it
})
export class DinggModule {}
