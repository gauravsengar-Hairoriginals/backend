import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ShiftCronService } from './shift-cron.service';
import { User } from '../users/entities/user.entity';
import { ExperienceCenter } from './entities/experience-center.entity';
import { CityRegion } from './entities/city-region.entity';
import { UsersModule } from '../users/users.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { SalonsModule } from '../salons/salons.module';
import { DiscountsModule } from '../discounts/discounts.module';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        TypeOrmModule.forFeature([User, ExperienceCenter, CityRegion]),
        UsersModule,
        ReferralsModule,
        SalonsModule,
        DiscountsModule,
    ],
    controllers: [AdminController],
    providers: [AdminService, ShiftCronService],
    exports: [AdminService],
})
export class AdminModule { }
