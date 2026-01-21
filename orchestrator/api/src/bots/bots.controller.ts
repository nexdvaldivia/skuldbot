import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { BotsService } from './bots.service';
import {
  CreateBotDto,
  UpdateBotDto,
  CreateBotVersionDto,
  UpdateBotVersionDto,
  ListBotsQueryDto,
  PublishVersionDto,
  CloneBotDto,
  ExportBotDto,
  ImportBotDto,
  ShareBotDto,
  ToggleFavoriteDto,
  DeprecateVersionDto,
} from './dto/create-bot.dto';
import { CompileBotDto, CompileResultDto } from './dto/compile-bot.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantId } from '../common/decorators/current-tenant.decorator';
import { User } from '../users/entities/user.entity';

@Controller('bots')
@UseGuards(JwtAuthGuard, TenantGuard)
export class BotsController {
  constructor(private readonly botsService: BotsService) {}

  // Bot endpoints

  @Post()
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateBotDto,
  ) {
    return this.botsService.create(tenantId, dto, user);
  }

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Query() query: ListBotsQueryDto,
  ) {
    return this.botsService.findAll(tenantId, query, user);
  }

  @Get(':botId')
  findOne(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
  ) {
    return this.botsService.findOne(tenantId, botId, user);
  }

  @Put(':botId')
  update(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
    @Body() dto: UpdateBotDto,
  ) {
    return this.botsService.update(tenantId, botId, dto, user);
  }

  @Delete(':botId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
  ) {
    return this.botsService.remove(tenantId, botId, user);
  }

  @Post(':botId/archive')
  archive(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
  ) {
    return this.botsService.archive(tenantId, botId, user);
  }

  @Post(':botId/restore')
  restore(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
  ) {
    return this.botsService.restore(tenantId, botId, user);
  }

  @Post(':botId/clone')
  clone(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
    @Body() dto: CloneBotDto,
  ) {
    return this.botsService.clone(tenantId, botId, dto, user);
  }

  @Post(':botId/export')
  exportBot(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
    @Body() dto: ExportBotDto,
  ) {
    return this.botsService.exportBot(tenantId, botId, dto, user);
  }

  @Post('import')
  importBot(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Body() dto: ImportBotDto,
  ) {
    return this.botsService.importBot(tenantId, dto, user);
  }

  @Put(':botId/sharing')
  updateSharing(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
    @Body() dto: ShareBotDto,
  ) {
    return this.botsService.updateSharing(tenantId, botId, dto, user);
  }

  @Post(':botId/favorite')
  toggleFavorite(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
    @Body() dto: ToggleFavoriteDto,
  ) {
    return this.botsService.toggleFavorite(tenantId, botId, dto, user);
  }

  // Version endpoints

  @Post(':botId/versions')
  createVersion(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
    @Body() dto: CreateBotVersionDto,
  ) {
    return this.botsService.createVersion(tenantId, botId, dto, user);
  }

  @Get(':botId/versions')
  findVersions(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
  ) {
    return this.botsService.findVersions(tenantId, botId, user);
  }

  @Get(':botId/versions/latest')
  getLatestPublished(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
  ) {
    return this.botsService.getLatestPublishedVersion(tenantId, botId, user);
  }

  @Get(':botId/versions/:versionId')
  findVersion(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.botsService.findVersion(tenantId, botId, versionId, user);
  }

  @Put(':botId/versions/:versionId')
  updateVersion(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
    @Param('versionId') versionId: string,
    @Body() dto: UpdateBotVersionDto,
  ) {
    return this.botsService.updateVersion(tenantId, botId, versionId, dto, user);
  }

  @Delete(':botId/versions/:versionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVersion(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.botsService.deleteVersion(tenantId, botId, versionId, user);
  }

  // Compilation endpoint

  @Post(':botId/versions/:versionId/compile')
  compile(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
    @Param('versionId') versionId: string,
    @Body() dto: CompileBotDto,
  ): Promise<CompileResultDto> {
    return this.botsService.compileVersion(tenantId, botId, versionId, dto, user);
  }

  // Publish endpoint

  @Post(':botId/versions/:versionId/publish')
  publish(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
    @Param('versionId') versionId: string,
    @Body() dto: PublishVersionDto,
  ) {
    return this.botsService.publishVersion(tenantId, botId, versionId, dto, user);
  }

  @Post(':botId/versions/:versionId/deprecate')
  deprecate(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId') botId: string,
    @Param('versionId') versionId: string,
    @Body() dto: DeprecateVersionDto,
  ) {
    return this.botsService.deprecateVersion(tenantId, botId, versionId, dto, user);
  }
}
