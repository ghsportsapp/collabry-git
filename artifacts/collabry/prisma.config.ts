import { defineConfig } from 'prisma/config'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
  datasource: {
    url: connectionString ?? '',
  },
  migrate: {
    adapter: async () => {
      if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not set')
      }
      const { default: pg } = await import('pg')
      const pool = new pg.Pool({ connectionString })
      return new PrismaPg(pool)
    },
  },
})
