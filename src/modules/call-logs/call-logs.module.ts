import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallLogsController } from './call-logs.controller';
import { CallLogsService } from './call-logs.service';
import { CallLog } from './entities/call-log.entity';
import { Customer } from '../customers/entities/customer.entity';
import { LeadRecord } from '../leads/entities/lead-record.entity';
import { CustomersModule } from '../customers/customers.module';
import { User } from '../users/entities/user.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([CallLog, Customer, LeadRecord, User]),
        CustomersModule,
    ],
    controllers: [CallLogsController],
    providers: [CallLogsService],
    exports: [CallLogsService],
})
export class CallLogsModule { }
