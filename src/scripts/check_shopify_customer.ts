
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ShopifyService } from '../modules/integrations/shopify/shopify.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const shopifyService = app.get(ShopifyService);

    console.log('Testing Shopify Create Customer...');

    const timestamp = Date.now();
    const testEmail = `test.customer.${timestamp}@example.com`;
    const testPhone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;

    try {
        const customer = await shopifyService.createCustomer({
            firstName: 'Test',
            lastName: 'Customer',
            email: testEmail,
            phone: testPhone,
            verifiedEmail: true,
            acceptsMarketing: true,
            tags: ['test-customer'],
            note: 'Created via test script',
            address: {
                address1: '123 Test St',
                city: 'Test City',
                state: 'Karnataka',
                pincode: '560001',
                country: 'India'
            }
        });

        console.log('Customer Created Successfully!');
        console.log(`ID: ${customer.id}`);
        console.log(`Email: ${customer.email}`);
        console.log(`Phone: ${customer.phone}`);
    } catch (error) {
        console.error('Failed to create customer:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }

    await app.close();
}

bootstrap();
