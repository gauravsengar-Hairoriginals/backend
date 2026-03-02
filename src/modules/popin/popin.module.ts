import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PopinEvent } from './entities/popin-event.entity';
import { PopinController } from './popin.controller';
import { PopinService } from './popin.service';
import { LeadsModule } from '../leads/leads.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([PopinEvent]),
        LeadsModule, // for LeadsService
    ],
    controllers: [PopinController],
    providers: [PopinService],
})
export class PopinModule { }
