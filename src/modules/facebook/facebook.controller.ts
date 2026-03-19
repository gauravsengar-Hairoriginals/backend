import {
    Controller,
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Query,
    Body,
    Param,
    Req,
    Res,
    UseGuards,
    HttpCode,
    UseInterceptors,
    UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
// Types imported separately — NOT used in decorated signatures to satisfy isolatedModules
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FacebookService } from './facebook.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Facebook')
@Controller('api/v1/facebook')
export class FacebookController {
    constructor(private readonly facebookService: FacebookService) { }

    // ── Webhook Verification (GET — public, called by Facebook) ───────────
    @Get('webhook')
    verifyWebhook(@Query() query: any, @Res() res: any) {
        const typedRes = res as Response;
        try {
            const challenge = this.facebookService.verifyWebhook(query);
            // Facebook expects the raw challenge string, not JSON
            return typedRes.status(200).send(challenge);
        } catch {
            return typedRes.status(403).send('Verification failed');
        }
    }

    // ── Webhook Handler (POST — public, called by Facebook native webhook) ──
    @Post('webhook')
    @HttpCode(200)
    async handleWebhook(@Req() req: any, @Body() body: any) {
        const typedReq = req as RawBodyRequest<Request>;
        const raw = typedReq.rawBody?.toString() ?? JSON.stringify(body);
        console.log('[FB-WEBHOOK] Raw data received:\n', raw);
        // Always return 200 immediately to Facebook, process async
        await this.facebookService.handleWebhook(body);
        return { status: 'ok' };
    }

    // ── Direct Lead Push (POST — public, from 3rd-party CRM/plugins) ──────
    // Accepts both JSON and form-encoded bodies regardless of Content-Type.
    // Maps fields like FIRST_NAME, PHONE, CITY → CreateLeadDto and ingests.
    @Post('lead-push')
    @HttpCode(200)
    async leadPush(@Req() req: any) {
        const typedReq = req as RawBodyRequest<Request>;
        const rawBody = typedReq.rawBody?.toString() ?? '';
        console.log('[LEAD-PUSH] Raw data received:');
        console.log('  Content-Type:', req.headers['content-type']);
        console.log('  Raw body:\n', rawBody);
        return this.facebookService.handleDirectLeadPush(rawBody);
    }

    // ── Config ────────────────────────────────────────────────────────────
    @Get('config')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiBearerAuth()
    async listConfigs() {
        return this.facebookService.listConfigs();
    }

    @Put('config')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiBearerAuth()
    async saveConfig(
        @Body() body: { pageId: string; pageName?: string; accessToken: string; appSecret?: string },
    ) {
        return this.facebookService.saveConfig(body);
    }

    @Delete('config/:configId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiBearerAuth()
    @HttpCode(204)
    async deleteConfig(@Param('configId') configId: string) {
        return this.facebookService.deleteConfig(configId);
    }

    @Patch('config/:configId/active')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiBearerAuth()
    async toggleConfigActive(
        @Param('configId') configId: string,
        @Body() body: { isActive: boolean },
    ) {
        return this.facebookService.toggleConfigActive(configId, body.isActive);
    }

    // ── Forms ─────────────────────────────────────────────────────────────
    @Get('forms')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiBearerAuth()
    async listForms() {
        return this.facebookService.listForms();
    }

    @Post('forms/import')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiBearerAuth()
    async importForms(@Body() body: { pageId: string }) {
        return this.facebookService.importForms(body.pageId);
    }

    // ── Offline CSV Uploads ───────────────────────────────────────────────

    @Post('forms/upload-new')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiBearerAuth()
    @UseInterceptors(FileInterceptor('file'))
    async uploadNewFormCsv(@UploadedFile() file: Express.Multer.File) {
        return this.facebookService.processNewFormCsv(file);
    }

    @Post('forms/:formId/upload')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiBearerAuth()
    @UseInterceptors(FileInterceptor('file'))
    async uploadCsvToExistingForm(
        @Param('formId') formId: string,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.facebookService.processCsvForExistingForm(formId, file);
    }

    @Patch('forms/:formId/mapping')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiBearerAuth()
    async updateMapping(
        @Param('formId') formId: string,
        @Body() body: { fieldMapping: Record<string, string>; leadCategory?: string },
    ) {
        return this.facebookService.updateMapping(formId, body.fieldMapping, body.leadCategory);
    }

    @Patch('forms/:formId/sync')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiBearerAuth()
    async toggleSync(
        @Param('formId') formId: string,
        @Body() body: { syncEnabled: boolean },
    ) {
        return this.facebookService.toggleSync(formId, body.syncEnabled);
    }
}
