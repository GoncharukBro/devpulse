import { Migration } from '@mikro-orm/migrations';

export class Migration20260313000000_add_type_field_name extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE field_mappings
        ADD COLUMN type_field_name text NOT NULL DEFAULT 'Type';
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE field_mappings
        DROP COLUMN type_field_name;
    `);
  }
}
