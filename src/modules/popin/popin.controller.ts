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
        // ── Validate API key ──────────────────────────────────────────────
        if (this.apiKey && this.apiKey !== '.' && apiKey !== this.apiKey) {
            this.logger.warn(`Invalid API key received: ${apiKey?.substring(0, 8)}...`);
            throw new UnauthorizedException('Invalid API key');
        }

        this.logger.log(`Received Popin webhook: ${dto.event} from ${dto.full_phone_number ?? dto.phone_number ?? 'unknown'}`);

        // ── Delegate to service (fast response) ──────────────────────────
        const result = await this.popinService.handleWebhook(dto, rawBody);

        return result;
    }
}
