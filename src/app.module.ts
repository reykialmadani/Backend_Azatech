import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProductsModule } from './products/products.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [PrismaModule, AuthModule, ProductsModule, CustomersModule, OrdersModule, DashboardModule, HealthModule],
})
export class AppModule {}
