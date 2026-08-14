/**
 * 跨页离开提醒的极简守卫。
 *
 * 录入网格在「有未保存修改」时把 `canLeave` 设成返回 false；
 * AppShell 切换页签前调用它，返回 false 就先跟用户确认再跳。
 * 这是给 SPA 内部导航用的 —— 真正的「关页面 / 刷新」由 `beforeunload` 覆盖。
 */
export const navigationGuard: { canLeave: () => boolean } = {
  canLeave: () => true,
};
