import { Entity } from 'typeorm';
import { LookupBaseEntity } from './lookup-base.entity';

@Entity('cp_marketplace_subscription_status_lookups')
export class MarketplaceSubscriptionStatusLookup extends LookupBaseEntity {}
