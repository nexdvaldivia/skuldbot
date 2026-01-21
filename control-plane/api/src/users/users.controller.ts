import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from './entities/user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  async findAll(@Query('clientId') clientId?: string): Promise<UserResponseDto[]> {
    return this.usersService.findAll(clientId);
  }

  @Get(':id')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SKULD_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SKULD_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: User,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto, currentUser);
  }

  @Delete(':id')
  @Roles(UserRole.SKULD_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
  ): Promise<void> {
    return this.usersService.delete(id, currentUser);
  }

  @Post(':id/activate')
  @Roles(UserRole.SKULD_ADMIN)
  async activate(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.activate(id);
  }

  @Post(':id/suspend')
  @Roles(UserRole.SKULD_ADMIN)
  async suspend(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
  ): Promise<UserResponseDto> {
    return this.usersService.suspend(id, currentUser);
  }
}
