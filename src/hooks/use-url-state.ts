import { useLocation, useRouter } from "@tanstack/react-router";
import { useCallback, useRef, type SetStateAction } from "react";

type SearchRecord = Record<string, unknown>;
type HistoryMode = "push" | "replace";

type UrlParamConfig<T> = {
  defaultValue: T;
  parse: (value: string | undefined) => T;
  serialize: (value: T) => string | undefined;
  history?: HistoryMode;
};

export type UrlSearchUpdate = Record<
  string,
  string | number | boolean | null | undefined
>;

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return firstString(value[0]);
  return undefined;
}

/**
 * Updates the current route's search parameters through TanStack Router.
 * Discrete controls push history by default; callers can replace for free-text input.
 */
export function useUrlSearchUpdater() {
  const router = useRouter();

  return useCallback(
    (updates: UrlSearchUpdate, history: HistoryMode = "push") => {
      const current = router.latestLocation;
      const search: SearchRecord = { ...(current.search as SearchRecord) };
      let changed = false;

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === null || value === "") {
          if (key in search) {
            delete search[key];
            changed = true;
          }
          continue;
        }

        const serialized = String(value);
        if (firstString(search[key]) !== serialized) {
          search[key] = serialized;
          changed = true;
        }
      }

      if (!changed) return;
      void router.navigate({
        to: current.pathname,
        search,
        hash: true,
        replace: history === "replace",
        resetScroll: false,
      } as never);
    },
    [router],
  );
}

/** A useState-like value backed by a URL search parameter. */
export function useUrlParam<T>(key: string, config: UrlParamConfig<T>) {
  const rawValue = useLocation({
    select: (location) => firstString((location.search as SearchRecord)[key]),
  });
  const router = useRouter();
  const configRef = useRef(config);
  configRef.current = config;
  const value = config.parse(rawValue);

  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      const activeConfig = configRef.current;
      const current = router.latestLocation;
      const search: SearchRecord = { ...(current.search as SearchRecord) };
      const currentValue = activeConfig.parse(firstString(search[key]));
      const resolved =
        typeof next === "function"
          ? (next as (value: T) => T)(currentValue)
          : next;
      const serialized = activeConfig.serialize(resolved);
      const defaultSerialized = activeConfig.serialize(
        activeConfig.defaultValue,
      );
      const nextSerialized =
        serialized === undefined || serialized === defaultSerialized
          ? undefined
          : serialized;
      const currentSerialized = firstString(search[key]);

      if (nextSerialized === undefined) {
        if (currentSerialized === undefined) return;
        delete search[key];
      } else {
        if (currentSerialized === nextSerialized) return;
        search[key] = nextSerialized;
      }

      void router.navigate({
        to: current.pathname,
        search,
        hash: true,
        replace: activeConfig.history === "replace",
        resetScroll: false,
      } as never);
    },
    [key, router],
  );

  return [value, setValue] as const;
}

export function stringParam(
  defaultValue = "",
  history: HistoryMode = "replace",
): UrlParamConfig<string> {
  return {
    defaultValue,
    history,
    parse: (value) => value ?? defaultValue,
    serialize: (value) => value || undefined,
  };
}

export function enumParam<const T extends string>(
  values: readonly T[],
  defaultValue: T,
  history: HistoryMode = "push",
): UrlParamConfig<T> {
  return {
    defaultValue,
    history,
    parse: (value) =>
      values.includes(value as T) ? (value as T) : defaultValue,
    serialize: (value) => value,
  };
}

export function booleanParam(
  defaultValue = false,
  history: HistoryMode = "push",
): UrlParamConfig<boolean> {
  return {
    defaultValue,
    history,
    parse: (value) =>
      value === undefined ? defaultValue : value === "1" || value === "true",
    serialize: (value) => (value ? "1" : undefined),
  };
}

export function positiveIntParam(
  defaultValue = 1,
  history: HistoryMode = "push",
): UrlParamConfig<number> {
  return {
    defaultValue,
    history,
    parse: (value) => {
      const parsed = Number.parseInt(value ?? "", 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
    },
    serialize: (value) => String(Math.max(1, Math.trunc(value))),
  };
}

export function stringListParam(
  history: HistoryMode = "push",
): UrlParamConfig<string[]> {
  return {
    defaultValue: [],
    history,
    parse: (value) =>
      value
        ? [
            ...new Set(
              value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            ),
          ]
        : [],
    serialize: (value) =>
      value.length ? [...new Set(value)].join(",") : undefined,
  };
}
