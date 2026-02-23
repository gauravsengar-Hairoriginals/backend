import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProfileService } from './modules/profile/profile.service';
import { UsersService } from './modules/users/users.service';
import { SalonsService } from './modules/salons/salons.service';
import { UserRole } from './modules/users/enums/user-role.enum';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const profileService = app.get(ProfileService);
    const usersService = app.get(UsersService);
    const salonsService = app.get(SalonsService);

    console.log('--- Starting Salon Roles Verification ---');

    // 1. Create a dummy stylist
    const stylistPhone = '9999999999';
    let stylist = await usersService.findByPhone(stylistPhone);
    if (!stylist) {
        console.log('Creating dummy stylist...');
        const hashedPassword = await bcrypt.hash('password', 10);
        stylist = await usersService.create({
            name: 'Test Stylist',
            phone: stylistPhone,
            role: UserRole.STYLIST,
            passwordHash: hashedPassword,
        });
    } else {
        console.log('Dummy stylist already exists.');
    }

    // 2. Define Salon & Role Details
    const ownerPhone = '8888888888';
    const managerPhone = '7777777777';
    const salonName = 'Test Auto Salon';

    // Cleanup potentially existing test users/salon to ensure fresh test
    const existingOwner = await usersService.findByPhone(ownerPhone);
    if (existingOwner) console.log('Warning: Owner already exists:', existingOwner.id);

    // 3. Update Stylist Profile to trigger creation
    console.log('Updating stylist profile with salon details...');
    await profileService.updateStylistProfile(stylist.id, {
        salonName: salonName,
        salonAddress: '123 Test St',
        salonCity: 'Test City',
        salonState: 'Test State',
        salonPincode: '123456',
        ownerName: 'Test Owner', // DTO might still have it, but entity doesn't. Service handles it.
        ownerPhone: ownerPhone,
        managerName: 'Test Manager',
        managerPhone: managerPhone,
    });

    // 4. Verify Results
    console.log('Verifying results...');

    // Check Salon
    const salon = await salonsService.findByOwnerPhone(ownerPhone);
    if (!salon) {
        console.error('FAILED: Salon not created.');
    } else {
        console.log('SUCCESS: Salon created:', salon.name);

        // Check Owner
        const owner = await usersService.findByPhone(ownerPhone);
        if (owner && owner.role === UserRole.SALON_OWNER && owner.salonId === salon.id) {
            console.log('SUCCESS: Owner created and linked correctly.');
        } else {
            console.error('FAILED: Owner verification failed.', owner);
        }

        // Check Manager
        const manager = await usersService.findByPhone(managerPhone);
        if (manager && manager.role === UserRole.SALON_MANAGER && manager.salonId === salon.id) {
            console.log('SUCCESS: Manager created and linked correctly.');
        } else {
            console.error('FAILED: Manager verification failed.', manager);
        }
    }

    await app.close();
}

bootstrap();
