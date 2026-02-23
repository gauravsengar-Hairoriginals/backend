import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { SalonsModule } from '../salons/salons.module';
import { DiscountsModule } from '../discounts/discounts.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([User]),
        UsersModule,
        ReferralsModule,
        SalonsModule,
        DiscountsModule,
    ],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule { }
