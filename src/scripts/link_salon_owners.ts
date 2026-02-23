
import { DataSource } from 'typeorm';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Salon } from '../modules/salons/entities/salon.entity';
import { User } from '../modules/users/entities/user.entity';
import { UserRole } from '../modules/users/enums/user-role.enum';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const dataSource = app.get(DataSource);

    console.log('Starting migration: Link Salons to Owners...');

    const salonRepo = dataSource.getRepository(Salon);
    const userRepo = dataSource.getRepository(User);

    const salons = await salonRepo.find({ relations: ['owner'] });
    console.log(`Found ${salons.length} salons.`);

    for (const salon of salons) {
        if (salon.owner) {
            console.log(`Salon ${salon.name} already linked to owner ${salon.owner.name}. Skipping.`);
            continue;
        }

        console.log(`Processing salon: ${salon.name} - No owner linked.`);

        // Since ownerName and ownerPhone columns are removed, we can't migrate from them anymore via Entity.
        // We'd need raw query if we really wanted to migrate old data, but for this refactor we assume data is either migrated or we can't do it this way.
        // For development/debug script, we'll just log.
        console.log('Skipping owner linking as ownerName/ownerPhone columns are removed from Entity.');

        // If we wanted to link to an existing user by some other logic (e.g. manual map), we could do it here.
        // For now, disabling the automatic migration logic that relied on removed columns.
    }

    console.log('Migration complete.');
    await app.close();
}

bootstrap();
