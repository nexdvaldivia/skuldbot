import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from './typeorm-options';

const options = buildTypeOrmOptions(process.env);

export default new DataSource({
  ...options,
  synchronize: false,
  logging: false,
});
