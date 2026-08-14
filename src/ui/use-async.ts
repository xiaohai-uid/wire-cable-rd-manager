import { useCallback, useEffect, useState } from 'react';

/**
 * 异步读取的三态。
 *
 * 刻意用可辨识联合而不是 `{ data, loading, error }` 三个独立字段 ——
 * 后者允许出现「loading 为 true 同时 data 有值同时 error 也有值」这种不存在的状态，
 * 而界面必须为每种组合写分支。这里三态互斥，漏了哪个分支编译器会说话。
 */
export type Async<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: Error }
  | { readonly status: 'ready'; readonly data: T };

export interface AsyncResult<T> {
  readonly state: Async<T>;
  readonly reload: () => void;
}

export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]): AsyncResult<T> {
  const [state, setState] = useState<Async<T>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  // load 每次渲染都是新函数，依赖数组由调用方显式给出（和 useEffect 一致的约定）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });

    run().then(
      (data) => {
        if (alive) setState({ status: 'ready', data });
      },
      (cause: unknown) => {
        if (alive) {
          setState({
            status: 'error',
            error: cause instanceof Error ? cause : new Error(String(cause)),
          });
        }
      },
    );

    return () => {
      alive = false;
    };
  }, [run, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { state, reload };
}
