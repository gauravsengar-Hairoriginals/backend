import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { Profile } from './entities/profile.entity';
import { UsersModule } from '../users/users.module';

import { SalonsModule } from '../salons/salons.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Profile]),
        UsersModule,
        SalonsModule,
    ],
    controllers: [ProfileController],
    providers: [ProfileService],
    exports: [ProfileService],
})
export class ProfileModule { }
