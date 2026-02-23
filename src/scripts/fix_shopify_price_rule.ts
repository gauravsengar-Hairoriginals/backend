
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ShopifyService } from '../modules/integrations/shopify/shopify.service';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const shopifyService = app.get(ShopifyService);
    const configService = app.get(ConfigService);

    const configuredPriceRuleId = configService.get<string>('SHOPIFY_PRICE_RULE_ID'); // Note: ConfigService keys are usually lowercase if loaded from .env without transformation, but nest/config loads them as is. Let's check 'shopify.priceRuleId' if mapped or just 'SHOPIFY_PRICE_RULE_ID'. 
    // The service uses `this.configService.get<string>('shopify.priceRuleId')` in `shopify.service.ts` IF using `load` config. 
    // Wait, `shopify.service.ts` uses `this.configService.get<string>('shopify.shopUrl')`.
    // Let's see how config is loaded. It likely uses `@nestjs/config` with `load`.

    // Direct access to process.env is safest for this script
    const priceRuleId = process.env.SHOPIFY_PRICE_RULE_ID || '1577723855139';

    console.log(`Checking Price Rule ID: ${priceRuleId}`);

    try {
        const rule = await shopifyService.getPriceRule(priceRuleId);
        console.log(`Price Rule FOUND: ${rule.id} - ${rule.title}`);
    } catch (error) {
        console.log(`Price Rule NOT FOUND or Access Error: ${error.message}`);
        console.log('Creating new Price Rule...');

        try {
            const newRule = await shopifyService.createPriceRule({
                title: 'HO Referral Program',
                type: 'percentage',
                value: 20.0,
                validityDays: 3650, // 10 years
                oncePerCustomer: true,
                usageLimit: 1000000,
                minimumAmount: 500,
                startsAt: new Date()
            });
            console.log(`NEW Price Rule Created: ${newRule.id}`);
            console.log(`PLEASE UPDATE .env with: SHOPIFY_PRICE_RULE_ID=${newRule.id}`);
        } catch (createError) {
            console.error('Failed to create new Price Rule:', createError);
        }
    }

    await app.close();
}

bootstrap();
