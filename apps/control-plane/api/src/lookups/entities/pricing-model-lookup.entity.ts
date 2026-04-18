import { Entity } from 'typeorm';
import { LookupBaseEntity } from './lookup-base.entity';

@Entity('cp_pricing_model_lookups')
export class PricingModelLookup extends LookupBaseEntity {}
