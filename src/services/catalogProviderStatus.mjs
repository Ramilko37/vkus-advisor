export function parseEnvBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return String(value).toLocaleLowerCase("en-US") === "true";
}

export function createCatalogProviderStatus({
  env,
  catalogMode,
  lentaStoreResolved,
  pyaterochkaConnected,
  pyaterochkaStoreState,
  yandexEatsStatus,
}) {
  const lentaEnabled = parseEnvBoolean(env.LENTA_ENABLED, true);
  const lavkaEnabled = parseEnvBoolean(env.LAVKA_ENABLED, false);
  const pyaterochkaConfigured = Boolean(env.PYATEROCHKA_MCP_URL);
  return {
    catalogMode,
    lentaEnabled,
    pyaterochkaConfigured,
    pyaterochkaConnected,
    providers: {
      yandexEats: yandexEatsStatus ?? {
        enabled: parseEnvBoolean(env.YANDEX_EATS_RETAIL_ENABLED) && ["candidates_only", "validated"].includes(env.YANDEX_EATS_RETAIL_MODE),
        mode: parseEnvBoolean(env.YANDEX_EATS_RETAIL_ENABLED) && ["candidates_only", "validated"].includes(env.YANDEX_EATS_RETAIL_MODE) ? "candidates_only" : "disabled",
        connected: false,
      },
      vkusvill: {
        configured: true,
        connected: catalogMode === "live",
      },
      lenta: {
        enabled: lentaEnabled,
        store: lentaStoreResolved ? "resolved" : "missing",
      },
      lavka: {
        enabled: lavkaEnabled,
        configured: Boolean(env.YANDEX_LAVKA_SESSION_JSON),
      },
      pyaterochka: {
        configured: pyaterochkaConfigured,
        connected: pyaterochkaConnected,
        store: pyaterochkaStoreState,
      },
    },
  };
}
