import { Module } from '@nestjs/common';
import { ChannelierService } from './channelier.service';
import { ChannelierController } from './channelier.controller';

@Module({
    controllers: [ChannelierController],
    providers: [ChannelierService],
    exports: [ChannelierService], // export so other modules (e.g. LeadsModule) can use it
})
export class ChannelierModule {}
