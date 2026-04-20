import { Entity } from 'typeorm';
import { LookupBaseEntity } from './lookup-base.entity';

@Entity('cp_bot_category_lookups')
export class BotCategoryLookup extends LookupBaseEntity {}
