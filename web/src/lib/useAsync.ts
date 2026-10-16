import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** 手动重新拉取（写操作之后调用） */
  reload: () => void;
}

/**
 * 最小的异步数据获取 hook。
 * 刻意不引 React Query：这里只有"取一次、写完之后重取一次"这一种模式，
 * 一个 40 行的 hook 就够，而查询库会带来缓存策略、失效、重试等一整套需要学习的状态。
 *
 * @param fetcher 返回 Promise 的函数；用 useCallback 包好以免每次渲染都重取
 * @param deps 变化时重新拉取
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // 用 ref 存最新 fetcher，避免把它放进依赖导致无限循环
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // 最后一次请求的序号：过期响应直接丢弃，避免快速切换月份时旧数据覆盖新数据
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((result) => {
        if (cancelled || id !== requestId.current) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled || id !== requestId.current) return;
        setError(err instanceof ApiError ? err.message : "加载失败，请稍后重试");
      })
      .finally(() => {
        if (cancelled || id !== requestId.current) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload };
}
