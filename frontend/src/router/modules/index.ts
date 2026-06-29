import type { AppRouteRecord } from '@/types/router'
import { monitorRoutes } from './monitor'
import { systemRoutes } from './system'

/**
 * 导出所有模块化路由
 */
export const routeModules: AppRouteRecord[] = [
  monitorRoutes,
  systemRoutes
]
