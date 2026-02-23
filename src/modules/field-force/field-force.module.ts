import { Module } from '@nestjs/common';
import { FieldForceController } from './field-force.controller';
import { SalonsModule } from '../salons/salons.module';
import { UsersModule } from '../users/users.module';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
    imports: [SalonsModule, UsersModule, ReferralsModule],
    controllers: [FieldForceController],
})
export class FieldForceModule { }
