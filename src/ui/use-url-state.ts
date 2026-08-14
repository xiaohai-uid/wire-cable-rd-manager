import { useCallback, useEffect, useState } from 'react';

/**
 * URL 状态。刷新后界面停在原处，链接可以直接发给同事。
 *
 * 两个刻意的选择：
 *
 * 1. **不引入路由库。** ADR 0002 的技术栈里没有它，这里也确实不需要 ——
 *    整个应用的状态就是「选中了哪个格子」「在录哪个批次」这几个参数。
 * 2. **状态放在查询参数里，而不是路径段里。** 部署在 GitHub Pages 时，
 *    `/wire-cable-rd-manager/batch/RV-20260601` 这样的路径会直接 404（静态托管不认它，
 *    也没有服务端能重写），得靠 404.html 兜回来那类偏方。
 *    查询参数不碰路径，静态托管天然就对。
 */
export type UrlParams = Readonly<Record<string, string | undefined>>;

function read(): UrlParams {
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(window.location.search)) params[k] = v;
  return params;
}

export interface UrlState {
  readonly params: UrlParams;
  /** 合并写入；值传 undefined 表示删掉这个参数。opts.replace 为 true 时改用 replaceState，避免瞬时态（如热力图选区）污染历史栈 */
  readonly setParams: (patch: UrlParams, opts?: { replace?: boolean }) => void;
}

export function useUrlState(): UrlState {
  const [params, setLocal] = useState<UrlParams>(read);

  // 浏览器前进 / 后退
  useEffect(() => {
    const onPop = () => setLocal(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setParams = useCallback((patch: UrlParams, opts?: { replace?: boolean }) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (opts?.replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    setLocal(read());
  }, []);

  return { params, setParams };
}
