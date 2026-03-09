import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FbConfig } from './entities/fb-config.entity';
import { FbLeadForm } from './entities/fb-lead-form.entity';
import { FacebookController } from './facebook.controller';
import { FacebookService } from './facebook.service';
import { LeadsModule } from '../leads/leads.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([FbConfig, FbLeadForm]),
        LeadsModule,
    ],
    controllers: [FacebookController],
    providers: [FacebookService],
    exports: [FacebookService],
})
export class FacebookModule { }
