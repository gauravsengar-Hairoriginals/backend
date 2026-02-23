import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalonsService } from './salons.service';
import { SalonsController } from './salons.controller';
import { Salon } from './entities/salon.entity';
import { SalonPhoto } from './entities/salon-photo.entity';
import { User } from '../users/entities/user.entity';
import { FieldForceSalon } from '../users/entities/field-force-salon.entity';
import { UploadService } from './upload.service';

@Module({
    imports: [TypeOrmModule.forFeature([Salon, SalonPhoto, User, FieldForceSalon])],
    controllers: [SalonsController],
    providers: [SalonsService, UploadService],
    exports: [SalonsService, UploadService],
})
export class SalonsModule { }
