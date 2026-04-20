import { Entity } from 'typeorm';
import { LookupBaseEntity } from './lookup-base.entity';

@Entity('cp_marketplace_bot_status_lookups')
export class MarketplaceBotStatusLookup extends LookupBaseEntity {}
