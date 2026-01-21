import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import {
  CreateClientDto,
  UpdateClientDto,
  ClientResponseDto,
  ClientDetailResponseDto,
} from './dto/client.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  async findAll(): Promise<ClientResponseDto[]> {
    return this.clientsService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  async findOne(@Param('id') id: string): Promise<ClientDetailResponseDto> {
    return this.clientsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SKULD_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateClientDto): Promise<ClientDetailResponseDto> {
    return this.clientsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientDetailResponseDto> {
    return this.clientsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SKULD_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.clientsService.delete(id);
  }

  @Post(':id/activate')
  @Roles(UserRole.SKULD_ADMIN)
  async activate(@Param('id') id: string): Promise<ClientDetailResponseDto> {
    return this.clientsService.activate(id);
  }

  @Post(':id/suspend')
  @Roles(UserRole.SKULD_ADMIN)
  async suspend(@Param('id') id: string): Promise<ClientDetailResponseDto> {
    return this.clientsService.suspend(id);
  }
}
