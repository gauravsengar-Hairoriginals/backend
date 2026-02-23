import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';

import { FieldForceSalon } from './entities/field-force-salon.entity';

@Module({
    imports: [TypeOrmModule.forFeature([User, FieldForceSalon])],
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule { }
