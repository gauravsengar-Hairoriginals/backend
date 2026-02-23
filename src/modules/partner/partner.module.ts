
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';
import { Salon } from '../salons/entities/salon.entity';
import { Referral } from '../referrals/entities/referral.entity';
import { UsersModule } from '../users/users.module';
import { SalonsModule } from '../salons/salons.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Salon, Referral]),
        UsersModule,
        SalonsModule,
    ],
    controllers: [PartnerController],
    providers: [PartnerService],
})
export class PartnerModule { }
