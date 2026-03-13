import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadRecord } from './entities/lead-record.entity';
import { LeadHistory } from './entities/lead-history.entity';
import { LeadProduct } from './entities/lead-product.entity';
import { LeadProductOption } from './entities/lead-product-option.entity';
import { Customer } from '../customers/entities/customer.entity';
import { User } from '../users/entities/user.entity';
import { LeadCategorisationService } from '../../common/services/lead-categorisation.service';

@Module({
    imports: [TypeOrmModule.forFeature([LeadRecord, LeadHistory, LeadProduct, LeadProductOption, Customer, User])],
    controllers: [LeadsController],
    providers: [LeadsService, LeadCategorisationService],
    exports: [LeadsService, LeadCategorisationService],
})
export class LeadsModule { }

