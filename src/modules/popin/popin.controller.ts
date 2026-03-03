import {
    Controller,
    Post,
    Body,
    Headers,
    HttpCode,
    HttpStatus,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { PopinService } from './popin.service';
import { PopinWebhookDto } from './dto/popin-webhook.dto';

@ApiTags('webhooks')
@Controller('api/v1/webhooks/popin')
export class PopinController {
    private readonly logger = new Logger(PopinController.name);
    private readonly apiKey: string;

    constructor(
        private readonly popinService: PopinService,
        private readonly configService: ConfigService,
    ) {
        this.apiKey = this.configService.get<string>('POPIN_API_KEY', '');
    }

    /**
     * POST /api/v1/webhooks/popin
     * Public endpoint — no JWT auth. Validated via X-API-KEY header.
     * Popin sends webhook events here.
     */
    @Post()
    @HttpCode(HttpStatus.OK)
    async receiveWebhook(
        @Body() dto: PopinWebhookDto,
        @Body() rawBody: Record<string, any>,
        @Headers('x-api-key') apiKey?: string,
    ) {
        this.logger.log(`\n========== [POPIN WEBHOOK RECEIVED] ==========`);
        this.logger.log(`[POPIN] Timestamp: ${new Date().toISOString()}`);
        this.logger.log(`[POPIN] Event: ${dto.event}`);
        this.logger.log(`[POPIN] Phone: ${dto.full_phone_number ?? dto.phone_number ?? 'none'}`);
        this.logger.log(`[POPIN] User ID: ${dto.user_id ?? 'none'}`);
        this.logger.log(`[POPIN] Email: ${dto.email ?? dto.properties?.customer_email ?? 'none'}`);
        this.logger.log(`[POPIN] Customer Name: ${dto.properties?.customer_name ?? 'none'}`);
        this.logger.log(`[POPIN] Product: ${dto.properties?.product ?? 'none'}`);
        this.logger.log(`[POPIN] URL: ${dto.properties?.url ?? 'none'}`);
        this.logger.log(`[POPIN] Raw Body: ${JSON.stringify(rawBody)}`);

        // ── Validate API key ──────────────────────────────────────────────
        if (this.apiKey && this.apiKey !== '.' && apiKey !== this.apiKey) {
            this.logger.warn(`[POPIN] ❌ API key validation FAILED — received: "${apiKey?.substring(0, 8)}..." expected: "${this.apiKey.substring(0, 8)}..."`);
            throw new UnauthorizedException('Invalid API key');
        }
        this.logger.log(`[POPIN] ✅ API key validation passed`);

        // ── Delegate to service ──────────────────────────────────────────
        try {
            const result = await this.popinService.handleWebhook(dto, rawBody);
            this.logger.log(`[POPIN] ✅ Result: ${JSON.stringify(result)}`);
            this.logger.log(`========== [POPIN WEBHOOK COMPLETE] ==========\n`);
            return result;
        } catch (err: any) {
            this.logger.error(`[POPIN] ❌ FAILED: ${err.message}`, err.stack);
            this.logger.log(`========== [POPIN WEBHOOK FAILED] ==========\n`);
            return { received: false, error: err.message };
        }
    }
}
