import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Referral } from './entities/referral.entity';
import { CommissionRule } from './entities/commission-rule.entity';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';
import { DiscountsModule } from '../discounts/discounts.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Referral, CommissionRule]),
        forwardRef(() => DiscountsModule),
    ],
    controllers: [ReferralsController],
    providers: [ReferralsService],
    exports: [ReferralsService],
})
export class ReferralsModule { }
